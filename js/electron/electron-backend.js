// -------------------------------------------------------------
// This helper imitates a backend API when using the Electron
// desktop app. It saves a flat file JSON structure in the application
// userdata folder.
// -------------------------------------------------------------

import path from 'path'
import { remote } from 'electron'
import fs from 'fs'
import uuidv4 from 'uuid/v4'
import _ from 'lodash'
import * as d3 from "d3"
import os from 'os'
import { getPlotImageKey, heatMapRGBForValue, getScales, getPolygonCenter } from '../lib/utilities'
import constants from '../lib/constants'
import PersistentHomology from '../lib/persistent-homology.js'
import { fork } from 'child_process'
import GrahamScan from '../lib/graham-scan.js'
import pointInsidePolygon from 'point-in-polygon'
import { distanceToPolygon, distanceBetweenPoints } from 'distance-to-polygon'
import isDev from 'electron-is-dev'
import applicationReducer from '../reducers/application-reducer'
import { setBackgroundJobsEnabled, setPlotDimensions, setPlotDisplayDimensions, toggleShowDisabledParameters } from '../actions/application-actions'
import { updateSample, removeSample, setSamplePlotImage, setSampleParametersLoading } from '../actions/sample-actions'
import { updateGateTemplate, removeGateTemplate } from '../actions/gate-template-actions'
import { removeGateTemplateGroup } from '../actions/gate-template-group-actions'
import { updateFCSFile, removeFCSFile } from '../actions/fcs-file-actions'
import { createWorkspace, selectWorkspace, removeWorkspace, updateWorkspace,
    createFCSFileAndAddToWorkspace, selectFCSFile,
    createSampleAndAddToWorkspace, createSubSampleAndAddToWorkspace, selectSample, invertPlotAxis,
    createGateTemplateAndAddToWorkspace, selectGateTemplate,
    createGateTemplateGroupAndAddToWorkspace, toggleFCSParameterEnabled } from '../actions/workspace-actions'

window.d3 = d3

import request from 'request'

// Debug imports below
// import getImageForPlotBackend from '../lib/get-image-for-plot'

// Fork a new node process for doing CPU intensive jobs
let workerFork
if (isDev) {
    workerFork = fork(__dirname + '/js/electron/subprocess-wrapper-dev.js', [], { silent: true })
} else {
    workerFork = fork(__dirname + '/webpack-build/fork.bundle.js', [], { silent: true })
}

const jobQueue = []
const priorityQueue = []

const processJob = async function () {
    const currentJob = priorityQueue.length > 0 ? priorityQueue.splice(0, 1) : jobQueue.splice(0, 1)
    if (currentJob.length === 0) {
        return false
    } else {
        console.log('current job', )
        const result = await new Promise((resolve, reject) => {
            request.post(currentJob[0].jobParameters, function (error, response, body) {
                if (error) {
                    reject(error)
                }
                resolve(body)
            });
        })

        if (result) {
            currentJob[0].callback(result)
        }
    }
}

const processJobs = async function () {
    while (true) {
        const result = await processJob()
        if (result === false) {
            await new Promise((resolve, reject) => { setTimeout(() => { resolve() }, 1000) })
        }
    }
}

for (let i = 0; i < Math.max(os.cpus().length - 2, 1); i++) {
    processJobs()
}

workerFork.stdout.on('data', (result) => {
    if (reduxStore.getState().sessionLoading && !reduxStore.getState().sessionBroken) {
        const action = {
            type: 'SET_SESSION_LOADING',
            payload: {
                sessionLoading: false
            }
        }
        currentState = applicationReducer(currentState, action)
        reduxStore.dispatch(action)

        if (currentState.selectedWorkspaceId) {
            const workspace = _.find(currentState.workspaces, w => w.id === currentState.selectedWorkspaceId)
            for (let sample of currentState.samples) {
                getAllPlotImages(sample, { selectedXScale: workspace.selectedXScale, selectedYScale: workspace.selectedYScale })
                api.applyGateTemplatesToSample(sample.id)
            }
        }
    }
    console.log(result.toString('utf8'))
})

workerFork.stderr.on('data', (result) => {
    console.log(result.toString('utf8'))
})

// Wrap the read and write file functions from FS in promises
const readFile = (path, opts = 'utf8') => {
    return new Promise((res, rej) => {
        fs.readFile(path, opts, (err, data) => {
            if (err) rej(err)
            else res(data)
        })
    })
}

// Wrap the read and write file functions from FS in promises
const readFileBuffer = (path) => {
    return new Promise((res, rej) => {
        fs.readFile(path, (err, buffer) => {
            if (err) rej(err)
            else res(buffer)
        })
    })
}

const writeFile = (path, data, opts = 'utf8') => {
    return new Promise((res, rej) => {
        fs.writeFile(path, data, opts, (err) => {
            if (err) rej(err)
            else res()
        })
    })
}

const filteredSampleAttributes = ['includeEventIds']

// Cache the state after it's been read from disk, then write it back after every update
let currentState = {}

let reduxStore = {}

const populationDataCache = {}

const getFCSMetadata = async (filePath) => {
    const jobId = uuidv4()

    const metadata = await new Promise((resolve, reject) => {
        priorityQueue.push({
            jobParameters: { url: 'http://127.0.0.1:3145', json: { jobId: jobId, type: 'get-fcs-metadata', payload: { filePath } } },
            callback: (data) => { resolve(data) }
        })
    })

    return metadata
}

