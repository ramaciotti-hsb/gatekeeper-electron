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
import ls from 'ls'
import rimraf from 'rimraf'
import GrahamScan from '../lib/graham-scan.js'
import pointInsidePolygon from 'point-in-polygon'
import polygonsIntersect from 'polygon-overlap'
import { distanceToPolygon, distanceBetweenPoints } from 'distance-to-polygon'
import isDev from 'electron-is-dev'
import { breakLongLinesIntoPoints, fixOverlappingPolygonsUsingZipper } from '../lib/polygon-utilities'
import applicationReducer from '../reducers/application-reducer'
import { setBackgroundJobsEnabled, setPlotDimensions, setPlotDisplayDimensions, toggleShowDisabledParameters, setUnsavedGates, showGatingModal, hideGatingModal } from '../actions/application-actions'
import { updateSample, removeSample, setSamplePlotImage, setSampleParametersLoading } from '../actions/sample-actions'
import { updateGateTemplate, removeGateTemplate } from '../actions/gate-template-actions'
import { removeGateTemplateGroup } from '../actions/gate-template-group-actions'
import { updateFCSFile, removeFCSFile } from '../actions/fcs-file-actions'
import { createGatingError, updateGatingError, removeGatingError } from '../actions/gating-error-actions'
import { createWorkspace, selectWorkspace, removeWorkspace, updateWorkspace,
    createFCSFileAndAddToWorkspace, selectFCSFile,
    createSampleAndAddToWorkspace, createSubSampleAndAddToWorkspace, selectSample, invertPlotAxis,
    createGateTemplateAndAddToWorkspace, selectGateTemplate,
    createGateTemplateGroupAndAddToWorkspace, setFCSParametersDisabled } from '../actions/workspace-actions'

import request from 'request'

let currentState = {}

let reduxStore

// Debug imports below
// import getImageForPlotBackend from '../lib/get-image-for-plot'

// Fork a new node process for doing CPU intensive jobs
let workerFork

const createFork = function () {
    console.log('starting fork')
    if (isDev) {
        workerFork = fork(__dirname + '/js/electron/subprocess-wrapper-dev.js', [ remote.app.getPath('userData') ], { silent: true })
    } else {
        workerFork = fork(__dirname + '/webpack-build/fork.bundle.js', [ remote.app.getPath('userData') ], { silent: true })
    }
}

createFork()

const jobQueue = {}
const priorityQueue = {}

window.jobQueue = jobQueue
window.priorityQueue = priorityQueue

setTimeout(function () {
    console.log(currentState)
}, 10000)

const pushToQueue = async function (job, priority) {
    let queueToPush = priority ? priorityQueue : jobQueue
    if (!queueToPush[job.jobKey]) {
        queueToPush[job.jobKey] = job
        return true
    } else {
        console.log("Job rejected as a duplicate is already in the queue, attaching callbacks other job")
        const callback = queueToPush[job.jobKey].callback
        const newCallback = (data) => {
            callback(data)
            if (job.checkValidity()) {
                job.callback(data)                
            }
        }
        queueToPush[job.jobKey].callback = newCallback
        return false
    }
}

const processJob = async function () {
    if (!reduxStore || reduxStore.getState().sessionLoading) {
        return false
    }

    const priorityKeys = _.keys(priorityQueue)
    const jobKeys = _.keys(jobQueue)
    let currentJob
    let isPriority
    if (priorityKeys.length > 0) {
        currentJob = priorityQueue[priorityKeys[0]]
        delete priorityQueue[priorityKeys[0]]
        isPriority = true
    } else if (jobKeys.length > 0) {
        currentJob = jobQueue[jobKeys[0]]
        delete jobQueue[jobKeys[0]]
        isPriority = false
    }

    if (!currentJob) {
        return false
    } else if (!currentJob.checkValidity()) {
        return true
    } else if (!currentState.backgroundJobsEnabled && !isPriority) {
        pushToQueue(currentJob, false)
        return false
    } else {
        let result
        let requestFunction = (resolve, reject) => {
            request.post(currentJob.jobParameters, function (error, response, body) {
                if (error) {
                    reject(error)
                }
                resolve(body)
            });
        }
        try {
            result = await new Promise(requestFunction)
        } catch (error) {
            console.log("Error in worker job, trying again")
            console.log(error)
            // Try a second time
            try {
                result = await new Promise(requestFunction)
            } catch (error) {
                console.log("error after two attempts")
                console.log(error)
            }
        }

        if (result) {
            currentJob.callback(result)
        }
    }
}

const processJobs = async function () {
    while (true) {
        const result = await processJob()
        if (result === false) {
            await new Promise((resolve, reject) => { setTimeout(() => { resolve() }, 100) })
        }
    }
}

