// -------------------------------------------------------------
// This helper imitates a backend API when using the Electron
// desktop app. It saves a flat file JSON structure in the application
// userdata folder.
// -------------------------------------------------------------

import path from 'path'
import { remote, ipcRenderer } from 'electron'
const { dialog } = remote
import fs from 'fs'
import hull from 'hull.js'
import uuidv4 from 'uuid/v4'
import _ from 'lodash'
import * as d3 from "d3"
import os from 'os'
import { getPlotImageKey, heatMapRGBForValue, getScales, getPolygonCenter, getPolygonBoundaries, getAxisGroups } from '../gatekeeper-utilities/utilities'
import constants from '../gatekeeper-utilities/constants'
import { fork } from 'child_process'
import ls from 'ls'
import rimraf from 'rimraf'
import pointInsidePolygon from 'point-in-polygon'
import polygonsIntersect from 'polygon-overlap'
import area from 'area-polygon'
import { distanceToPolygon, distanceBetweenPoints } from 'distance-to-polygon'
import isDev from 'electron-is-dev'
import { breakLongLinesIntoPoints, fixOverlappingPolygonsUsingZipper } from '../gatekeeper-utilities/polygon-utilities'
import applicationReducer from '../gatekeeper-frontend/reducers/application-reducer'
import { setPlotDimensions, setPlotDisplayDimensions, toggleShowDisabledParameters, setUnsavedGates, showGatingModal, hideGatingModal, setGatingModalErrorMessage } from '../gatekeeper-frontend/actions/application-actions'
import { createSample, updateSample, removeSample, setSamplePlotImage, setSampleParametersLoading } from '../gatekeeper-frontend/actions/sample-actions'
import { createGate } from '../gatekeeper-frontend/actions/gate-actions'
import { createGateTemplate, updateGateTemplate, removeGateTemplate } from '../gatekeeper-frontend/actions/gate-template-actions'
import { createGateTemplateGroup, updateGateTemplateGroup, removeGateTemplateGroup, addGateTemplateToGroup } from '../gatekeeper-frontend/actions/gate-template-group-actions'
import { createFCSFile, updateFCSFile, removeFCSFile } from '../gatekeeper-frontend/actions/fcs-file-actions'
import { createGatingError, updateGatingError, removeGatingError } from '../gatekeeper-frontend/actions/gating-error-actions'
import { createWorkspace, selectWorkspace, removeWorkspace, updateWorkspace, selectFCSFile, invertPlotAxis, selectGateTemplate, setFCSParametersDisabled } from '../gatekeeper-frontend/actions/workspace-actions'

import request from 'request'

let currentState = {}

let reduxStore

// Fork a new node process for doing CPU intensive jobs
let workerFork

const createFork = function () {
    console.log('starting fork')
    if (isDev) {
        workerFork = fork(__dirname + '/gatekeeper-electron/subprocess-wrapper-dev.js', [ remote.app.getPath('userData') ], { silent: true })
    } else {
        workerFork = fork(__dirname + '/webpack-build/fork.bundle.js', [ remote.app.getPath('userData') ], { silent: true })
    }
}

createFork()

const jobQueue = {}
const priorityQueue = {}