// Generates an image for a 2d scatter plot
const getImageForPlot = async (sample, FCSFile, options, priority) => {
    options.directory = remote.app.getPath('userData')
    options.machineType = FCSFile.machineType
    options.plotWidth = currentState.plotWidth
    options.plotHeight = currentState.plotHeight
    if (sample.plotImages[getPlotImageKey(options)]) { return sample.plotImages[getPlotImageKey(options)] }

    const jobId = uuidv4()

    const imagePath = await new Promise((resolve, reject) => {
        const queueToPush = priority ? priorityQueue : jobQueue
        queueToPush.push({
            jobParameters: { url: 'http://127.0.0.1:3145', json: { jobId: jobId, type: 'get-image-for-plot', payload: { sample, FCSFile, options } } },
            callback: (data) => { resolve(data) }
        })
    })

    return imagePath
}

const getAllPlotImages = async (sample, scales) => {
    const workspace = _.find(currentState.workspaces, w => w.sampleIds.includes(sample.id))
    const FCSFile = _.find(currentState.FCSFiles, fcs => sample.FCSFileId === fcs.id)
    let combinations = []

    for (let x = 2; x < FCSFile.FCSParameters.length; x++) {
        for (let y = x + 1; y < FCSFile.FCSParameters.length; y++) {
            const options = {
                selectedXParameterIndex: workspace.invertedAxisPlots[x + '_' + y] ? y : x,
                selectedYParameterIndex: workspace.invertedAxisPlots[x + '_' + y] ? x : y,
                selectedXScale: scales.selectedXScale,
                selectedYScale: scales.selectedYScale,
                machineType: FCSFile.machineType
            }
            if (!sample.plotImages[getPlotImageKey(options)]) {
                combinations.push(options)
            }
        }
    }

    const createImage = async () => {
        if (combinations.length > 0) {
            const options = combinations.splice(0, 1)[0]
            let FCSFileUpdated = _.find(currentState.FCSFiles, fcs => sample.FCSFileId === fcs.id)
            // If the machine type has changed, cancel the calculation of the plot images
            if (options.machineType !== FCSFileUpdated.machineType) {
                console.log('Changed machine type, abandoning image generation')
                return
            }

            // If background jobs get disabled, just wait here until they get enabled again
            if (!currentState.backgroundJobsEnabled) {
                await new Promise((resolve, reject) => {
                    const intervalToken = setInterval(() => {
                        if (currentState.backgroundJobsEnabled) {
                            resolve()
                            clearInterval(intervalToken)
                        }
                    }, 1000)
                })
            }

            // If this parameter was disabled, don't bother calculating the image
            if (!workspace.disabledParameters[FCSFile.FCSParameters[options.selectedXParameterIndex].key]
                && !workspace.disabledParameters[FCSFile.FCSParameters[options.selectedYParameterIndex].key]) {
                
                // Generate the cached images
                const imageForPlot = await getImageForPlot(sample, FCSFile, options)                
                const imageAction = setSamplePlotImage(sample.id, getPlotImageKey(options), imageForPlot)
                currentState = applicationReducer(currentState, imageAction)
                reduxStore.dispatch(imageAction)

                await saveSessionToDisk()
            }

            // Samples can be deleted while in the middle of calculating images, we should abort if this happens
            if (_.find(currentState.samples, s => s.id === sample.id)) {
                createImage()
            }
        }
    }

    for (let i = 0; i < Math.max(os.cpus().length - 2, 1); i++) {
        createImage(i)
    }
}

// Calculate 1d density using kernel density estimation for drawing histograms
function kernelDensityEstimator(kernel, X) {
  return function(V) {
    return X.map(function(x) {
      return [x, d3.mean(V, function(v) { return kernel(x - v); })];
    });
  };
}

function kernelEpanechnikov(k) {
  return function(v) {
    return Math.abs(v /= k) <= 1 ? 0.75 * (1 - v * v) / k : 0;
  };
}

const sessionFilePath = path.join(remote.app.getPath('userData'), 'session.json')

// -------------------------------------------------------------
// Exported functions below
// -------------------------------------------------------------

// Keep a copy of the redux store and dispatch events
export const setStore = (store) => { reduxStore = store }

// Write the whole session to the disk
export const saveSessionToDisk = async function () {
    // Save the new state to the disk
    fs.writeFile(sessionFilePath, JSON.stringify(currentState), () => {})
}