for (let i = 0; i < Math.max(os.cpus().length - 1, 1); i++) {
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

workerFork.on('close', createFork);
workerFork.on('error', createFork);

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

// Loops through the image directories on disk and deletes images that no longer reference a sample on disk
const cleanupImageDirectories = () => {
    for (var file of ls(path.join(remote.app.getPath('userData'), 'sample-images', '*'))) {
        if (!_.find(currentState.samples, s => s.id === file.file)) {
            console.log('going to delete', file.full)
            rimraf(file.full, () => { console.log('deleted', file.full) })
        }
    }
}

const filteredSampleAttributes = ['includeEventIds']

const populationDataCache = {}

const getFCSMetadata = async (filePath) => {
    const jobId = uuidv4()

    const metadata = await new Promise((resolve, reject) => {
        pushToQueue({
            jobParameters: { url: 'http://127.0.0.1:3145', json: { jobId: jobId, type: 'get-fcs-metadata', payload: { filePath } } },
            jobKey: uuidv4(),
            checkValidity: () => { return true },
            callback: (data) => { resolve(data) }
        }, true)
    })

    return metadata
}

// Generates an image for a 2d scatter plot
const getImageForPlot = async (sample, FCSFile, options, priority) => {
    options.directory = remote.app.getPath('userData')
    options.machineType = FCSFile.machineType
    options.plotWidth = currentState.plotWidth
    options.plotHeight = currentState.plotHeight
    const FCSFileId = sample.FCSFileId
    const sampleId = sample.id

    if (sample.plotImages[getPlotImageKey(options)]) { return sample.plotImages[getPlotImageKey(options)] }

    const jobId = uuidv4()

    const imagePath = await new Promise((resolve, reject) => {
        pushToQueue({
            jobParameters: { url: 'http://127.0.0.1:3145', json: { jobId: jobId, type: 'get-image-for-plot', payload: { sample, FCSFile, options } } },
            jobKey: 'image_' + sample.id + '_' + _.values(options).reduce((curr, acc) => { return acc + '_' + curr }, '') + (!!priority).toString(),
            checkValidity: () => {
                let FCSFileUpdated = _.find(currentState.FCSFiles, fcs => FCSFileId === fcs.id)
                const workspace = _.find(currentState.workspaces, w => w.sampleIds.includes(sampleId))
                if (!workspace || options.machineType !== FCSFileUpdated.machineType) {
                    return false
                }

                if (workspace.disabledParameters[FCSFile.FCSParameters[options.selectedXParameterIndex].key]
                    || workspace.disabledParameters[FCSFile.FCSParameters[options.selectedYParameterIndex].key]) {
                    return false
                }
                return true
            },
            callback: (data) => { resolve(data) }
        }, priority)
    })

    // Save the image path
    const imageAction = setSamplePlotImage(sample.id, getPlotImageKey(options), imagePath)
    currentState = applicationReducer(currentState, imageAction)
    reduxStore.dispatch(imageAction)

    saveSessionToDisk()

    return imagePath
}

const getAllPlotImages = async (sample, scales) => {
    const workspace = _.find(currentState.workspaces, w => w.sampleIds.includes(sample.id))
    const FCSFile = _.find(currentState.FCSFiles, fcs => sample.FCSFileId === fcs.id)
    let combinations = []

    for (let x = 0; x < FCSFile.FCSParameters.length; x++) {
        if (workspace.disabledParameters[FCSFile.FCSParameters[x].key]) { continue }
        for (let y = x + 1; y < FCSFile.FCSParameters.length; y++) {
            if (workspace.disabledParameters[FCSFile.FCSParameters[y].key]) { continue }
            const options = {
                selectedXParameterIndex: workspace.invertedAxisPlots[x + '_' + y] ? y : x,
                selectedYParameterIndex: workspace.invertedAxisPlots[x + '_' + y] ? x : y,
                selectedXScale: scales.selectedXScale,
                selectedYScale: scales.selectedYScale,
                machineType: FCSFile.machineType
            }
            getImageForPlot(sample, FCSFile, options)
            // Add a short delay to prevent blocking the interface
            await new Promise((resolve, reject) => { setTimeout(() => { resolve() }, 1) })
        }
    }
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
        reduxStore.dispatch({ type: 'RESET_SESSION' })
        store.dispatch({ type: 'SET_API', payload: { api } })
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
            cleanupImageDirectories()
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

    setGateTemplateExampleGate: function (gateTemplateId, exampleGateId) {
        const updateAction = updateGateTemplate(gateTemplateId, { exampleGateId })
        currentState = applicationReducer(currentState, updateAction)
        reduxStore.dispatch(updateAction)
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
        console.log(sampleId, sample)
        const FCSFile = _.find(currentState.FCSFiles, fcs => sample.FCSFileId === fcs.id)
        const workspace = _.find(currentState.workspaces, w => w.sampleIds.includes(sampleId))
        // Find all template groups that apply to this sample
        const templateGroups = _.filter(currentState.gateTemplateGroups, g => g.parentGateTemplateId === sample.gateTemplateId)
        for (let templateGroup of templateGroups) {
            if (templateGroup.creator === constants.GATE_CREATOR_PERSISTENT_HOMOLOGY) {
                // If there hasn't been any gates generated for this sample, try generating them, otherwise leave them as they are
                if (!_.find(currentState.gates, g => g.parentSampleId === sampleId && templateGroup.childGateTemplateIds.includes(g.gateTemplateId))
                    && !_.find(currentState.gatingErrors, e => e.sampleId === sampleId && e.gateTemplateGroupId === templateGroup.id)) {
                    // Dispatch a redux action to mark the gate template as loading
                    let loadingMessage = 'Creating gates using Persistent Homology...'

                    let loadingAction = setSampleParametersLoading(sample.id, templateGroup.selectedXParameterIndex + '_' + templateGroup.selectedYParameterIndex, { loading: true, loadingMessage: loadingMessage})
                    currentState = applicationReducer(currentState, loadingAction)
                    reduxStore.dispatch(loadingAction)
                    
                    const options = {
                        selectedXParameterIndex: templateGroup.selectedXParameterIndex,
                        selectedYParameterIndex: templateGroup.selectedYParameterIndex,
                        selectedXScale: templateGroup.selectedXScale,
                        selectedYScale: templateGroup.selectedYScale,
                        machineType: templateGroup.machineType
                    }

                    await getImageForPlot(sample, FCSFile, options, true)

                    let homologyResult = await api.calculateHomology(sampleId, options)

                    if (homologyResult.status === constants.STATUS_SUCCESS) {
                        // Create the negative gate if there is one
                        const negativeGate = _.find(currentState.gateTemplates, gt => templateGroup.childGateTemplateIds.includes(gt.id) && gt.type === constants.GATE_TYPE_NEGATIVE)
                        if (negativeGate) {
                            const newGate = {
                                id: uuidv4(),
                                type: constants.GATE_TYPE_NEGATIVE,
                                title: FCSFile.FCSParameters[templateGroup.selectedXParameterIndex].label + ' · ' + FCSFile.FCSParameters[templateGroup.selectedYParameterIndex].label + ' Negative Gate',
                                sampleId: sampleId,
                                FCSFileId: FCSFile.id,
                                gateTemplateId: negativeGate.id,
                                selectedXParameterIndex: templateGroup.selectedXParameterIndex,
                                selectedYParameterIndex: templateGroup.selectedYParameterIndex,
                                selectedXScale: templateGroup.selectedXScale,
                                selectedYScale: templateGroup.selectedYScale,
                                gateCreator: constants.GATE_CREATOR_PERSISTENT_HOMOLOGY,
                                gateCreatorData: {},
                                includeEventIds: []
                            }

                            gates.push(newGate)
                        }

                        let gates = api.createGatePolygons(homologyResult.data.gates)
                        gates = await api.getGateIncludedEvents(gates)

                        // Create combo gates AFTER we know which events are in each smaller gate so that they can be concatted for combo gate contents
                        const comboGates = _.filter(currentState.gateTemplates, gt => templateGroup.childGateTemplateIds.includes(gt.id) && gt.type === constants.GATE_TYPE_COMBO)
                        for (let comboGate of comboGates) {
                            const includedGates = _.filter(gates, g => comboGate.typeSpecificData.gateTemplateIds.includes(g.gateTemplateId))

                            const newGate = {
                                id: uuidv4(),
                                type: constants.GATE_TYPE_COMBO,
                                title: FCSFile.FCSParameters[templateGroup.selectedXParameterIndex].label + ' · ' + FCSFile.FCSParameters[templateGroup.selectedYParameterIndex].label + ' Combo Gate',
                                sampleId: sampleId,
                                FCSFileId: FCSFile.id,
                                gateTemplateId: comboGate.id,
                                selectedXParameterIndex: templateGroup.selectedXParameterIndex,
                                selectedYParameterIndex: templateGroup.selectedYParameterIndex,
                                selectedXScale: templateGroup.selectedXScale,
                                selectedYScale: templateGroup.selectedYScale,
                                gateCreator: constants.GATE_CREATOR_PERSISTENT_HOMOLOGY,
                                gateCreatorData: {
                                    gateIds: includedGates.map(g => g.id)
                                },
                                includeEventIds: includedGates.reduce((accumulator, current) => { return accumulator.concat(current.includeEventIds) }, [])
                            }

                            gates.push(newGate)
                        }

                        if (gates.length > 0) {
                            for (let i = 0; i < gates.length; i++) {
                                const gate = gates[i]
                                api.createSubSampleAndAddToWorkspace(
                                    workspace.id,
                                    sampleId,
                                    {
                                        filePath: sample.filePath,
                                        FCSParameters: FCSFile.FCSParameters,
                                        plotImages: {},
                                        subSampleIds: [],
                                        gateTemplateId: gate.gateTemplateId,
                                        selectedXParameterIndex: templateGroup.selectedXParameterIndex,
                                        selectedYParameterIndex: templateGroup.selectedYParameterIndex,
                                        selectedXScale: templateGroup.selectedXScale,
                                        selectedYScale: templateGroup.selectedYScale
                                    },
                                    gate,
                                )
                            }
                        }

                        const loadingFinishedAction = setSampleParametersLoading(sample.id, templateGroup.selectedXParameterIndex + '_' + templateGroup.selectedYParameterIndex, { loading: false, loadingMessage: null })
                        currentState = applicationReducer(currentState, loadingFinishedAction)
                        reduxStore.dispatch(loadingFinishedAction)
                    } else if (homologyResult.status === constants.STATUS_FAIL) {
                        const gatingError = {
                            id: uuidv4(),
                            sampleId: sampleId,
                            gateTemplateGroupId: templateGroup.id,
                            gates: homologyResult.data.gates,
                            criteria:  homologyResult.data.criteria,
                        }

                        let gates = api.createGatePolygons(homologyResult.data.gates)
                        gates = await api.getGateIncludedEvents(gates)
                        // Create a gating error
                        const createGatingErrorAction = createGatingError(gatingError)
                        currentState = applicationReducer(currentState, createGatingErrorAction)
                        reduxStore.dispatch(createGatingErrorAction)

                        const loadingFinishedAction = setSampleParametersLoading(sample.id, templateGroup.selectedXParameterIndex + '_' + templateGroup.selectedYParameterIndex, { loading: false, loadingMessage: null })
                        currentState = applicationReducer(currentState, loadingFinishedAction)
                        reduxStore.dispatch(loadingFinishedAction)
                    }

                    saveSessionToDisk()
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
            renderedPolygon: gateParameters.renderedPolygon,
            gateData: gateParameters.gateData,
            gateCreatorData: gateParameters.gateCreatorData,
            selectedXParameterIndex: gateParameters.selectedXParameterIndex,
            selectedYParameterIndex: gateParameters.selectedYParameterIndex,
            selectedXScale: gateParameters.selectedXScale,
            selectedYScale: gateParameters.selectedYScale,
            gateTemplateId: gateParameters.gateTemplateId,
            xGroup: gateParameters.xGroup,
            yGroup: gateParameters.yGroup,
        }

        // If there was no title specified, auto generate one
        let title = 'Subsample'

        sample.populationCount = gateParameters.includeEventIds.length

        const backendSample = _.cloneDeep(sample)
        backendSample.includeEventIds = gateParameters.includeEventIds

        currentState = applicationReducer(currentState, createSubSampleAndAddToWorkspace(workspaceId, parentSampleId, backendSample, gate))
        reduxStore.dispatch(createSubSampleAndAddToWorkspace(workspaceId, parentSampleId, sample, gate))

        // If the gate template doesn't have an example gate yet, use this one
        const gateTemplate = _.find(currentState.gateTemplates, gt => gt.id === gateParameters.gateTemplateId)
        if (!gateTemplate.exampleGateId) {
            await api.setGateTemplateExampleGate(gateTemplate.id, gateId)
        }

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
        const sample = _.find(currentState.samples, w => w.id === sampleId)
        const FCSFile = _.find(currentState.FCSFiles, fcs => sample.FCSFileId === fcs.id)
        getImageForPlot(sample, FCSFile, options, priority)
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
                getImageForPlot(sample, FCSFile, options)
            }
        }
    },

    setFCSParametersDisabled: async function (workspaceId, parameters) {
        const workspace = _.find(currentState.workspaces, w => w.id === workspaceId)

        const setAction = setFCSParametersDisabled(workspaceId, parameters)
        currentState = applicationReducer(currentState, setAction)
        reduxStore.dispatch(setAction)

        // If parameters are only being disabled, don't bother to recalculate images
        if (!_.values(parameters).reduce((current, accumulator) => { return current || accumulator }, false)) {
            for (let sample of currentState.samples) {
                getAllPlotImages(sample, { selectedXScale: workspace.selectedXScale, selectedYScale: workspace.selectedYScale })
            }
        }

        saveSessionToDisk()
    },

    createUnsavedGatesUsingHomology: async function (sampleId, options) {
        // Dispatch a redux action to mark the gate template as loading
        let loadingMessage = 'Creating gates using Persistent Homology...'

        let loadingAction = setSampleParametersLoading(sampleId, options.selectedXParameterIndex + '_' + options.selectedYParameterIndex, { loading: true, loadingMessage: loadingMessage})
        currentState = applicationReducer(currentState, loadingAction)
        reduxStore.dispatch(loadingAction)
        
        let homologyResult = await api.calculateHomology(sampleId, options)
        const gates = api.createGatePolygons(homologyResult.data.gates)

        const loadingFinishedAction = setSampleParametersLoading(sampleId, options.selectedXParameterIndex + '_' + options.selectedYParameterIndex, { loading: false, loadingMessage: null })
        currentState = applicationReducer(currentState, loadingFinishedAction)
        reduxStore.dispatch(loadingFinishedAction)

        const setUnsavedGatesAction = setUnsavedGates(gates)
        currentState = applicationReducer(currentState, setUnsavedGatesAction)
        reduxStore.dispatch(setUnsavedGatesAction)

        api.updateUnsavedGateDerivedData()
    },

    resetUnsavedGates () {
        const setUnsavedGatesAction = setUnsavedGates(null)
        currentState = applicationReducer(currentState, setUnsavedGatesAction)
        reduxStore.dispatch(setUnsavedGatesAction)
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
        const workspace = _.find(currentState.workspaces, w => w.sampleIds.includes(sampleId))

        let gateTemplate = _.find(currentState.gateTemplates, gt => gt.id === sample.gateTemplateId)
        let gateTemplateGroup = _.find(currentState.gateTemplateGroups, (group) => {
            return group.parentGateTemplateId === sample.gateTemplateId 
                && group.selectedXParameterIndex === options.selectedXParameterIndex
                && group.selectedYParameterIndex === options.selectedYParameterIndex
                && group.selectedXScale === options.selectedXScale
                && group.selectedYScale === options.selectedYScale
                && group.machineType === FCSFile.machineType
        })

        // If the user clicked the "create gates" button and there is already a gate template group, delete it
        if (options.removeExistingGates && gateTemplateGroup) {
            await api.removeGateTemplateGroup(gateTemplateGroup.id)
            gateTemplate = null
            gateTemplateGroup = null
        }

        if (!sample) { console.log('Error in calculateHomology(): no sample with id ', sampleId, 'was found'); return }

        let homologyOptions = { sample, FCSFile, options }

        homologyOptions.options.plotWidth = currentState.plotWidth
        homologyOptions.options.plotHeight = currentState.plotHeight

        if (options.sampleNuclei) {
            homologyOptions.options.sampleNuclei = options.sampleNuclei
        }

        // If there are already gating templates defined for this parameter combination
        if (gateTemplateGroup) {
            const gateTemplates = _.filter(currentState.gateTemplates, gt => gateTemplateGroup.childGateTemplateIds.includes(gt.id))
            homologyOptions.options = _.merge(homologyOptions.options, gateTemplateGroup.typeSpecificData)
            homologyOptions.gateTemplates = gateTemplates.map(g => _.clone(g))
        }

        // const intervalToken = setInterval(() => {
        //     loadingAction = setSampleParametersLoading(sampleId, options.selectedXParameterIndex + '_' + options.selectedYParameterIndex, { loading: true, loadingMessage: 'update'})
        //     currentState = applicationReducer(currentState, loadingAction)
        //     reduxStore.dispatch(loadingAction)
        // }, 500)

        let postBody

        if (gateTemplateGroup) {
            postBody = { type: 'find-peaks-with-template', payload: homologyOptions }
        } else {
            postBody = { type: 'find-peaks', payload: homologyOptions }
        }

        const checkValidity = () => {
            const sample = _.find(currentState.samples, s => s.id === sampleId)
            // If the sample or gate template group has been deleted while homology has been calculating, just do nothing
            if (!sample || (gateTemplateGroup && !_.find(currentState.gateTemplateGroups, (group) => {
                return group.parentGateTemplateId === sample.gateTemplateId 
                    && group.selectedXParameterIndex === options.selectedXParameterIndex
                    && group.selectedYParameterIndex === options.selectedYParameterIndex
                    && group.selectedXScale === options.selectedXScale
                    && group.selectedYScale === options.selectedYScale
                    && group.machineType === FCSFile.machineType
            }))) { console.log('Error calculating homology, sample or gate template group has been deleted'); return false }

            return true
        }

        const homologyResult = await new Promise((resolve, reject) => {
            pushToQueue({
                jobParameters: { url: 'http://127.0.0.1:3145', json: postBody },
                jobKey: uuidv4(),
                checkValidity,
                callback: (data) => { resolve(data) }
            }, true)
        })

        if (!checkValidity()) { return false }

        // clearInterval(intervalToken)
        let gates = []

        for (let i = 0; i < homologyResult.data.gates.length; i++) {
            const peak = homologyResult.data.gates[i]

            let gate

            if (peak.type === constants.GATE_TYPE_POLYGON) {
                gate = {
                    id: uuidv4(),
                    type: constants.GATE_TYPE_POLYGON,
                    title: FCSFile.FCSParameters[options.selectedXParameterIndex].label + (peak.xGroup == 0 ? ' (LOW) · ' : ' (HIGH) · ') + FCSFile.FCSParameters[options.selectedYParameterIndex].label + (peak.yGroup == 1 ? ' (LOW)' : ' (HIGH)'),
                    gateData: {
                        polygons: peak.polygons,
                        nucleus: peak.nucleus
                    },
                    xGroup: peak.xGroup,
                    yGroup: peak.yGroup,
                    FCSFileId: FCSFile.id,
                    sampleId: sampleId,
                    gateTemplateId: peak.gateTemplateId,
                    includeEventIds: [],
                    selectedXParameterIndex: options.selectedXParameterIndex,
                    selectedYParameterIndex: options.selectedYParameterIndex,
                    selectedXScale: options.selectedXScale,
                    selectedYScale: options.selectedYScale,
                    gateCreator: constants.GATE_CREATOR_PERSISTENT_HOMOLOGY,
                    gateCreatorData: peak.gateCreatorData,
                }
            }

            gates.push(gate)
        }

        // Expand gates to include zero value data
        if (FCSFile.machineType === constants.MACHINE_CYTOF) {
            gates = await new Promise((resolve, reject) => {
                pushToQueue({
                    jobParameters: { url: 'http://127.0.0.1:3145', json: { type: 'get-expanded-gates', payload: { sample, gates, FCSFile, options } } },
                    jobKey: uuidv4(),
                    checkValidity,
                    callback: (data) => { resolve(data) }
                }, true)
            })
        }

        homologyResult.data.gates = gates

        return homologyResult
    },

    showGatingModal (sampleId, selectedXParameterIndex, selectedYParameterIndex) {
        const showGatingModalAction = showGatingModal(sampleId, selectedXParameterIndex, selectedYParameterIndex)
        currentState = applicationReducer(currentState, showGatingModalAction)
        reduxStore.dispatch(showGatingModalAction)

        if (currentState.unsavedGates && currentState.unsavedGates.length > 0) {
            api.updateUnsavedGateDerivedData()
        }
    },

    hideGatingModal () {
        const hideGatingModalAction = hideGatingModal()
        currentState = applicationReducer(currentState, hideGatingModalAction)
        reduxStore.dispatch(hideGatingModalAction)
    },

    createGatePolygons (gates) {
        const filteredGates = _.filter(gates, g => g.type === constants.GATE_TYPE_POLYGON)
        for (let gate of filteredGates) {
            let polygons
            if (gate.gateData.doubleExpandedPolygons && gate.gateCreatorData.includeXChannelZeroes !== false && gate.gateCreatorData.includeYChannelZeroes !== false) {
                polygons = gate.gateData.doubleExpandedPolygons
            } else if (gate.gateData.expandedXPolygons && gate.gateCreatorData.includeXChannelZeroes !== false) {
                polygons = gate.gateData.expandedXPolygons
            } else if (gate.gateData.expandedYPolygons && gate.gateCreatorData.includeYChannelZeroes !== false) {
                polygons = gate.gateData.expandedYPolygons
            } else {
                polygons = gate.gateData.polygons
            }

            gate.renderedPolygon = breakLongLinesIntoPoints(polygons[gate.gateCreatorData.truePeakWidthIndex + gate.gateCreatorData.widthIndex])
        }

        const overlapFixed = fixOverlappingPolygonsUsingZipper(filteredGates.map(g => g.renderedPolygon))

        for (let i = 0; i < overlapFixed.length; i++) {
            filteredGates[i].renderedPolygon = overlapFixed[i]
        }

        return gates
    },

    getGateIncludedEvents: async function (gates) {
        const sample = _.find(currentState.samples, s => s.id === gates[0].sampleId)
        const FCSFile = _.find(currentState.FCSFiles, fcs => fcs.id === gates[0].FCSFileId)
        const options = {
            selectedXParameterIndex: gates[0].selectedXParameterIndex,
            selectedYParameterIndex: gates[0].selectedYParameterIndex,
            selectedXScale: gates[0].selectedXScale,
            selectedYScale: gates[0].selectedYScale,
            machineType: FCSFile.machineType,
            plotWidth: currentState.plotWidth,
            plotHeight: currentState.plotHeight
        }

        let newUnsavedGates = await new Promise((resolve, reject) => {
            pushToQueue({
                jobParameters: { url: 'http://127.0.0.1:3145', json: { type: 'get-included-events', payload: { sample, gates, FCSFile, options } } },
                jobKey: uuidv4(),
                checkValidity: () => { return true },
                callback: (data) => { resolve(data) }
            }, true)
        })

        return newUnsavedGates
    },

    updateUnsavedGateDerivedData () {
        const saveGates = (gates) => {
            const setUnsavedGatesAction = setUnsavedGates(gates)
            currentState = applicationReducer(currentState, setUnsavedGatesAction)
            reduxStore.dispatch(setUnsavedGatesAction)
        }

        const toSave = api.createGatePolygons(currentState.unsavedGates)
        saveGates(toSave)
        
        api.getGateIncludedEvents(currentState.unsavedGates).then((newUnsavedGates) => {
            if (!currentState.unsavedGates) {
                return
            }
            
            const toSave = newUnsavedGates.map((gate) => {
                const updatedGate = _.find(currentState.unsavedGates, g => g.id === gate.id)
                updatedGate.includeEventIds = gate.includeEventIds
                return updatedGate
            })

            // Update event counts on combo gates
            for (let gate of toSave) {
                if (gate.type === constants.GATE_TYPE_COMBO) {
                    const includedGates = _.filter(currentState.unsavedGates, g => gate.gateCreatorData.gateIds.includes(g.id))
                    gate.includeEventIds = includedGates.reduce((accumulator, current) => { return accumulator.concat(current.includeEventIds) }, [])
                }
            }

            saveGates(toSave)
        })
    },

    updateUnsavedGate: async function (gateId, parameters) {
        const gateIndex = _.findIndex(currentState.unsavedGates, g => g.id === gateId)
        if (gateIndex > -1) {
            const newGate = _.merge(_.cloneDeep(currentState.unsavedGates[gateIndex]), parameters)
            newGate.gateCreatorData.widthIndex = Math.max(Math.min(newGate.gateCreatorData.widthIndex, newGate.gateData.polygons.length - 1 - newGate.gateCreatorData.truePeakWidthIndex), - newGate.gateCreatorData.truePeakWidthIndex)
            const newUnsavedGates = currentState.unsavedGates.slice(0, gateIndex).concat(newGate).concat(currentState.unsavedGates.slice(gateIndex + 1))
        
            const setUnsavedGatesAction = setUnsavedGates(newUnsavedGates)
            currentState = applicationReducer(currentState, setUnsavedGatesAction)
            reduxStore.dispatch(setUnsavedGatesAction)

            api.updateUnsavedGateDerivedData()
        } else {
            console.log('Error in updateUnsavedGate: no gate with id ', gateId, 'was found.')
        }
    },

    setUnsavedNegativeGateVisible (visible) {
        if (visible) {
            const firstGate = currentState.unsavedGates.slice(0, 1)[0]
            const FCSFile = _.find(currentState.FCSFiles, fcs => fcs.id === firstGate.FCSFileId)
            const newGate = {
                id: uuidv4(),
                type: constants.GATE_TYPE_NEGATIVE,
                title: FCSFile.FCSParameters[firstGate.selectedXParameterIndex].label + ' · ' + FCSFile.FCSParameters[firstGate.selectedYParameterIndex].label + ' Negative Gate',
                sampleId: firstGate.sampleId,
                FCSFileId: firstGate.FCSFileId,
                selectedXParameterIndex: firstGate.selectedXParameterIndex,
                selectedYParameterIndex: firstGate.selectedYParameterIndex,
                selectedXScale: firstGate.selectedXScale,
                selectedYScale: firstGate.selectedYScale,
                gateCreator: constants.GATE_CREATOR_PERSISTENT_HOMOLOGY,
                gateCreatorData: {},
                includeEventIds: []
            }
            const newUnsavedGates = currentState.unsavedGates.concat([newGate])
            const setUnsavedGatesAction = setUnsavedGates(newUnsavedGates)
            currentState = applicationReducer(currentState, setUnsavedGatesAction)
            reduxStore.dispatch(setUnsavedGatesAction)

            api.updateUnsavedGateDerivedData()
        } else {
            const gateIndex = _.findIndex(currentState.unsavedGates, g => g.type === constants.GATE_TYPE_NEGATIVE)
            if (gateIndex > -1) {
                const newUnsavedGates = currentState.unsavedGates.slice(0, gateIndex).concat(currentState.unsavedGates.slice(gateIndex + 1))
                const setUnsavedGatesAction = setUnsavedGates(newUnsavedGates)
                currentState = applicationReducer(currentState, setUnsavedGatesAction)
                reduxStore.dispatch(setUnsavedGatesAction)
            } else {
                console.log('Error trying to toggle negative unsaved gate, no negative gate was found.')
            }
        }
    },

    createUnsavedComboGate (gateIds) {
        const firstGate = currentState.unsavedGates.slice(0, 1)[0]
        const FCSFile = _.find(currentState.FCSFiles, fcs => fcs.id === firstGate.FCSFileId)
        const includedGates = _.filter(currentState.unsavedGates, g => gateIds.includes(g.id))

        const newGate = {
            id: uuidv4(),
            type: constants.GATE_TYPE_COMBO,
            title: FCSFile.FCSParameters[firstGate.selectedXParameterIndex].label + ' · ' + FCSFile.FCSParameters[firstGate.selectedYParameterIndex].label + ' Combo Gate',
            sampleId: firstGate.sampleId,
            FCSFileId: firstGate.FCSFileId,
            selectedXParameterIndex: firstGate.selectedXParameterIndex,
            selectedYParameterIndex: firstGate.selectedYParameterIndex,
            selectedXScale: firstGate.selectedXScale,
            selectedYScale: firstGate.selectedYScale,
            gateCreator: constants.GATE_CREATOR_PERSISTENT_HOMOLOGY,
            gateCreatorData: {
                gateIds: gateIds
            },
            includeEventIds: includedGates.reduce((accumulator, current) => { return accumulator.concat(current.includeEventIds) }, [])
        }
        const newUnsavedGates = currentState.unsavedGates.concat([newGate])
        const setUnsavedGatesAction = setUnsavedGates(newUnsavedGates)
        currentState = applicationReducer(currentState, setUnsavedGatesAction)
        reduxStore.dispatch(setUnsavedGatesAction)
    },

    removeUnsavedGate (gateId) {
        const gateIndex = _.findIndex(currentState.unsavedGates, g => g.id === gateId)
        if (gateIndex > -1) {
            const newUnsavedGates = currentState.unsavedGates.slice(0, gateIndex).concat(currentState.unsavedGates.slice(gateIndex + 1))
        
            const setUnsavedGatesAction = setUnsavedGates(newUnsavedGates)
            currentState = applicationReducer(currentState, setUnsavedGatesAction)
            reduxStore.dispatch(setUnsavedGatesAction)
        } else {
            console.log('Error in updateUnsavedGate: no gate with id ', gateId, 'was found.')
        }
    },

    applyUnsavedGatesToSample: async (sampleId, options) => {
        const sample = _.find(currentState.samples, s => s.id === sampleId)
        const FCSFile = _.find(currentState.FCSFiles, fcs => fcs.id === sample.FCSFileId)
        const workspace = _.find(currentState.workspaces, w => w.sampleIds.includes(sampleId))
        // Find if there is already a gate template group for this combination or not
        const gateTemplateGroup = _.find(currentState.gateTemplateGroups, g => g.parentGateTemplateId === sample.gateTemplateId && g.selectedXParameterIndex === options.selectedXParameterIndex && g.selectedYParameterIndex === options.selectedYParameterIndex)
        if (gateTemplateGroup) {
            for (let gate of currentState.unsavedGates) {
                const updateGateTemplateAction = updateGateTemplate(gate.gateTemplateId, {
                    typeSpecificData: gate.gateCreatorData
                })
                currentState = applicationReducer(currentState, updateGateTemplateAction)
                reduxStore.dispatch(updateGateTemplateAction)

                for (let subSample of _.filter(currentState.samples, s => s.gateTemplateId === gate.gateTemplateId)) {
                    const removeSampleAction = removeSample(subSample.id)
                    currentState = applicationReducer(currentState, removeSampleAction)
                    reduxStore.dispatch(removeSampleAction)
                }

                // api.applyGateTemplatesToSample(sample.id)
            }
        } else {
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

            const newGateTemplates = currentState.unsavedGates.map((gate, index) => {
                let gateTemplate

                if (gate.type === constants.GATE_TYPE_POLYGON) {
                    gateTemplate = {
                        id: gate.id,
                        type: constants.GATE_TYPE_POLYGON,
                        title: gate.title,
                        creator: constants.GATE_CREATOR_PERSISTENT_HOMOLOGY,
                        xGroup: gate.xGroup,
                        yGroup: gate.yGroup,
                        typeSpecificData: gate.gateCreatorData
                    }
                } else if (gate.type === constants.GATE_TYPE_NEGATIVE) {
                    gateTemplate = {
                        id: gate.id,
                        type: constants.GATE_TYPE_NEGATIVE,
                        title: gate.title,
                        creator: constants.GATE_CREATOR_PERSISTENT_HOMOLOGY,
                        typeSpecificData: {}
                    }
                } else if (gate.type === constants.GATE_TYPE_COMBO) {
                    gateTemplate = {
                        id: gate.id,
                        type: constants.GATE_TYPE_COMBO,
                        title: gate.title,
                        creator: constants.GATE_CREATOR_PERSISTENT_HOMOLOGY,
                        typeSpecificData: {
                            gateTemplateIds: gate.gateCreatorData.gateIds
                        }
                    }
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
        }

        for (let i = 0; i < currentState.unsavedGates.length; i++) {
            const gate = currentState.unsavedGates[i]
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
    },

    applyErrorHandlerToGatingError: async (gatingErrorId, errorHandler) => {
        const gatingError = _.find(currentState.gatingErrors, e => e.id === gatingErrorId)
        const sample = _.find(currentState.samples, s => s.id === gatingError.sampleId)
        const workspace = _.find(currentState.workspaces, w => w.sampleIds.includes(gatingError.sampleId))
        const FCSFile = _.find(currentState.FCSFiles, fcs => fcs.id === sample.FCSFileId)
        const gateTemplateGroup = _.find(currentState.gateTemplateGroups, g => g.id === gatingError.gateTemplateGroupId)
        const gateTemplates = _.filter(currentState.gateTemplates, gt => gateTemplateGroup.childGateTemplateIds.includes(gt.id))

        let matchingTemplates = []
        let nonMatchingTemplates = []
        for (let gateTemplate of gateTemplates) {
            let foundTemplate = false
            for (let gate of gatingError.gates) {
                if (gateTemplate.xGroup === gate.xGroup && gateTemplate.yGroup === gate.yGroup) {
                    foundTemplate = true
                    matchingTemplates.push(gateTemplate)
                }
            }
            if (!foundTemplate) {
                nonMatchingTemplates.push(gateTemplate)
            }
        }

        if (matchingTemplates.length > 1) {
            const sampleNuclei = nonMatchingTemplates.map((template) => {
                const matchingGate = _.find(currentState.gates, g => g.id === template.exampleGateId)
                const xGroup = _.find(gatingError.gates, g => g.xGroup === template.xGroup)
                const xNucleusValue = xGroup.gateData.nucleus[0]
                const yGroup = _.find(gatingError.gates, g => g.yGroup === template.yGroup)
                const yNucleusValue = yGroup.gateData.nucleus[1]
                return [ xNucleusValue, yNucleusValue ]
            })

            const sampleYChannelZeroPeaks = nonMatchingTemplates.map((template) => {
                const matchingGate = _.find(currentState.gates, g => g.id === template.exampleGateId)
                const xGroup = _.find(gatingError.gates, g => g.xGroup === template.xGroup)
                const xNucleusValue = xGroup.gateData.nucleus[0]

                return template.typeSpecificData.includeYChannelZeroes ? xNucleusValue : null
            })

            const sampleXChannelZeroPeaks = nonMatchingTemplates.map((template) => {
                const matchingGate = _.find(currentState.gates, g => g.id === template.exampleGateId)
                const yGroup = _.find(gatingError.gates, g => g.yGroup === template.yGroup)
                const yNucleusValue = yGroup.gateData.nucleus[1]

                return template.typeSpecificData.includeXChannelZeroes ? yNucleusValue : null
            })

            const options = {
                selectedXParameterIndex: gateTemplateGroup.selectedXParameterIndex,
                selectedYParameterIndex: gateTemplateGroup.selectedYParameterIndex,
                selectedXScale: constants.SCALE_LOG,
                selectedYScale: constants.SCALE_LOG,
                machineType: FCSFile.machineType,
                sampleNuclei,
                sampleXChannelZeroPeaks,
                sampleYChannelZeroPeaks
            }

            let result = (await api.calculateHomology(sample.id, options))

            if (result.status === constants.STATUS_SUCCESS) {
                // Create the negative gate if there is one
                const negativeGate = _.find(currentState.gateTemplates, gt => gateTemplateGroup.childGateTemplateIds.includes(gt.id) && gt.type === constants.GATE_TYPE_NEGATIVE)
                if (negativeGate) {
                    const newGate = {
                        id: uuidv4(),
                        type: constants.GATE_TYPE_NEGATIVE,
                        title: FCSFile.FCSParameters[gateTemplateGroup.selectedXParameterIndex].label + ' · ' + FCSFile.FCSParameters[gateTemplateGroup.selectedYParameterIndex].label + ' Negative Gate',
                        sampleId: sample.id,
                        FCSFileId: FCSFile.id,
                        gateTemplateId: negativeGate.id,
                        selectedXParameterIndex: gateTemplateGroup.selectedXParameterIndex,
                        selectedYParameterIndex: gateTemplateGroup.selectedYParameterIndex,
                        selectedXScale: gateTemplateGroup.selectedXScale,
                        selectedYScale: gateTemplateGroup.selectedYScale,
                        gateCreator: constants.GATE_CREATOR_PERSISTENT_HOMOLOGY,
                        gateCreatorData: {},
                        includeEventIds: []
                    }

                    gates.push(newGate)
                }

                let gates = api.createGatePolygons(result.data.gates)
                gates = await api.getGateIncludedEvents(gates)

                // Create combo gates AFTER we know which events are in each smaller gate so that they can be concatted for combo gate contents
                const comboGates = _.filter(currentState.gateTemplates, gt => gateTemplateGroup.childGateTemplateIds.includes(gt.id) && gt.type === constants.GATE_TYPE_COMBO)
                for (let comboGate of comboGates) {
                    const includedGates = _.filter(gates, g => comboGate.typeSpecificData.gateTemplateIds.includes(g.gateTemplateId))

                    const newGate = {
                        id: uuidv4(),
                        type: constants.GATE_TYPE_COMBO,
                        title: FCSFile.FCSParameters[gateTemplateGroup.selectedXParameterIndex].label + ' · ' + FCSFile.FCSParameters[gateTemplateGroup.selectedYParameterIndex].label + ' Combo Gate',
                        sampleId: sample.id,
                        FCSFileId: FCSFile.id,
                        gateTemplateId: comboGate.id,
                        selectedXParameterIndex: gateTemplateGroup.selectedXParameterIndex,
                        selectedYParameterIndex: gateTemplateGroup.selectedYParameterIndex,
                        selectedXScale: gateTemplateGroup.selectedXScale,
                        selectedYScale: gateTemplateGroup.selectedYScale,
                        gateCreator: constants.GATE_CREATOR_PERSISTENT_HOMOLOGY,
                        gateCreatorData: {
                            gateIds: includedGates.map(g => g.id)
                        },
                        includeEventIds: includedGates.reduce((accumulator, current) => { return accumulator.concat(current.includeEventIds) }, [])
                    }

                    gates.push(newGate)
                }

                if (gates.length > 0) {
                    for (let i = 0; i < gates.length; i++) {
                        const gate = gates[i]
                        api.createSubSampleAndAddToWorkspace(
                            workspace.id,
                            sample.id,
                            {
                                filePath: sample.filePath,
                                FCSParameters: FCSFile.FCSParameters,
                                plotImages: {},
                                subSampleIds: [],
                                gateTemplateId: gate.gateTemplateId,
                                selectedXParameterIndex: gateTemplateGroup.selectedXParameterIndex,
                                selectedYParameterIndex: gateTemplateGroup.selectedYParameterIndex,
                                selectedXScale: gateTemplateGroup.selectedXScale,
                                selectedYScale: gateTemplateGroup.selectedYScale
                            },
                            gate,
                        )
                    }
                }

                const loadingFinishedAction = setSampleParametersLoading(sample.id, gateTemplateGroup.selectedXParameterIndex + '_' + gateTemplateGroup.selectedYParameterIndex, { loading: false, loadingMessage: null })
                currentState = applicationReducer(currentState, loadingFinishedAction)
                reduxStore.dispatch(loadingFinishedAction)

                const removeGatingErrorAction = removeGatingError(gatingErrorId)
                currentState = applicationReducer(currentState, removeGatingErrorAction)
                reduxStore.dispatch(removeGatingErrorAction)
            }
        }
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
                getImageForPlot(sample, options)

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