window.jobQueue = jobQueue
window.priorityQueue = priorityQueue

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
    } else if (!isPriority) {
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

for (let i = 0; i < Math.max(os.cpus().length - 2, 1); i++) {
    processJobs()
}

workerFork.stdout.on('data', async (result) => {
    if (reduxStore.getState().sessionLoading && !reduxStore.getState().sessionBroken) {
        await api.getSession()
        
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
            if (workspace.selectedFCSFileId && workspace.selectedGateTemplateId) {
                const sample = _.find(currentState.samples, s => s.gateTemplateId === workspace.selectedGateTemplateId && s.FCSFileId === workspace.selectedFCSFileId)
            }
            for (let sample of currentState.samples) {
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

const getFCSMetadata = async (workspaceId, FCSFileId, fileName) => {
    const jobId = uuidv4()

    const metadata = await new Promise((resolve, reject) => {
        pushToQueue({
            jobParameters: { url: 'http://127.0.0.1:3145', json: { jobId: jobId, type: 'get-fcs-metadata', payload: { workspaceId, FCSFileId, fileName } } },
            jobKey: uuidv4(),
            checkValidity: () => { return true },
            callback: (data) => { resolve(data) }
        }, true)
    })

    return metadata
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
            disabledParameters: {},
            hideUngatedPlots: false,
            invertedAxisPlots: {}
        }

        const createAction = createWorkspace(newWorkspace)
        currentState = applicationReducer(currentState, createAction)
        reduxStore.dispatch(createAction)

        // Add an empty Gate Template
        const gateTemplateId = uuidv4()
        const createGateTemplateAction = createGateTemplate({ id: gateTemplateId, workspaceId, title: 'New Gating Strategy' })
        currentState = applicationReducer(currentState, createGateTemplateAction)
        reduxStore.dispatch(createGateTemplateAction)

        await api.selectGateTemplate(gateTemplateId, workspaceId)

        saveSessionToDisk()

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

    // Update a gate template with arbitrary parameters
    updateGateTemplateAndRecalculate: async function (gateTemplateId, parameters) {
        const gateTemplate = _.find(currentState.gateTemplates, gt => gt.id === gateTemplateId)
        const updateAction = updateGateTemplate(gateTemplateId, parameters)
        currentState = applicationReducer(currentState, updateAction)
        reduxStore.dispatch(updateAction)

        // Update any child templates that depend on these
        if (gateTemplate.gateTemplateGroupId) {
            await api.recalculateGateTemplateGroup(gateTemplate.gateTemplateGroupId)            
        }

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
        let samplesToRecalculate = {}
        // Delete all child samples created as a result of this gate template group
        for (let sample of _.filter(currentState.samples, s => _.find(currentState.gateTemplates, gt => gt.id === s.gateTemplateId).gateTemplateGroupId === gateTemplateGroupId)) {
            samplesToRecalculate[sample.parentSampleId] = true
            const removeAction = removeSample(sample.id)
            currentState = applicationReducer(currentState, removeAction)
            reduxStore.dispatch(removeAction)
        }

        for (let sampleId of _.keys(samplesToRecalculate)) {
             api.applyGateTemplatesToSample(sampleId)
        }
    },

    applyGateTemplatesToSample: async function (sampleId) {
        const sample = _.find(currentState.samples, s => s.id === sampleId)
        const FCSFile = _.find(currentState.FCSFiles, fcs => sample.FCSFileId === fcs.id)
        // Find all template groups that apply to this sample
        const templateGroups = _.filter(currentState.gateTemplateGroups, g => g.parentGateTemplateId === sample.gateTemplateId)
        for (let templateGroup of templateGroups) {
            if (templateGroup.creator === constants.GATE_CREATOR_PERSISTENT_HOMOLOGY) {
                // If there hasn't been any gates generated for this sample, try generating them, otherwise leave them as they are
                if (!_.find(currentState.samples, s => s.parentSampleId === sampleId && _.find(currentState.gateTemplates, gt => gt.id === s.gateTemplateId).gateTemplateGroupId === templateGroup.id)) {

                    const gatingError = _.find(currentState.gatingErrors, e => e.sampleId === sampleId && e.gateTemplateGroupId === templateGroup.id)
                    if (gatingError) {
                        const removeGatingErrorAction = removeGatingError(gatingError.id)
                        currentState = applicationReducer(currentState, removeGatingErrorAction)
                        reduxStore.dispatch(removeGatingErrorAction)
                    }
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

                    let homologyResult = await api.calculateHomology(sampleId, options)

                    if (homologyResult.status === constants.STATUS_SUCCESS) {
                        let gates = api.createGatePolygons(homologyResult.data.gates)
                        // Create the negative gate if there is one
                        const negativeGate = _.find(currentState.gateTemplates, gt => gt.gateTemplateGroupId === templateGroup.id && gt.type === constants.GATE_TYPE_NEGATIVE)
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

                        // Create the double zero gate if there is one
                        const doubleZeroGate = _.find(currentState.gateTemplates, gt => gt.gateTemplateGroupId === templateGroup.id && gt.type === constants.GATE_TYPE_DOUBLE_ZERO)
                        if (doubleZeroGate) {
                            const newGate = {
                                id: uuidv4(),
                                type: constants.GATE_TYPE_DOUBLE_ZERO,
                                title: FCSFile.FCSParameters[templateGroup.selectedXParameterIndex].label + ' · ' + FCSFile.FCSParameters[templateGroup.selectedYParameterIndex].label + ' Double Zero Gate',
                                sampleId: sampleId,
                                FCSFileId: FCSFile.id,
                                gateTemplateId: doubleZeroGate.id,
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

                        gates = await api.getGateIncludedEvents(gates)

                        // Create combo gates AFTER we know which events are in each smaller gate so that they can be concatted for combo gate contents
                        const comboGates = _.filter(currentState.gateTemplates, gt => gt.gateTemplateGroupId === templateGroup.id && gt.type === constants.GATE_TYPE_COMBO)
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
                                gate.workspaceId = sample.workspaceId
                                api.createSubSampleAndAddToWorkspace(
                                    sample.workspaceId,
                                    sampleId,
                                    {
                                        parentSampleId: sampleId,
                                        workspaceId: sample.workspaceId,
                                        FCSFileId: sample.FCSFileId,
                                        filePath: sample.filePath,
                                        title: gate.title,
                                        FCSParameters: FCSFile.FCSParameters,
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
        for (let subSample of _.filter(currentState.samples, s => s.parentSampleId === sampleId)) {
            await api.applyGateTemplatesToSample(subSample.id)
        }
    },

    createFCSFileAndAddToWorkspace: async function (workspaceId, FCSFileParameters) {
        const FCSFileId = uuidv4()

        // Find the associated workspace
        let workspace = _.find(currentState.workspaces, w => w.id === workspaceId)

        let FCSFile = {
            id: FCSFileId,
            workspaceId: workspaceId,
            filePath: FCSFileParameters.filePath,
            title: FCSFileParameters.title,
            description: FCSFileParameters.description,
        }

        const createFCSFileAction = createFCSFile(FCSFile)
        currentState = applicationReducer(currentState, createFCSFileAction)
        reduxStore.dispatch(createFCSFileAction)

        const selectAction = selectFCSFile(FCSFileId, workspaceId)
        currentState = applicationReducer(currentState, selectAction)
        reduxStore.dispatch(selectAction)

        // Import the fcs file
        await new Promise((resolve, reject) => {
            pushToQueue({
                jobParameters: { url: 'http://127.0.0.1:3145', json: { jobId: uuidv4(), type: 'import-fcs-file', payload: { workspaceId, FCSFileId, filePath: FCSFile.filePath } } },
                jobKey: uuidv4(),
                checkValidity: () => { return true },
                callback: (data) => { resolve(data) }
            }, true)
        })

        const FCSMetaData = await getFCSMetadata(workspaceId, FCSFileId, FCSFile.title)

        const updateAction = updateFCSFile(FCSFileId, FCSMetaData)
        currentState = applicationReducer(currentState, updateAction)
        reduxStore.dispatch(updateAction)

        const sampleId = uuidv4()
        const rootGateTemplate = _.find(currentState.gateTemplates, gt => gt.workspaceId === workspace.id && !gt.gateTemplateGroupId)
        const createSampleAction = createSample({
            id: sampleId,
            workspaceId: workspaceId,
            FCSFileId,
            gateTemplateId: rootGateTemplate && rootGateTemplate.id,
            title: 'Root Sample',
            description: 'Top level root sample for this FCS File',
            populationCount: FCSMetaData.populationCount
        })
        currentState = applicationReducer(currentState, createSampleAction)
        reduxStore.dispatch(createSampleAction)

        const workspaceParameters = {
            selectedXScale: FCSMetaData.machineType === constants.MACHINE_CYTOF ? constants.SCALE_LOG : constants.SCALE_BIEXP,
            selectedYScale: FCSMetaData.machineType === constants.MACHINE_CYTOF ? constants.SCALE_LOG : constants.SCALE_BIEXP
        }

        const updateWorkspaceAction = updateWorkspace(workspaceId, workspaceParameters)
        currentState = applicationReducer(currentState, updateWorkspaceAction)
        reduxStore.dispatch(updateWorkspaceAction)

        const sample = _.find(currentState.samples, s => s.id === sampleId)

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
            parentSampleId: sampleParameters.parentSampleId,
            FCSFileId: parentSample.FCSFileId,
            workspaceId: sampleParameters.workspaceId,
            title: sampleParameters.title,
            description: sampleParameters.description,
            gateTemplateId: sampleParameters.gateTemplateId,
            parametersLoading: [],
        }

        gateParameters.id = gateId
        gateParameters.childSampleId = sampleId
        gateParameters.parentSampleId = sampleParameters.parentSampleId

        // If there was no title specified, auto generate one
        let title = 'Subsample'

        sample.populationCount = gateParameters.includeEventIds.length

        const backendSample = _.cloneDeep(sample)
        backendSample.includeEventIds = gateParameters.includeEventIds

        currentState = applicationReducer(currentState, createSample(backendSample))
        reduxStore.dispatch(createSample(sample))

        currentState = applicationReducer(currentState, createGate(gateParameters))
        reduxStore.dispatch(createGate(gateParameters))

        // If the gate template doesn't have an example gate yet, use this one
        const gateTemplate = _.find(currentState.gateTemplates, gt => gt.id === gateParameters.gateTemplateId)
        if (!gateTemplate.exampleGateId) {
            await api.setGateTemplateExampleGate(gateTemplate.id, gateId)
        }

        const updatedSample = _.find(currentState.samples, s => s.id === sample.id)

        saveSessionToDisk()
    },

    removeSample: async function (sampleId) {
        const removeAction = removeSample(sampleId)

        currentState = applicationReducer(currentState, removeAction)
        reduxStore.dispatch(removeAction)

        saveSessionToDisk()
    },

    saveSampleAsCSV: function (sampleId) {
        const sample = _.find(currentState.samples, s => s.id === sampleId)
        const FCSFile = _.find(currentState.FCSFiles, fcs => fcs.id === sample.FCSFileId)
        dialog.showSaveDialog({ title: `Save Population as CSV`, message: `Save Population as CSV`, defaultPath: `${sample.title}.csv`, filters: [{ name: 'CSV', extensions: ['csv'] }] }, (filePath) => {
            if (filePath) {
                new Promise((resolve, reject) => {
                    pushToQueue({
                        jobParameters: { url: 'http://127.0.0.1:3145', json: { type: 'save-subsample-to-csv', payload: { sample, FCSFile, filePath } } },
                        jobKey: uuidv4(),
                        checkValidity: () => { return true },
                        callback: (data) => { resolve(data) }
                    }, true)
                })
            }
        })
    },

    selectFCSFile: async function (FCSFileId, workspaceId) {
        const selectAction = selectFCSFile(FCSFileId, workspaceId)
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
            }
        }
    },

    setFCSParametersDisabled: async function (workspaceId, parameters) {
        const workspace = _.find(currentState.workspaces, w => w.id === workspaceId)

        const setAction = setFCSParametersDisabled(workspaceId, parameters)
        currentState = applicationReducer(currentState, setAction)
        reduxStore.dispatch(setAction)

        saveSessionToDisk()
    },

    createUnsavedGatesUsingHomology: async function (workspaceId, FCSFileId, sampleId, options) {
        // Dispatch a redux action to mark the gate template as loading
        let loadingMessage = 'Creating gates using Persistent Homology...'

        let loadingAction = setSampleParametersLoading(sampleId, options.selectedXParameterIndex + '_' + options.selectedYParameterIndex, { loading: true, loadingMessage: loadingMessage})
        currentState = applicationReducer(currentState, loadingAction)
        reduxStore.dispatch(loadingAction)
        
        let homologyResult = await api.calculateHomology(workspaceId, FCSFileId, sampleId, options)

        if (homologyResult.status === constants.STATUS_SUCCESS) {
            const gates = api.createGatePolygons(homologyResult.data.gates)
            const setUnsavedGatesAction = setUnsavedGates(gates)
            reduxStore.dispatch(setUnsavedGatesAction)

            api.updateUnsavedGateDerivedData()
        } else {
            const createErrorAction = setGatingModalErrorMessage(homologyResult.error)
            reduxStore.dispatch(createErrorAction)
        }

        const loadingFinishedAction = setSampleParametersLoading(sampleId, options.selectedXParameterIndex + '_' + options.selectedYParameterIndex, { loading: false, loadingMessage: null })
        currentState = applicationReducer(currentState, loadingFinishedAction)
        reduxStore.dispatch(loadingFinishedAction)
    },

    resetUnsavedGates () {
        const setUnsavedGatesAction = setUnsavedGates(null)
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
    calculateHomology: async function (workspaceId, FCSFileId, sampleId, options) {
        const sample = _.find(currentState.samples, s => s.id === sampleId)
        const FCSFile = _.find(currentState.FCSFiles, fcs => fcs.id === sample.FCSFileId)

        let gateTemplate = _.find(currentState.gateTemplates, gt => gt.id === sample.gateTemplateId)
        let gateTemplateGroup = _.find(currentState.gateTemplateGroups, (group) => {
            return group.parentGateTemplateId === sample.gateTemplateId 
                && group.selectedXParameterIndex === options.selectedXParameterIndex
                && group.selectedYParameterIndex === options.selectedYParameterIndex
                && group.selectedXScale === options.selectedXScale
                && group.selectedYScale === options.selectedYScale
                && group.machineType === FCSFile.machineType
        })

        if (!sample) { console.log('Error in calculateHomology(): no sample with id ', sampleId, 'was found'); return }

        let homologyOptions = { workspaceId, FCSFileId, sampleId, options }

        homologyOptions.options.plotWidth = currentState.plotWidth
        homologyOptions.options.plotHeight = currentState.plotHeight

        if (options.seedPeaks) {
            homologyOptions.options.seedPeaks = options.seedPeaks
        }

        // If there are already gating templates defined for this parameter combination
        if (gateTemplateGroup) {
            const gateTemplates = _.filter(currentState.gateTemplates, gt => gt.gateTemplateGroupId === gateTemplateGroup.id)
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
                jobParameters: { url: 'http://127.0.0.1:3145', json: _.merge(postBody, { jobId: uuidv4() }) },
                jobKey: uuidv4(),
                checkValidity,
                callback: (data) => { resolve(data) }
            }, true)
        })

        if (!checkValidity()) {
            return {
                status: constants.STATUS_FAIL,
                message: 'Error calculating homology, sample or gate template group has been deleted'
            }
        }

        // If it was a real error (i.e. a caught programmatic error) return the result
        if (homologyResult.status === constants.STATUS_FAIL && !homologyResult.data) {
            return homologyResult
        }

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

        homologyOptions.gates = gates

        // Expand gates to include zero value data
        if (FCSFile.machineType === constants.MACHINE_CYTOF) {
            gates = await new Promise((resolve, reject) => {
                pushToQueue({
                    jobParameters: { url: 'http://127.0.0.1:3145', json: { type: 'get-expanded-gates', payload: homologyOptions } },
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

        if (reduxStore.getState().unsavedGates && reduxStore.getState().unsavedGates.length > 0) {
            api.updateUnsavedGateDerivedData()
        }
    },

    hideGatingModal () {
        const hideGatingModalAction = hideGatingModal()
        currentState = applicationReducer(currentState, hideGatingModalAction)
        reduxStore.dispatch(hideGatingModalAction)
    },

    createGatePolygons (gates) {
        const CYTOF_HISTOGRAM_WIDTH = Math.round(Math.min(currentState.plotWidth, currentState.plotHeight) * 0.07)
        const maxYValue = currentState.plotHeight - CYTOF_HISTOGRAM_WIDTH

        const filteredGates = _.filter(gates, g => g.type === constants.GATE_TYPE_POLYGON)
        filteredGates.map((gate) => { gate.renderedPolygon = breakLongLinesIntoPoints(gate.gateData.polygons[gate.gateCreatorData.truePeakWidthIndex + gate.gateCreatorData.widthIndex]) })
        const overlapFixed = fixOverlappingPolygonsUsingZipper(filteredGates.map(g => g.renderedPolygon))
        for (let i = 0; i < filteredGates.length; i++) {
            filteredGates[i].renderedPolygon = overlapFixed[i]
            filteredGates[i].renderedXCutoffs = []
            filteredGates[i].renderedYCutoffs = []
        }

        const yExpanded = _.filter(filteredGates, g => g.type === constants.GATE_TYPE_POLYGON && g.gateCreatorData.includeYChannelZeroes).sort((a, b) => { return a.gateData.nucleus[0] - b.gateData.nucleus[0] })
        for (let i = 0; i < yExpanded.length; i++) {
            const gate = yExpanded[i]
            const xBoundaries = getPolygonBoundaries(gate.gateData.polygons[gate.gateCreatorData.truePeakWidthIndex + gate.gateCreatorData.widthIndex])[0]

            for (let j = i + 1; j < yExpanded.length; j++) {
                const gate2 = yExpanded[j]
                const xBoundaries2 = getPolygonBoundaries(gate2.gateData.polygons[gate2.gateCreatorData.truePeakWidthIndex + gate2.gateCreatorData.widthIndex])[0]

                if (xBoundaries[1][0] > xBoundaries2[0][0]) {
                    gate.renderedYCutoffs[1] = Math.round((xBoundaries[1][0] + xBoundaries2[0][0]) / 2) - 1
                    gate2.renderedYCutoffs[0] = Math.round((xBoundaries[1][0] + xBoundaries2[0][0]) / 2) + 1
                }
            }

            if (!gate.renderedYCutoffs[0]) {
                gate.renderedYCutoffs[0] = xBoundaries[0][0]
            }

            if (!gate.renderedYCutoffs[1]) {
                gate.renderedYCutoffs[1] = xBoundaries[1][0]
            }

            // Find the most appropriate point to connect x axis cutoffs to so that the peak doesn't overlap nearby peaks
            // 0 and 1 correspond to the minimum and maximum cutoffs on the axis
            let closestDistance0 = Infinity
            let closestIndex0

            let closestDistance1 = Infinity
            let closestIndex1
            for (let j = 0; j < gate.renderedPolygon.length; j++) {
                const point = gate.renderedPolygon[j]
                if (Math.abs(point[0] - gate.renderedYCutoffs[0]) < closestDistance0) {
                    let intersect = false
                    for (let g of filteredGates) {
                        if (g.id !== gate.id) {
                            intersect = intersect || polygonsIntersect(g.renderedPolygon, [[gate.renderedYCutoffs[0], maxYValue], point, [gate.renderedYCutoffs[0], maxYValue]])
                        }
                    }

                    if (!intersect) {
                        closestDistance0 = Math.abs(point[0] - gate.renderedYCutoffs[0])
                        closestIndex0 = j
                    }
                }

                if (Math.abs(point[0] - gate.renderedYCutoffs[1]) < closestDistance1) {
                    let intersect = false
                    for (let g of filteredGates) {
                        if (g.id !== gate.id) {
                            intersect = intersect || polygonsIntersect(g.renderedPolygon, [[gate.renderedYCutoffs[1], maxYValue], point, [gate.renderedYCutoffs[1], maxYValue]])
                        }
                    }

                    if (!intersect) {
                        closestDistance1 = Math.abs(point[0] - gate.renderedYCutoffs[1])
                        closestIndex1 = j
                    }
                }
            }

            // If we couldn't find any closest index that doesn't cause an intersection, just use the closest point on the polygon
            if (!closestIndex0) {
                for (let j = 0; j < gate.renderedPolygon.length; j++) {
                    const point = gate.renderedPolygon[j]
                    
                    if (distanceBetweenPoints(point, [gate.renderedYCutoffs[0], maxYValue]) < closestDistance0) {
                        closestDistance0 = Math.round(distanceBetweenPoints(point, [gate.renderedYCutoffs[0], maxYValue]))
                        closestIndex0 = j
                    }
                }
            }
            
            if (!closestIndex1) {
                for (let j = 0; j < gate.renderedPolygon.length; j++) {
                    const point = gate.renderedPolygon[j]

                    if (distanceBetweenPoints(point, [gate.renderedYCutoffs[1], maxYValue]) < closestDistance1) {
                        closestDistance1 = Math.round(distanceBetweenPoints(point, [gate.renderedYCutoffs[1], maxYValue]))
                        closestIndex1 = j
                    }
                }
            }

            let newPolygon = []
            let shouldAdd = true
            for (let j = 0; j < gate.renderedPolygon.length; j++) {
                const point = gate.renderedPolygon[j]
                if (shouldAdd) {
                    newPolygon.push(point)
                }
                if (j === closestIndex1) {
                    // Insert the new 0 edge points
                    if (gate.gateCreatorData.includeXChannelZeroes) {
                        newPolygon = newPolygon.concat([
                            [gate.renderedYCutoffs[1], maxYValue],
                            [0, maxYValue]
                        ])
                        gate.renderedYCutoffs[0] = 0
                    } else {
                        newPolygon = newPolygon.concat([
                            [gate.renderedYCutoffs[1], maxYValue],
                            [gate.renderedYCutoffs[0], maxYValue]
                        ])
                    }
                    shouldAdd = false
                } else if (j === closestIndex0) {
                    shouldAdd = true
                }
            }

            newPolygon = breakLongLinesIntoPoints(newPolygon)
            // Recalculate the polygon boundary
            gate.renderedPolygon = hull(newPolygon, 50)
        }

        const xExpanded = _.filter(filteredGates, g => g.type === constants.GATE_TYPE_POLYGON && g.gateCreatorData.includeXChannelZeroes).sort((a, b) => { return a.gateData.nucleus[1] - b.gateData.nucleus[1] })
        for (let i = 0; i < xExpanded.length; i++) {
            const gate = xExpanded[i]
            const yBoundaries = getPolygonBoundaries(gate.gateData.polygons[gate.gateCreatorData.truePeakWidthIndex + gate.gateCreatorData.widthIndex])[1]

            for (let j = i + 1; j < xExpanded.length; j++) {
                const gate2 = xExpanded[j]
                const yBoundaries2 = getPolygonBoundaries(gate2.gateData.polygons[gate2.gateCreatorData.truePeakWidthIndex + gate2.gateCreatorData.widthIndex])[1]

                if (yBoundaries[1][1] > yBoundaries2[0][1]) {
                    gate.renderedXCutoffs[1] = Math.round((yBoundaries[1][1] + yBoundaries2[0][1]) / 2) - 1
                    gate2.renderedXCutoffs[0] = Math.round((yBoundaries[1][1] + yBoundaries2[0][1]) / 2) + 1
                }
            }

            if (!gate.renderedXCutoffs[0]) {
                gate.renderedXCutoffs[0] = yBoundaries[0][1]
            }

            if (!gate.renderedXCutoffs[1]) {
                gate.renderedXCutoffs[1] = yBoundaries[1][1]
            }

            // Find the most appropriate point to connect x axis cutoffs to so that the peak doesn't overlap nearby peaks
            // 0 and 1 correspond to the minimum and maximum cutoffs on the axis
            let closestDistance0 = Infinity
            let closestIndex0

            let closestDistance1 = Infinity
            let closestIndex1
            for (let j = 0; j < gate.renderedPolygon.length; j++) {
                const point = gate.renderedPolygon[j]
                if (Math.abs(point[1] - gate.renderedXCutoffs[0]) < closestDistance0) {
                    let intersect = false
                    for (let g of filteredGates) {
                        if (g.id !== gate.id) {
                            intersect = intersect || polygonsIntersect(g.renderedPolygon, [[0, gate.renderedXCutoffs[0]], point, [0, gate.renderedXCutoffs[0]]])
                        }
                    }

                    if (!intersect) {
                        closestDistance0 = Math.abs(point[1] - gate.renderedXCutoffs[0])
                        closestIndex0 = j
                    }
                }

                if (Math.abs(point[1] - gate.renderedXCutoffs[1]) < closestDistance1) {
                    let intersect = false
                    for (let g of filteredGates) {
                        if (g.id !== gate.id) {
                            intersect = intersect || polygonsIntersect(g.renderedPolygon, [[0, gate.renderedXCutoffs[1]], point, [0, gate.renderedXCutoffs[1]]])
                        }
                    }

                    if (!intersect) {
                        closestDistance1 = Math.abs(point[1] - gate.renderedXCutoffs[1])
                        closestIndex1 = j
                    }
                }
            }

            // If we couldn't find any closest index that doesn't cause an intersection, just use the closest point on the polygon
            if (!closestIndex0) {
                for (let j = 0; j < gate.renderedPolygon.length; j++) {
                    const point = gate.renderedPolygon[j]
                    
                    if (distanceBetweenPoints(point, [0, gate.renderedXCutoffs[0]]) < closestDistance0) {
                        closestDistance0 = Math.round(distanceBetweenPoints(point, [0, gate.renderedXCutoffs[0]]))
                        closestIndex0 = j
                    }
                }
            }

            if (!closestIndex1) {
                for (let j = 0; j < gate.renderedPolygon.length; j++) {
                    const point = gate.renderedPolygon[j]

                    if (distanceBetweenPoints(point, [0, gate.renderedXCutoffs[1]]) < closestDistance1) {
                        closestDistance1 = Math.round(distanceBetweenPoints(point, [0, gate.renderedXCutoffs[1]]))
                        closestIndex1 = j
                    }
                }
            }

            let newPolygon = []
            let shouldAdd = true
            for (let j = 0; j < gate.renderedPolygon.length; j++) {
                const point = gate.renderedPolygon[j]
                if (shouldAdd) {
                    newPolygon.push(point)
                }
                if ((!gate.gateCreatorData.includeYChannelZeroes && j === closestIndex1) || (gate.gateCreatorData.includeYChannelZeroes && point[0] === 0 && point[1] === maxYValue)) {
                    // Insert the new 0 edge points
                    if (gate.gateCreatorData.includeYChannelZeroes) {
                        newPolygon = newPolygon.concat([
                            [0, maxYValue],
                            [0, gate.renderedXCutoffs[0]]
                        ])
                        gate.renderedXCutoffs[1] = maxYValue
                    } else {
                        newPolygon = newPolygon.concat([
                            [0, gate.renderedXCutoffs[1]],
                            [0, gate.renderedXCutoffs[0]]
                        ])
                    }

                    shouldAdd = false
                } else if (j === closestIndex0) {
                    shouldAdd = true
                }
            }

            newPolygon = breakLongLinesIntoPoints(newPolygon)
            // Recalculate the polygon boundary

            gate.renderedPolygon = hull(newPolygon, 50)
        }

        return filteredGates.concat(_.filter(gates, g => g.type !== constants.GATE_TYPE_POLYGON))
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
            reduxStore.dispatch(setUnsavedGatesAction)
        }

        const toSave = api.createGatePolygons(reduxStore.getState().unsavedGates)
        saveGates(toSave)
        
        api.getGateIncludedEvents(reduxStore.getState().unsavedGates).then((newUnsavedGates) => {
            if (!reduxStore.getState().unsavedGates) {
                return
            }
            
            const toSave = newUnsavedGates.map((gate) => {
                const updatedGate = _.find(reduxStore.getState().unsavedGates, g => g.id === gate.id)
                updatedGate.includeEventIds = gate.includeEventIds
                return updatedGate
            })

            // Update event counts on combo gates
            for (let gate of toSave) {
                if (gate.type === constants.GATE_TYPE_COMBO) {
                    const includedGates = _.filter(reduxStore.getState().unsavedGates, g => gate.gateCreatorData.gateIds.includes(g.id))
                    gate.includeEventIds = includedGates.reduce((accumulator, current) => { return accumulator.concat(current.includeEventIds) }, [])
                }
            }

            saveGates(toSave)
        })
    },

    updateUnsavedGate: async function (gateId, parameters) {
        const gateIndex = _.findIndex(reduxStore.getState().unsavedGates, g => g.id === gateId)
        if (gateIndex > -1) {
            const newGate = _.merge(_.cloneDeep(reduxStore.getState().unsavedGates[gateIndex]), parameters)
            newGate.gateCreatorData.widthIndex = Math.max(Math.min(newGate.gateCreatorData.widthIndex, newGate.gateData.polygons.length - 1 - newGate.gateCreatorData.truePeakWidthIndex), - newGate.gateCreatorData.truePeakWidthIndex)
            const newUnsavedGates = reduxStore.getState().unsavedGates.slice(0, gateIndex).concat(newGate).concat(reduxStore.getState().unsavedGates.slice(gateIndex + 1))
        
            const setUnsavedGatesAction = setUnsavedGates(newUnsavedGates)
            reduxStore.dispatch(setUnsavedGatesAction)

            api.updateUnsavedGateDerivedData()
        } else {
            console.log('Error in updateUnsavedGate: no gate with id ', gateId, 'was found.')
        }
    },

    removeUnsavedGate (gateId) {
        const gateIndex = _.findIndex(reduxStore.getState().unsavedGates, g => g.id === gateId)
        if (gateIndex > -1) {
            const newUnsavedGates = reduxStore.getState().unsavedGates.slice(0, gateIndex).concat(reduxStore.getState().unsavedGates.slice(gateIndex + 1))
            const polyGates = _.filter(reduxStore.getState().unsavedGates, g => g.type === constants.GATE_TYPE_POLYGON)
            const axisGroups = getAxisGroups(polyGates.map((g) => { return { id: g.id, nucleus: g.gateData.nucleus } }))
            for (let gate of polyGates) {
                gate.xGroup = _.findIndex(axisGroups.xGroups, g => g.peaks.includes(gate.id))
                gate.yGroup = _.findIndex(axisGroups.yGroups, g => g.peaks.includes(gate.id))

                const template = _.find(currentState.gateTemplates, gt => gt.xGroup === gate.xGroup && gt.yGroup === gate.yGroup)
                if (template) {
                    gate.gateTemplateId = template.id
                }
            }
            const setUnsavedGatesAction = setUnsavedGates(newUnsavedGates)
            reduxStore.dispatch(setUnsavedGatesAction)
        } else {
            console.log('Error in updateUnsavedGate: no gate with id ', gateId, 'was found.')
        }
    },

    setUnsavedNegativeGateVisible (visible) {
        if (visible) {
            const firstGate = reduxStore.getState().unsavedGates.slice(0, 1)[0]
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
            const newUnsavedGates = reduxStore.getState().unsavedGates.concat([newGate])
            const setUnsavedGatesAction = setUnsavedGates(newUnsavedGates)
            reduxStore.dispatch(setUnsavedGatesAction)

            api.updateUnsavedGateDerivedData()
        } else {
            const gateIndex = _.findIndex(reduxStore.getState().unsavedGates, g => g.type === constants.GATE_TYPE_NEGATIVE)
            if (gateIndex > -1) {
                const newUnsavedGates = reduxStore.getState().unsavedGates.slice(0, gateIndex).concat(reduxStore.getState().unsavedGates.slice(gateIndex + 1))
                const setUnsavedGatesAction = setUnsavedGates(newUnsavedGates)
                reduxStore.dispatch(setUnsavedGatesAction)
            } else {
                console.log('Error trying to toggle negative unsaved gate, no negative gate was found.')
            }
        }
    },

    setUnsavedDoubleZeroGateVisible (visible) {
        if (visible) {
            const firstGate = reduxStore.getState().unsavedGates.slice(0, 1)[0]
            const FCSFile = _.find(currentState.FCSFiles, fcs => fcs.id === firstGate.FCSFileId)
            const newGate = {
                id: uuidv4(),
                type: constants.GATE_TYPE_DOUBLE_ZERO,
                title: FCSFile.FCSParameters[firstGate.selectedXParameterIndex].label + ' · ' + FCSFile.FCSParameters[firstGate.selectedYParameterIndex].label + ' Double Zero Gate',
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
            const newUnsavedGates = reduxStore.getState().unsavedGates.concat([newGate])
            const setUnsavedGatesAction = setUnsavedGates(newUnsavedGates)
            reduxStore.dispatch(setUnsavedGatesAction)

            api.updateUnsavedGateDerivedData()
        } else {
            const gateIndex = _.findIndex(reduxStore.getState().unsavedGates, g => g.type === constants.GATE_TYPE_DOUBLE_ZERO)
            if (gateIndex > -1) {
                const newUnsavedGates = reduxStore.getState().unsavedGates.slice(0, gateIndex).concat(reduxStore.getState().unsavedGates.slice(gateIndex + 1))
                const setUnsavedGatesAction = setUnsavedGates(newUnsavedGates)
                reduxStore.dispatch(setUnsavedGatesAction)
            } else {
                console.log('Error trying to toggle double zero unsaved gate, no double zero gate was found.')
            }
        }
    },

    createUnsavedComboGate (gateIds) {
        const firstGate = reduxStore.getState().unsavedGates.slice(0, 1)[0]
        const FCSFile = _.find(currentState.FCSFiles, fcs => fcs.id === firstGate.FCSFileId)
        const includedGates = _.filter(reduxStore.getState().unsavedGates, g => gateIds.includes(g.id))

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
        const newUnsavedGates = reduxStore.getState().unsavedGates.concat([newGate])
        const setUnsavedGatesAction = setUnsavedGates(newUnsavedGates)
        reduxStore.dispatch(setUnsavedGatesAction)
    },

    applyUnsavedGatesToSample: async (sampleId, options) => {
        const sample = _.find(currentState.samples, s => s.id === sampleId)
        const FCSFile = _.find(currentState.FCSFiles, fcs => fcs.id === sample.FCSFileId)
        // Find if there is already a gate template group for this combination or not
        let gateTemplateGroup = _.find(currentState.gateTemplateGroups, g => g.parentGateTemplateId === sample.gateTemplateId && g.selectedXParameterIndex === options.selectedXParameterIndex && g.selectedYParameterIndex === options.selectedYParameterIndex)
        let gateTemplateGroupExists = !!gateTemplateGroup

        if (gateTemplateGroup) {
            for (let gate of reduxStore.getState().unsavedGates) {
                if (!gate.gateTemplateId) {
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
                    } else if (gate.type === constants.GATE_TYPE_DOUBLE_ZERO) {
                        gateTemplate = {
                            id: gate.id,
                            type: constants.GATE_TYPE_DOUBLE_ZERO,
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

                    gate.gateTemplateId = gateTemplate.id
                    gateTemplate.gateTemplateGroupId = gateTemplateGroup.id
                    gateTemplate.workspaceId = sample.workspaceId

                    const createGateTemplateAction = createGateTemplate(gateTemplate)
                    currentState = applicationReducer(currentState, createGateTemplateAction)
                    reduxStore.dispatch(createGateTemplateAction)
                }

                // Delete all child samples created as a result of this gate template group
                const matchingSample = _.find(currentState.samples, s => s.gateTemplateId === gate.gateTemplateId && s.parentSampleId === sample.id)
                if (matchingSample) {
                    const removeAction = removeSample(matchingSample.id)
                    currentState = applicationReducer(currentState, removeAction)
                    reduxStore.dispatch(removeAction)
                }
            }
        } else {
            const gateTemplateGroupId = uuidv4()
            // Create a Gate Template Group for this parameter combination
            const newGateTemplateGroup = {
                id: gateTemplateGroupId,
                workspaceId: sample.workspaceId,
                title: FCSFile.FCSParameters[options.selectedXParameterIndex].label + ' · ' + FCSFile.FCSParameters[options.selectedYParameterIndex].label,
                creator: constants.GATE_CREATOR_PERSISTENT_HOMOLOGY,
                selectedXParameterIndex: options.selectedXParameterIndex,
                selectedYParameterIndex: options.selectedYParameterIndex,
                selectedXScale: options.selectedXScale,
                selectedYScale: options.selectedYScale,
                machineType: FCSFile.machineType,
                parentGateTemplateId: sample.gateTemplateId,
                expectedGates: [],
                typeSpecificData: options
            }

            const newGateTemplates = reduxStore.getState().unsavedGates.map((gate, index) => {
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
                } else if (gate.type === constants.GATE_TYPE_DOUBLE_ZERO) {
                    gateTemplate = {
                        id: gate.id,
                        type: constants.GATE_TYPE_DOUBLE_ZERO,
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

                gate.gateTemplateId = gateTemplate.id
                gateTemplate.gateTemplateGroupId = newGateTemplateGroup.id
                gateTemplate.workspaceId = sample.workspaceId
        
                const createGateTemplateAction = createGateTemplate(gateTemplate)
                currentState = applicationReducer(currentState, createGateTemplateAction)
                reduxStore.dispatch(createGateTemplateAction)
                return gateTemplate
            })

            const createGateTemplateGroupAction = createGateTemplateGroup(newGateTemplateGroup)
            currentState = applicationReducer(currentState, createGateTemplateGroupAction)
            reduxStore.dispatch(createGateTemplateGroupAction)

            gateTemplateGroup = _.find(currentState.gateTemplateGroups, g => g.id === gateTemplateGroupId)
        }

        const minPeakSize = _.filter(reduxStore.getState().unsavedGates, g => g.type === constants.GATE_TYPE_POLYGON).reduce((accumulator, current) => {
            return Math.min(accumulator, area(current.gateData.polygons[current.gateCreatorData.truePeakWidthIndex]))
        }, Infinity)

        const updateGateTemplateGroupAction = updateGateTemplateGroup(gateTemplateGroup.id, {
            typeSpecificData: _.merge(gateTemplateGroup.typeSpecificData, {
                minPeakSize: Math.min(minPeakSize, options.minPeakSize || gateTemplateGroup.typeSpecificData.minPeakSize),
                minPeakHeight: options.minPeakHeight
            })
        })
        currentState = applicationReducer(currentState, updateGateTemplateGroupAction)
        reduxStore.dispatch(updateGateTemplateGroupAction)

        for (let i = 0; i < reduxStore.getState().unsavedGates.length; i++) {
            const gate = reduxStore.getState().unsavedGates[i]
            gate.workspaceId = sample.workspaceId
            await api.createSubSampleAndAddToWorkspace(
                sample.workspaceId,
                sampleId,
                {
                    parentSampleId: sampleId,
                    workspaceId: sample.workspaceId,
                    FCSFileId: sample.FCSFileId,
                    title: gate.title,
                    filePath: sample.filePath,
                    FCSParameters: FCSFile.FCSParameters,
                    gateTemplateId: gate.gateTemplateId,
                    selectedXParameterIndex: options.selectedXParameterIndex,
                    selectedYParameterIndex: options.selectedYParameterIndex,
                    selectedXScale: options.selectedXScale,
                    selectedYScale: options.selectedYScale
                },
                gate,
            )
        }

        let gatingError = _.find(currentState.gatingErrors, e => gateTemplateGroup && e.gateTemplateGroupId === gateTemplateGroup.id && e.sampleId === sample.id)
        if (gatingError) {
            const removeGatingErrorAction = removeGatingError(gatingError.id)
            currentState = applicationReducer(currentState, removeGatingErrorAction)
            reduxStore.dispatch(removeGatingErrorAction)
        }
        
        let samplesToRecalculate = _.filter(currentState.samples, s => s.gateTemplateId === sample.gateTemplateId)
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
        const FCSFile = _.find(currentState.FCSFiles, fcs => fcs.id === sample.FCSFileId)
        const gateTemplateGroup = _.find(currentState.gateTemplateGroups, g => g.id === gatingError.gateTemplateGroupId)
        const gateTemplates = _.filter(currentState.gateTemplates, gt => gt.gateTemplateGroupId === gateTemplateGroup.id)

        const loadingStartedAction = setSampleParametersLoading(sample.id, gateTemplateGroup.selectedXParameterIndex + '_' + gateTemplateGroup.selectedYParameterIndex, { loading: true, loadingMessage: 'Recalculating Gates...' })
        currentState = applicationReducer(currentState, loadingStartedAction)
        reduxStore.dispatch(loadingStartedAction)

        let result
        if (errorHandler.type === constants.GATING_ERROR_HANDLER_AUTO_ANCHORING) {
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
                const seedPeaks = nonMatchingTemplates.map((template) => {
                    const matchingGate = _.find(currentState.gates, g => g.id === template.exampleGateId)
                    const xGroup = _.find(gatingError.gates, g => g.xGroup === template.xGroup)
                    const xNucleusValue = xGroup.gateData.nucleus[0]
                    const yGroup = _.find(gatingError.gates, g => g.yGroup === template.yGroup)
                    const yNucleusValue = yGroup.gateData.nucleus[1]
                    return { id: uuidv4(), position: [ xNucleusValue, yNucleusValue ] }
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
                    seedPeaks,
                    sampleXChannelZeroPeaks,
                    sampleYChannelZeroPeaks
                }

                result = await api.calculateHomology(sample.id, options)
            }
        } else if (errorHandler.type === constants.GATING_ERROR_HANDLER_MANUAL) {
            const options = {
                selectedXParameterIndex: gateTemplateGroup.selectedXParameterIndex,
                selectedYParameterIndex: gateTemplateGroup.selectedYParameterIndex,
                selectedXScale: constants.SCALE_LOG,
                selectedYScale: constants.SCALE_LOG,
                machineType: FCSFile.machineType,
                seedPeaks: errorHandler.seedPeaks
            }
            result = await api.calculateHomology(sample.id, options)
        } else if (errorHandler.type === constants.GATING_ERROR_HANDLER_IGNORE) {
            for (let gateTemplate of gateTemplates) {
                for (let gate of gatingError.gates) {
                    if (gateTemplate.xGroup === gate.xGroup && gateTemplate.yGroup === gate.yGroup) {
                        gate.gateTemplateId = gateTemplate.id
                    }
                }
            }

            result = {
                status: constants.STATUS_SUCCESS,
                data: {
                    gates: gatingError.gates
                }
            }
        }

        const loadingFinishedAction = setSampleParametersLoading(sample.id, gateTemplateGroup.selectedXParameterIndex + '_' + gateTemplateGroup.selectedYParameterIndex, { loading: false, loadingMessage: null })
        currentState = applicationReducer(currentState, loadingFinishedAction)
        reduxStore.dispatch(loadingFinishedAction)

        if (result.status === constants.STATUS_FAIL) {
            console.log(result)
            const createErrorAction = setGatingModalErrorMessage(result.error)
            reduxStore.dispatch(createErrorAction)
        } else if (result.status === constants.STATUS_SUCCESS) {
            let gates = api.createGatePolygons(result.data.gates)            
            // Create the negative gate if there is one
            const negativeGate = _.find(currentState.gateTemplates, gt => gt.gateTemplateGroupId === gateTemplateGroup.id && gt.type === constants.GATE_TYPE_NEGATIVE)
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

            // Create the double zero gate if there is one
            const doubleZeroGate = _.find(currentState.gateTemplates, gt => gt.gateTemplateGroupId === gateTemplateGroup.id && gt.type === constants.GATE_TYPE_DOUBLE_ZERO)
            if (doubleZeroGate) {
                const newGate = {
                    id: uuidv4(),
                    type: constants.GATE_TYPE_DOUBLE_ZERO,
                    title: FCSFile.FCSParameters[gateTemplateGroup.selectedXParameterIndex].label + ' · ' + FCSFile.FCSParameters[gateTemplateGroup.selectedYParameterIndex].label + ' Double Zero Gate',
                    sampleId: sample.id,
                    FCSFileId: FCSFile.id,
                    gateTemplateId: doubleZeroGate.id,
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

            gates = await api.getGateIncludedEvents(gates)

            // Create combo gates AFTER we know which events are in each smaller gate so that they can be concatted for combo gate contents
            const comboGates = _.filter(currentState.gateTemplates, gt => gt.gateTemplateGroupId === gateTemplateGroup.id && gt.type === constants.GATE_TYPE_COMBO)
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
                const setUnsavedGatesAction = setUnsavedGates(gates)
                reduxStore.dispatch(setUnsavedGatesAction)

                api.updateUnsavedGateDerivedData()
            }

            const loadingFinishedAction = setSampleParametersLoading(sample.id, gateTemplateGroup.selectedXParameterIndex + '_' + gateTemplateGroup.selectedYParameterIndex, { loading: false, loadingMessage: null })
            currentState = applicationReducer(currentState, loadingFinishedAction)
            reduxStore.dispatch(loadingFinishedAction)
        }
    },

    dragImage: (filePath, event) => {
        event.preventDefault()
        event.nativeEvent.effectAllowed = 'copy'
        ipcRenderer.send('ondragstart', filePath)
    }
}