// Load the workspaces and samples the user last had open when the app was used
export const api = {
    // Reset the session by deleting the session file off the disk
    resetSession: async function () {
        fs.unlinkSync(sessionFilePath)
        await api.getSession()
    },

    getSession: async function () {
        try {
            currentState = JSON.parse(await readFile(sessionFilePath))
        } catch (error) {
            // If there's no session file, create one
            if (error.code === 'ENOENT') {
                try {
                    const defaultState = reduxStore.getState()
                    writeFile(sessionFilePath, JSON.stringify(defaultState))
                    currentState = defaultState
                } catch (error) {
                    console.log(error)
                }
            } else {
                console.log(error)
            }
        }

        // Clone the whole state so that object references aren't accidentally reused
        const uiState = _.cloneDeep(currentState)

        // Filter out the attributes that are only for the backend,
        // e.g. large FCS file data
        for (let sample of uiState.samples) {
            for (let filteredAttribute of filteredSampleAttributes) {
                delete sample[filteredAttribute]
            }
        }

        try {
            reduxStore.dispatch({ type: 'SET_SESSION_BROKEN', payload: { sessionBroken: false } })
            reduxStore.dispatch({ type: 'SET_SESSION_STATE', payload: uiState })
        } catch (error) {
            reduxStore.dispatch({ type: 'SET_SESSION_BROKEN', payload: { sessionBroken: true } })
            console.log(error)
        }

        // After reading the session, if there's no workspace, create a default one
        if (currentState.workspaces.length === 0) {
            const workspaceId = await api.createWorkspace({ title: 'New Workspace', description: 'New Workspace' })
            await api.selectWorkspace(workspaceId)
        }
    },

    setBackgroundJobsEnabled: async function (backgroundJobsEnabled) {
        const action = setBackgroundJobsEnabled(backgroundJobsEnabled)
        currentState = applicationReducer(currentState, action)
        reduxStore.dispatch(action)

        await saveSessionToDisk()
    },

    setPlotDisplayDimensions: async function (plotWidth, plotHeight) {
        const action = setPlotDisplayDimensions(plotWidth, plotHeight)
        currentState = applicationReducer(currentState, action)
        reduxStore.dispatch(action)

        await saveSessionToDisk()
    },

    toggleShowDisabledParameters: async function () {
        const action = toggleShowDisabledParameters()
        currentState = applicationReducer(currentState, action)
        reduxStore.dispatch(action)

        await saveSessionToDisk()
    },

    createWorkspace: async function (parameters) {
        const workspaceId = uuidv4()

        const newWorkspace = {
            id: workspaceId,
            title: parameters.title,
            description: parameters.description,
            selectedXScale: parameters.selectedXScale || constants.SCALE_LOG,
            selectedYScale: parameters.selectedYScale || constants.SCALE_LOG,
            FCSFileIds: [],
            sampleIds: [],
            gateTemplateIds: [],
            gateTemplateGroupIds: [],
            disabledParameters: {},
            hideUngatedPlots: false,
            invertedAxisPlots: {}
        }

        const createAction = createWorkspace(newWorkspace)
        currentState = applicationReducer(currentState, createAction)
        reduxStore.dispatch(createAction)

        saveSessionToDisk()

        // Add an empty Gate Template
        const gateTemplateId = await api.createGateTemplateAndAddToWorkspace(workspaceId, { title: 'New Gating Strategy' })
        await api.selectGateTemplate(gateTemplateId, workspaceId)

        return newWorkspace.id
    },

    selectWorkspace: async function (workspaceId) {
        const selectAction = selectWorkspace(workspaceId)
        currentState = applicationReducer(currentState, selectAction)
        reduxStore.dispatch(selectWorkspace(workspaceId))

        saveSessionToDisk()
    },

    // TODO: Select the closest workspace after removing it
    removeWorkspace: async function (workspaceId) {
        const removeAction = removeWorkspace(workspaceId)
        currentState = applicationReducer(currentState, removeAction)
        reduxStore.dispatch(removeAction)

        saveSessionToDisk()
    },

    createGateTemplateAndAddToWorkspace: async function (workspaceId, gateTemplateParameters) {
        const gateTemplateId = uuidv4()

        // Create a Gate Template for this parameter combination
        const gateTemplate = {
            id: gateTemplateId,
            creator: gateTemplateParameters.creator,
            title: gateTemplateParameters.title,
            xGroup: gateTemplateParameters.xGroup,
            yGroup: gateTemplateParameters.yGroup,
            typeSpecificData: gateTemplateParameters.typeSpecificData,
        }

        const createGateTemplateAction = createGateTemplateAndAddToWorkspace(workspaceId, gateTemplate)
        currentState = applicationReducer(currentState, createGateTemplateAction)
        reduxStore.dispatch(createGateTemplateAction)

        saveSessionToDisk()

        return gateTemplateId
    },

    // Update a gate template with arbitrary parameters
    updateGateTemplateAndRecalculate: async function (gateTemplateId, parameters) {
        const updateAction = updateGateTemplate(gateTemplateId, parameters)
        currentState = applicationReducer(currentState, updateAction)
        reduxStore.dispatch(updateAction)

        // Update any child templates that depend on these
        const templateGroup = _.find(currentState.gateTemplateGroups, g => g.childGateTemplateIds.includes(gateTemplateId))
        await api.recalculateGateTemplateGroup(templateGroup.id)

        saveSessionToDisk()
    },

    selectGateTemplate: async function (gateTemplateId, workspaceId) {
        const selectAction = selectGateTemplate(gateTemplateId, workspaceId)
        currentState = applicationReducer(currentState, selectAction)
        reduxStore.dispatch(selectAction)

        saveSessionToDisk()
    },

    removeGateTemplateGroup: async function (gateTemplateGroupId) {
        const removeAction = removeGateTemplateGroup(gateTemplateGroupId)

        currentState = applicationReducer(currentState, removeAction)
        reduxStore.dispatch(removeAction)

        saveSessionToDisk()
    },

    recalculateGateTemplateGroup: async function (gateTemplateGroupId) {
        const templateGroup = _.find(currentState.gateTemplateGroups, g => g.id === gateTemplateGroupId)
        // Delete all child samples created as a result of this gate template group
        for (let sample of _.filter(currentState.samples, s => templateGroup.childGateTemplateIds.includes(s.gateTemplateId))) {
            const removeAction = removeSample(sample.id)
            currentState = applicationReducer(currentState, removeAction)
            reduxStore.dispatch(removeAction)
        }
        
        // Recalculate gates on all the parent samples
        const samplesToRecalculate = _.filter(currentState.samples, s => templateGroup.parentGateTemplateId === s.gateTemplateId).map(s => s.id)

        for (let sampleId of samplesToRecalculate) {
             api.applyGateTemplatesToSample(sampleId)
        }
    },

    applyGateTemplatesToSample: async function (sampleId) {
        const sample = _.find(currentState.samples, s => s.id === sampleId)
        // Find all template groups that apply to this sample
        const templateGroups = _.filter(currentState.gateTemplateGroups, g => g.parentGateTemplateId === sample.gateTemplateId)
        for (let templateGroup of templateGroups) {
            // If background jobs get disabled, just wait here until they get enabled again
            if (!currentState.backgroundJobsEnabled) {
                await new Promise((resolve, reject) => {
                    const intervalToken = setInterval(() => {
                        if (currentState.backgroundJobsEnabled) {
                            resolve()
                            clearInterval(intervalToken)
                        }
                    }, 1000)
                })
            }

            if (templateGroup.creator === constants.GATE_CREATOR_PERSISTENT_HOMOLOGY) {
                // If there hasn't been any gate templates generated for this sample, try generating them, otherwise leave them as they are
                if (!_.find(currentState.gates, g => g.parentSampleId === sampleId && templateGroup.childGateTemplateIds.includes(g.gateTemplateId))) {
                    const result = await api.calculateHomology(sampleId, {
                        selectedXParameterIndex: templateGroup.selectedXParameterIndex,
                        selectedYParameterIndex: templateGroup.selectedYParameterIndex,
                        selectedXScale: templateGroup.selectedXScale,
                        selectedYScale: templateGroup.selectedYScale,
                        machineType: templateGroup.machineType
                    })

                    if (result === false) {
                        return
                    }
                }
            }
        }

        // If homology was succesful, the sample will now have child samples
        const updatedSample = _.find(currentState.samples, s => s.id === sampleId)
        for (let subSampleId of updatedSample.subSampleIds) {
            await api.applyGateTemplatesToSample(subSampleId)
        }
    },

    createGateTemplateGroupAndAddToWorkspace: async function (workspaceId, gateTemplateGroupParameters) {
        const gateTemplateGroupId = uuidv4()

        // Create a Gate Template for this parameter combination
        const gateTemplateGroup = {
            id: gateTemplateGroupId,
            creator: gateTemplateGroupParameters.creator,
            title: gateTemplateGroupParameters.title,
            parentGateTemplateId: gateTemplateGroupParameters.parentGateTemplateId,
            childGateTemplateIds: gateTemplateGroupParameters.childGateTemplateIds,
            selectedXParameterIndex: gateTemplateGroupParameters.selectedXParameterIndex,
            selectedYParameterIndex: gateTemplateGroupParameters.selectedYParameterIndex,
            selectedXScale: gateTemplateGroupParameters.selectedXScale,
            selectedYScale: gateTemplateGroupParameters.selectedYScale,
            machineType: gateTemplateGroupParameters.machineType,
            expectedGates: gateTemplateGroupParameters.expectedGates,
            typeSpecificData: gateTemplateGroupParameters.typeSpecificData,
        }

        const createGateTemplateGroupAction = createGateTemplateGroupAndAddToWorkspace(workspaceId, gateTemplateGroup)
        currentState = applicationReducer(currentState, createGateTemplateGroupAction)
        reduxStore.dispatch(createGateTemplateGroupAction)

        saveSessionToDisk()
    },

    createFCSFileAndAddToWorkspace: async function (workspaceId, FCSFileParameters) {
        const FCSFileId = uuidv4()

        // Find the associated workspace
        let workspace = _.find(currentState.workspaces, w => w.id === workspaceId)

        let FCSFile = {
            id: FCSFileId,
            filePath: FCSFileParameters.filePath,
            title: FCSFileParameters.title,
            description: FCSFileParameters.description,
        }

        const createFCSFileAction = createFCSFileAndAddToWorkspace(workspaceId, FCSFile)
        currentState = applicationReducer(currentState, createFCSFileAction)
        reduxStore.dispatch(createFCSFileAction)

        const FCSMetaData = await getFCSMetadata(FCSFile.filePath)

        const updateAction = updateFCSFile(FCSFileId, FCSMetaData)
        currentState = applicationReducer(currentState, updateAction)
        reduxStore.dispatch(updateAction)

        const sampleId = uuidv4()
        const createSampleAction = createSampleAndAddToWorkspace(workspaceId, {
            id: sampleId,
            title: 'Root Sample',
            FCSFileId,
            description: 'Top level root sample for this FCS File',
            gateTemplateId: workspace.gateTemplateIds[0],
            populationCount: FCSMetaData.populationCount
        })
        currentState = applicationReducer(currentState, createSampleAction)
        reduxStore.dispatch(createSampleAction)

        const workspaceParameters = {
            selectedGateTemplateId: workspace.gateTemplateIds[0],
            selectedXScale: FCSMetaData.machineType === constants.MACHINE_CYTOF ? constants.SCALE_LOG : constants.SCALE_BIEXP,
            selectedYScale: FCSMetaData.machineType === constants.MACHINE_CYTOF ? constants.SCALE_LOG : constants.SCALE_BIEXP
        }

        const updateWorkspaceAction = updateWorkspace(workspaceId, workspaceParameters)
        currentState = applicationReducer(currentState, updateWorkspaceAction)
        reduxStore.dispatch(updateWorkspaceAction)

        const sample = _.find(currentState.samples, s => s.id === sampleId)
        getAllPlotImages(sample, workspaceParameters)

        saveSessionToDisk()

        // Recursively apply the existing gating hierarchy
        api.applyGateTemplatesToSample(sampleId)
    },

    removeFCSFile: async function (FCSFileId) {
        const removeAction = removeFCSFile(FCSFileId)

        currentState = applicationReducer(currentState, removeAction)
        reduxStore.dispatch(removeAction)

        saveSessionToDisk()
    },

    createSubSampleAndAddToWorkspace: async function (workspaceId, parentSampleId, sampleParameters, gateParameters) {
        const sampleId = sampleParameters.id || uuidv4()
        const gateId = gateParameters.id || uuidv4()

        // Find the associated workspace
        let workspace = _.find(currentState.workspaces, w => w.id === workspaceId)

        const parentSample = _.find(currentState.samples, s => s.id === parentSampleId)

        let sample = {
            id: sampleId,
            title: parentSample.title,
            FCSFileId: parentSample.FCSFileId,
            description: sampleParameters.description,
            gateTemplateId: sampleParameters.gateTemplateId,
            parametersLoading: [],
            // Below are defaults
            subSampleIds: [],
            plotImages: {}
        }

        const gate = {
            id: gateId,
            type: gateParameters.type,
            gateData: gateParameters.gateData,
            selectedXParameterIndex: gateParameters.selectedXParameterIndex,
            selectedYParameterIndex: gateParameters.selectedYParameterIndex,
            selectedXScale: gateParameters.selectedXScale,
            selectedYScale: gateParameters.selectedYScale,
            gateTemplateId: gateParameters.gateTemplateId,
            xCutoffs: gateParameters.xCutoffs,
            yCutoffs: gateParameters.yCutoffs
        }

        // If there was no title specified, auto generate one
        let title = 'Subsample'

        sample.populationCount = gateParameters.includeEventIds.length

        const backendSample = _.cloneDeep(sample)
        backendSample.includeEventIds = gateParameters.includeEventIds

        currentState = applicationReducer(currentState, createSubSampleAndAddToWorkspace(workspaceId, parentSampleId, backendSample, gate))
        reduxStore.dispatch(createSubSampleAndAddToWorkspace(workspaceId, parentSampleId, sample, gate))

        const updatedSample = _.find(currentState.samples, s => s.id === sample.id)

        getAllPlotImages(updatedSample, { selectedXScale: workspace.selectedXScale, selectedYScale: workspace.selectedYScale })

        saveSessionToDisk()
    },

    removeSample: async function (sampleId) {
        const removeAction = removeSample(sampleId)

        currentState = applicationReducer(currentState, removeAction)
        reduxStore.dispatch(removeAction)

        saveSessionToDisk()
    },


    selectFCSFile: async function (FCSFileId, workspaceId) {
        const selectAction = selectFCSFile(FCSFileId, workspaceId)
        currentState = applicationReducer(currentState, selectAction)
        reduxStore.dispatch(selectAction)

        saveSessionToDisk()
    },

    selectSample: async function (sampleId, workspaceId) {
        const sample = _.find(currentState.samples, s => s.id === sampleId)
        // Find the associated workspace
        const workspace = _.find(currentState.workspaces, w => w.id === workspaceId)
        // Get the currently selected gate template
        const selectedGateTemplate = _.find(currentState.gateTemplates, gt => gt.id === workspace.selectedGateTemplateId)
        // Select the related sub sample
        const relatedSample = _.find(currentState.samples, s => s.gateTemplateId === selectedGateTemplate.id && s.filePath === sample.filePath)

        const selectAction = selectSample(relatedSample.id, workspaceId)
        currentState = applicationReducer(currentState, selectAction)
        reduxStore.dispatch(selectAction)

        saveSessionToDisk()
    },

    // Update an FCSFile with arbitrary parameters
    updateFCSFile: async function (FCSFileId, parameters) {
        const updateAction = updateFCSFile(FCSFileId, parameters)
        currentState = applicationReducer(currentState, updateAction)
        reduxStore.dispatch(updateAction)

        saveSessionToDisk()

        // If the machine type was updated, recalculate gates and images
        if (parameters.machineType) {
            if (currentState.selectedWorkspaceId) {
                const workspace = _.find(currentState.workspaces, w => w.id === currentState.selectedWorkspaceId)
                const workspaceParameters = {
                    selectedXScale: parameters.machineType === constants.MACHINE_CYTOF ? constants.SCALE_LOG : constants.SCALE_BIEXP,
                    selectedYScale: parameters.machineType === constants.MACHINE_CYTOF ? constants.SCALE_LOG : constants.SCALE_BIEXP
                }

                await api.updateWorkspace(workspace.id, workspaceParameters)

                for (let sample of currentState.samples) {
                    getAllPlotImages(sample, workspaceParameters)
                    api.applyGateTemplatesToSample(sample.id)
                }
            }
        }
    },

    // Update a workspace with arbitrary parameters
    updateWorkspace: async function (workspaceId, parameters) {
        const updateWorkspaceAction = updateWorkspace(workspaceId, parameters)
        currentState = applicationReducer(currentState, updateWorkspaceAction)
        reduxStore.dispatch(updateWorkspaceAction)

        saveSessionToDisk()
    },

    getImageForPlot: async function (sampleId, options, priority) {
        const sample = _.find(currentState.samples, s => s.id === sampleId)
        const FCSFile = _.find(currentState.FCSFiles, fcs => fcs.id === sample.FCSFileId)
        const imageForPlot = await getImageForPlot(sample, FCSFile, options, priority)
        const imageAction = setSamplePlotImage(sample.id, getPlotImageKey(_.merge(options, FCSFile)), imageForPlot)
        currentState = applicationReducer(currentState, imageAction)
        reduxStore.dispatch(imageAction)

        await saveSessionToDisk()
    },

    // Toggle inversion of parameters for display of a particular plot
    invertPlotAxis: async function (workspaceId, selectedXParameterIndex, selectedYParameterIndex) {
        const updateWorkspaceAction = invertPlotAxis(workspaceId, selectedXParameterIndex, selectedYParameterIndex)
        currentState = applicationReducer(currentState, updateWorkspaceAction)
        reduxStore.dispatch(updateWorkspaceAction)

        saveSessionToDisk()

        if (currentState.selectedWorkspaceId) {
            const workspace = _.find(currentState.workspaces, w => w.id === currentState.selectedWorkspaceId)
            for (let sample of currentState.samples) {
                const FCSFile = _.find(currentState.FCSFiles, fcs => fcs.id === sample.FCSFileId)
                const options = { selectedXParameterIndex: selectedYParameterIndex, selectedYParameterIndex: selectedXParameterIndex, selectedXScale: workspace.selectedXScale, selectedYScale: workspace.selectedYScale, machineType: FCSFile.machineType }
                const imageForPlot = await getImageForPlot(sample, FCSFile, options)
                const imageAction = setSamplePlotImage(sample.id, getPlotImageKey(options), imageForPlot)
                currentState = applicationReducer(currentState, imageAction)
                reduxStore.dispatch(imageAction)

                await saveSessionToDisk()
            }
        }
    },

    toggleFCSParameterEnabled: async function (workspaceId, key) {
        const toggleAction = toggleFCSParameterEnabled(workspaceId, key)
        currentState = applicationReducer(currentState, toggleAction)
        reduxStore.dispatch(toggleAction)

        saveSessionToDisk()
    },

    // Performs persistent homology calculation to automatically create gates on a sample
    // If a related gateTemplate already exists it will be applied, otherwise a new one will be created.
    // Options shape:
    //    {
    //        selectedXParameterIndex,
    //        selectedYParameterIndex,
    //        selectedXScale,
    //        selectedYScale,
    //        machineType
    //    }
    calculateHomology: async function (sampleId, options) {
        const sample = _.find(currentState.samples, s => s.id === sampleId)
        const FCSFile = _.find(currentState.FCSFiles, fcs => fcs.id === sample.FCSFileId)
        const gateTemplate = _.find(currentState.gateTemplates, gt => gt.id === sample.gateTemplateId)
        const workspace = _.find(currentState.workspaces, w => w.sampleIds.includes(sampleId))

        let gateTemplateGroup = _.find(currentState.gateTemplateGroups, (group) => {
            return group.parentGateTemplateId === sample.gateTemplateId 
                && group.selectedXParameterIndex === options.selectedXParameterIndex
                && group.selectedYParameterIndex === options.selectedYParameterIndex
                && group.selectedXScale === options.selectedXScale
                && group.selectedYScale === options.selectedYScale
                && group.machineType === FCSFile.machineType
        })

        if (!sample) { console.log('Error in calculateHomology(): no sample with id ', sampleId, 'was found'); return }
        // Dispatch a redux action to mark the gate template as loading
        let loadingMessage = 'Creating gates using Persistent Homology...'

        let loadingAction = setSampleParametersLoading(sampleId, options.selectedXParameterIndex + '_' + options.selectedYParameterIndex, { loading: true, loadingMessage: loadingMessage})
        currentState = applicationReducer(currentState, loadingAction)
        reduxStore.dispatch(loadingAction)

        let homologyOptions = { sample, FCSFile, options }

        homologyOptions.options.plotWidth = currentState.plotWidth
        homologyOptions.options.plotHeight = currentState.plotHeight

        // If there are already gating templates defined for this parameter combination
        if (gateTemplateGroup) {
            const gateTemplates = _.filter(currentState.gateTemplates, gt => gateTemplateGroup.childGateTemplateIds.includes(gt.id))
            homologyOptions.options = _.merge(homologyOptions.options, gateTemplateGroup.typeSpecificData)
            homologyOptions.gateTemplates = gateTemplates.map(g => _.clone(g))
        }

        const intervalToken = setInterval(() => {
            loadingAction = setSampleParametersLoading(sampleId, options.selectedXParameterIndex + '_' + options.selectedYParameterIndex, { loading: true, loadingMessage: loadingMessage})
            currentState = applicationReducer(currentState, loadingAction)
            reduxStore.dispatch(loadingAction)
        }, 500)

        const jobId = uuidv4()
        let postBody

        if (gateTemplateGroup) {
            postBody = { jobId: jobId, type: 'find-peaks-with-template', payload: homologyOptions }
        } else {
            postBody = { jobId: jobId, type: 'find-peaks', payload: homologyOptions }
        }

        const truePeaks = await new Promise((resolve, reject) => {
            priorityQueue.push({
                jobParameters: { url: 'http://127.0.0.1:3145', json: postBody },
                callback: (data) => { resolve(data) }
            })
        })

        // If the sample or gate template group has been deleted while homology has been calculating, just do nothing
        if (!_.find(currentState.samples, s => s.id === sampleId) || (gateTemplateGroup && !_.find(currentState.gateTemplateGroups, (group) => {
            return group.parentGateTemplateId === sample.gateTemplateId 
                && group.selectedXParameterIndex === options.selectedXParameterIndex
                && group.selectedYParameterIndex === options.selectedYParameterIndex
                && group.selectedXScale === options.selectedXScale
                && group.selectedYScale === options.selectedYScale
                && group.machineType === FCSFile.machineType
        }))) { console.log('Error calculating homology, sample or gate template group has been deleted'); return false }

        clearInterval(intervalToken)

        // Offset the entire graph and add histograms if we're looking at cytof data
        let xOffset = FCSFile.machineType === constants.MACHINE_CYTOF ? Math.round(Math.min(currentState.plotWidth, currentState.plotHeight) * 0.07) : 0
        let yOffset = FCSFile.machineType === constants.MACHINE_CYTOF ? Math.round(Math.min(currentState.plotWidth, currentState.plotHeight) * 0.07) : 0

        const xStats = FCSFile.FCSParameters[options.selectedXParameterIndex].statistics
        const yStats = FCSFile.FCSParameters[options.selectedYParameterIndex].statistics
        const scales = getScales({
            selectedXScale: options.selectedXScale,
            selectedYScale: options.selectedYScale,
            xRange: [ options.selectedXScale === constants.SCALE_LOG ? xStats.positiveMin : xStats.min, xStats.max ],
            yRange: [ options.selectedYScale === constants.SCALE_LOG ? yStats.positiveMin : yStats.min, yStats.max ],
            width: currentState.plotWidth - xOffset,
            height: currentState.plotHeight - yOffset
        })

        const gates = truePeaks.map((peak) => {
            // Convert the gate polygon back into real space
            for (let i = 0; i < peak.polygon.length; i++) {
                peak.polygon[i][0] = scales.xScale.invert(peak.polygon[i][0])
                peak.polygon[i][1] = scales.yScale.invert(peak.polygon[i][1])
            }

            const gate = {
                type: constants.GATE_TYPE_POLYGON,
                gateData: peak.polygon,
                selectedXParameterIndex: options.selectedXParameterIndex,
                selectedYParameterIndex: options.selectedYParameterIndex,
                selectedXScale: options.selectedXScale,
                selectedYScale: options.selectedYScale,
                gateCreator: constants.GATE_CREATOR_PERSISTENT_HOMOLOGY,
                gateCreatorData: peak.homologyParameters,
                includeEventIds: peak.includeEventIds
            }

            if (FCSFile.machineType === constants.MACHINE_CYTOF) {
                // On the cytof, add any zero cutoffs to gates
                if (peak.xCutoffs) {
                    gate.xCutoffs = [ scales.yScale.invert(peak.xCutoffs[0]), scales.yScale.invert(peak.xCutoffs[1]) ]
                }
                if (peak.yCutoffs) {
                    gate.yCutoffs = [ scales.xScale.invert(peak.yCutoffs[0]), scales.xScale.invert(peak.yCutoffs[1]) ]
                }
            }

            return gate
        })

        if (!gateTemplateGroup && gates.length > 0) {
            // Create a Gate Template Group for this parameter combination
            const newGateTemplateGroup = {
                id: uuidv4(),
                title: FCSFile.FCSParameters[options.selectedXParameterIndex].label + ' · ' + FCSFile.FCSParameters[options.selectedYParameterIndex].label,
                creator: constants.GATE_CREATOR_PERSISTENT_HOMOLOGY,
                selectedXParameterIndex: options.selectedXParameterIndex,
                selectedYParameterIndex: options.selectedYParameterIndex,
                selectedXScale: options.selectedXScale,
                selectedYScale: options.selectedYScale,
                machineType: FCSFile.machineType,
                parentGateTemplateId: sample.gateTemplateId,
                childGateTemplateIds: [],
                expectedGates: [],
                typeSpecificData: options
            }

            const newGateTemplates = gates.map((gate, index) => {
                const gateTemplate = {
                    id: uuidv4(),
                    title: FCSFile.FCSParameters[options.selectedXParameterIndex].label + (truePeaks[index].xGroup === 0 ? ' (LOW) · ' : ' (HIGH) · ') + FCSFile.FCSParameters[options.selectedYParameterIndex].label + (truePeaks[index].yGroup === 1 ? ' (LOW)' : ' (HIGH)'),
                    creator: constants.GATE_CREATOR_PERSISTENT_HOMOLOGY,
                    xGroup: truePeaks[index].xGroup,
                    yGroup: truePeaks[index].yGroup,
                    typeSpecificData: truePeaks[index].homologyParameters
                }
                newGateTemplateGroup.childGateTemplateIds.push(gateTemplate.id)
                gate.gateTemplateId = gateTemplate.id

                const createGateTemplateAction = createGateTemplateAndAddToWorkspace(workspace.id, gateTemplate)
                currentState = applicationReducer(currentState, createGateTemplateAction)
                reduxStore.dispatch(createGateTemplateAction)
                return gateTemplate
            })

            const createGateTemplateGroupAction = createGateTemplateGroupAndAddToWorkspace(workspace.id, newGateTemplateGroup)
            currentState = applicationReducer(currentState, createGateTemplateGroupAction)
            reduxStore.dispatch(createGateTemplateGroupAction)
        } else if (gates.length > 0) {
            const gateTemplates = _.filter(currentState.gateTemplates, g => gateTemplateGroup.childGateTemplateIds.includes(g.id))
            truePeaks.map((peak, index) => {
                gates[index].gateTemplateId = _.find(gateTemplates, gt => gt.xGroup === peak.xGroup && gt.yGroup === peak.yGroup).id
            })

            // Delete previous gates on this plot
            for (let gate of _.filter(currentState.gates, g => gateTemplateGroup.childGateTemplateIds.includes(g.gateTemplateId) && g.parentSampleId === sampleId)) {
                await api.removeSample(gate.childSampleId)
            }
        }


        for (let i = 0; i < gates.length; i++) {
            const gate = gates[i]
            console.log("CREATING NEW GATE", gate)
            api.createSubSampleAndAddToWorkspace(
                workspace.id,
                sampleId,
                {
                    filePath: sample.filePath,
                    FCSParameters: FCSFile.FCSParameters,
                    plotImages: {},
                    subSampleIds: [],
                    gateTemplateId: gate.gateTemplateId,
                    selectedXParameterIndex: options.selectedXParameterIndex,
                    selectedYParameterIndex: options.selectedYParameterIndex,
                    selectedXScale: options.selectedXScale,
                    selectedYScale: options.selectedYScale
                },
                gate,
            )
        }

        let samplesToRecalculate = _.filter(currentState.samples, s => s.gateTemplateId === sample.gateTemplateId && s.id !== sample.id)
        // Recalculate the gates on other FCS files
        for (let sampleToRecalculate of samplesToRecalculate) {
            api.applyGateTemplatesToSample(sampleToRecalculate.id)
        }

        const loadingFinishedAction = setSampleParametersLoading(sampleId, options.selectedXParameterIndex + '_' + options.selectedYParameterIndex, { loading: false, loadingMessage: null })
        currentState = applicationReducer(currentState, loadingFinishedAction)
        reduxStore.dispatch(loadingFinishedAction)

        return true
    },

    recursiveHomology: async (sampleId) => {
        const sample = _.find(currentState.samples, s => s.id === sampleId)
        const FCSFile = _.find(currentState.FCSFiles, fcs => fcs.id === sample.FCSFileId)
        const workspace = _.find(currentState.workspaces, w => w.sampleIds.includes(sampleId))

        let comparisons = []

        for (let x = 3; x < FCSFile.FCSParameters.length; x++) {
            if (!FCSFile.FCSParameters[x].label.match('_')) {
                continue
            }
            for (let y = x + 1; y < FCSFile.FCSParameters.length; y++) {
                if (!FCSFile.FCSParameters[y].label.match('_')) {
                    continue
                }
                comparisons.push([x, y])
            }
        }

        const calculate = async (workerIndex) => {
            if (comparisons.length > 0) {
                const comp = comparisons.splice(0, 1)

                const options = {
                    selectedXParameterIndex: comp[0][0],
                    selectedYParameterIndex: comp[0][1],
                    selectedXScale: constants.SCALE_LOG,
                    selectedYScale: constants.SCALE_LOG,
                    machineType: FCSFile.machineType
                }
                console.log('trying population', workerIndex)
                const population = await api.getPopulationDataForSample(sampleId, options)
                // Generate the cached images
                console.log('trying image', workerIndex)
                const imageForPlot = await getImageForPlot(sample, options)
                const imageAction = setSamplePlotImage(sample.id, getPlotImageKey(options), imageForPlot)
                currentState = applicationReducer(currentState, imageAction)
                reduxStore.dispatch(imageAction)

                console.log('trying homology', workerIndex)
                await api.calculateHomology(sample.id, options)

                calculate(workerIndex)
            }
        }

        for (let i = 0; i < Math.max(os.cpus().length - 1, 1); i++) {
            calculate(i)
        }
    },

    getPopulationDataForSample: async (sampleId, options) => {
        options.plotWidth = currentState.plotWidth
        options.plotHeight = currentState.plotHeight
        const key = `${sampleId}-${options.selectedXParameterIndex}_${options.selectedXScale}-${options.selectedYParameterIndex}_${options.selectedYScale}`
        if (populationDataCache[key]) {
            return populationDataCache[key]
        }
        // Find the related sample
        const sample = _.find(currentState.samples, s => s.id === sampleId)

        const jobId = uuidv4()

        const population = await new Promise((resolve, reject) => {
            request.post({ url: 'http://127.0.0.1:3145', json: { jobId: jobId, type: 'get-population-data', payload: { sample: sample, options: options } } }, function (error, response, body) {
                resolve(body)
            });
        })

        populationDataCache[key] = population
        return populationDataCache[key]
    }
}