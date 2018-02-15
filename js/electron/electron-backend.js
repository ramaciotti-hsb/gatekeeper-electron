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
import FCS from 'fcs'
import pngjs from 'pngjs'
import mkdirp from 'mkdirp'
import { getPlotImageKey, heatMapRGBForValue, getScalesForSample } from '../lib/utilities'
import constants from '../lib/constants'
import Density from '../lib/2d-density'
import pointInsidePolygon from 'point-in-polygon'
import applicationReducer from '../reducers/application-reducer'
import { updateSample, removeSample, setSamplePlotImage } from '../actions/sample-actions'
import { createWorkspace, selectWorkspace, removeWorkspace,
    createSampleAndAddToWorkspace, createSubSampleAndAddToWorkspace, selectSample } from '../actions/workspace-actions'

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

const mkdirpPromise = (directory) => {
    return new Promise((resolve, reject) => {
        mkdirp(directory, function (error) {
            if (error) { console.error(error) && reject(error) }
            resolve()
        });
    })
}

const packPNGFile = (newFile, fileName) => {
    return new Promise((resolve, reject) => {
        newFile.pack()
        .pipe(fs.createWriteStream(fileName))
        .on('finish', function() {
            resolve(fileName)
        })
        .on('error', function (error) {
            reject(error)
        });
    });
}

// The default empty state of the application on first load
const defaultState = {
    samples: [],
    workspaces: [],
    gates: [],
    selectedWorkspaceId: null
}

const filteredSampleAttributes = ['includeEventIds']

// Cache the state after it's been read from disk, then write it back after every update
let currentState = {}

let reduxStore = {}

const FCSFileCache = {}

const getFCSFileFromPath = async (filePath) => {
    if (FCSFileCache[filePath]) {
        return FCSFileCache[filePath]
    }
    // Read in the data from the FCS file, and emit another action when finished
    const buffer = await readFileBuffer(filePath)
    const FCSFile = new FCS({ dataFormat: 'asNumber', eventsToRead: -1 }, buffer)
    FCSFileCache[filePath] = FCSFile
    return FCSFile
}

const initializeSampleData = async (sample) => {
    if (!sample.id) { return }

    // Find the related sample
    const FCSFile = await getFCSFileFromPath(sample.filePath)

    // Loop through the parameters and get the min and max values of all the data points
    const FCSParameters = _.filter(_.keys(FCSFile.text), param => param.match(/^\$P.+N$/)).map(key => FCSFile.text[key])
    const toReturn = FCSParameters.map((p) => {
        return {
            key: p,
            dataBoundaries: {
                min: Infinity,
                max: -Infinity
            }
        }
    })

    for (let i = 0; i < FCSFile.dataAsNumbers.length; i++) {
        for (let j = 0; j < FCSFile.dataAsNumbers[i].length; j++) {
            if (FCSFile.dataAsNumbers[i][j] < toReturn[j].dataBoundaries.min) {
                toReturn[j].dataBoundaries.min = FCSFile.dataAsNumbers[i][j]
            }

            if (FCSFile.dataAsNumbers[i][j] > toReturn[j].dataBoundaries.max) {
                toReturn[j].dataBoundaries.max = FCSFile.dataAsNumbers[i][j]
            }
        }
    }

    return {
        FCSParameters: toReturn
    }
}

// Generates an image for a 2d scatter plot
const getImageForPlot = async (sample, width = 600, height = 460) => {
    if (sample.plotImages[getPlotImageKey(sample)]) { return sample.plotImages[getPlotImageKey(sample)] }
    const scales = getScalesForSample(sample, width, height)
    const dataBoundariesX = sample.FCSParameters[sample.selectedXParameterIndex].dataBoundaries
    const dataBoundariesY = sample.FCSParameters[sample.selectedYParameterIndex].dataBoundaries

    // Find the related sample
    const fullPopulation = (await getFCSFileFromPath(sample.filePath)).dataAsNumbers
    let subPopulation = []
    if (sample.includeEventIds) {
        for (let i = 0; i < sample.includeEventIds.length; i++) {
            subPopulation.push(fullPopulation[sample.includeEventIds[i]])
        }
    } else {
        subPopulation = fullPopulation
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext("2d")
        
    const densityPoints = subPopulation.map((point) => {
        return [
            scales.xScale(point[sample.selectedXParameterIndex]),
            scales.yScale(point[sample.selectedYParameterIndex])
        ]
    })

    const densityMap = new Density(densityPoints)
    densityMap.calculateDensity()

    const data = []
    var PNGFile = new pngjs.PNG({ width: width, height: height });
    for (let i = 0; i < subPopulation.length; i++) {
        const xValue = Math.floor(scales.xScale(subPopulation[i][sample.selectedXParameterIndex]))
        const yValue = Math.floor(scales.yScale(subPopulation[i][sample.selectedYParameterIndex]))
        const index = (yValue * canvas.width + xValue) * 4
        const color = heatMapRGBForValue(Math.min((densityMap.getDensityMap()[yValue][xValue] / densityMap.getMaxDensity() * 1.5), 1))
        PNGFile.data[index] = color[0]
        PNGFile.data[index + 1] = color[1]
        PNGFile.data[index + 2] = color[2]
        PNGFile.data[index + 3] = 255
    }

    const directory = `/Users/nicbarker/Downloads/sample-images/${sample.id}`
    const sampleKey = getPlotImageKey(sample)
    const fileName = `${directory}/${sampleKey}.png`
    await mkdirpPromise(directory)
    return await packPNGFile(PNGFile, fileName)
}

// -------------------------------------------------------------
// Exported functions below
// -------------------------------------------------------------

// Keep a copy of the redux store and dispatch events
export const setStore = (store) => { reduxStore = store }

// Write the whole session to the disk
export const saveSessionToDisk = async function () {
    // Save the new state to the disk
    const sessionFilePath = path.join(remote.app.getPath('userData'), 'session2.json')
    fs.writeFile(sessionFilePath, JSON.stringify(currentState, null, 4), () => {})
}

// Load the workspaces and samples the user last had open when the app was used
export const api = {
    getSession: async function () {
        const sessionFilePath = path.join(remote.app.getPath('userData'), 'session2.json')
        try {
            currentState = JSON.parse(await readFile(sessionFilePath))
        } catch (error) {
            // If there's no session file, create one
            if (error.code === 'ENOENT') {
                try {
                    writeFile(sessionFilePath, JSON.stringify(defaultState))
                    currentState = defaultState
                } catch (error) {
                    return { error: error }    
                }
            } else {
                return { error: error }
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

        store.dispatch({ type: 'SET_SESSION_STATE', payload: uiState })

        // After reading the session, if there's no workspace, create a default one
        if (currentState.workspaces.length === 0) {
            api.createWorkspace({ title: 'New Workspace', description: 'New Workspace' })            
        }

        saveSessionToDisk()
    },

    createWorkspace: async function (parameters) {
        const workspaceId = uuidv4()

        const newWorkspace = {
            id: workspaceId,
            title: parameters.title,
            description: parameters.description,
            sampleIds: []
        }

        const createAction = createWorkspace(newWorkspace)
        currentState = applicationReducer(currentState, createAction)
        store.dispatch(createAction)

        saveSessionToDisk()
    },

    selectWorkspace: async function (workspaceId) {
        const selectAction = selectWorkspace(workspaceId)
        currentState = applicationReducer(currentState, selectAction)
        store.dispatch(selectWorkspace(workspaceId))

        saveSessionToDisk()
    },

    // TODO: Select the closest workspace after removing it
    removeWorkspace: async function (workspaceId) {
        const removeAction = removeWorkspace(workspaceId)
        currentState = applicationReducer(currentState, removeAction)
        store.dispatch(removeAction)

        saveSessionToDisk()
    },

    createSampleAndAddToWorkspace: async function (workspaceId, sampleParameters) {
        const sampleId = uuidv4()

        let sample = {
            id: sampleId,
            type: sampleParameters.type,
            filePath: sampleParameters.filePath,
            title: sampleParameters.title,
            description: sampleParameters.description,
            // Below are defaults
            selectedXParameterIndex: 0,
            selectedYParameterIndex: 1,
            selectedXScale: constants.SCALE_LINEAR,
            selectedYScale: constants.SCALE_LINEAR,
            subSampleIds: [],
            plotImages: {}
        }

        // Read the FCS File for this sample and save useful data
        sample = _.merge(sample, await initializeSampleData(sample))

        const createAction = createSampleAndAddToWorkspace(workspaceId, sample)

        currentState = applicationReducer(currentState, createAction)
        store.dispatch(createAction)

        // Generate the cached images
        const imageForPlot = await getImageForPlot(sample)
        const imageAction = await setSamplePlotImage(sample.id, getPlotImageKey(sample), imageForPlot)
        currentState = applicationReducer(currentState, imageAction)
        store.dispatch(imageAction)

        saveSessionToDisk()
    },

    createSubSampleAndAddToWorkspace: async function (workspaceId, parentSampleId, sampleParameters, gateParameters) {
        const sampleId = uuidv4()
        const gateId = uuidv4()

        const parentSample = _.find(currentState.samples, s => s.id === parentSampleId)

        let sample = {
            id: sampleId,
            type: sampleParameters.type,
            title: sampleParameters.title,
            description: sampleParameters.description,
            filePath: parentSample.filePath,
            selectedXParameterIndex: parentSample.selectedXParameterIndex,
            selectedYParameterIndex: parentSample.selectedYParameterIndex,
            selectedXScale: parentSample.selectedXScale,
            selectedYScale: parentSample.selectedYScale,
            FCSParameters: _.clone(parentSample.FCSParameters),
            dataBoundaries: _.clone(parentSample.dataBoundaries),
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
            selectedYScale: gateParameters.selectedYScale
        }

        currentState = applicationReducer(currentState, createSubSampleAndAddToWorkspace(workspaceId, parentSampleId, sample, gate))
        store.dispatch(createSubSampleAndAddToWorkspace(workspaceId, parentSampleId, sample, gate))

        // Store the events that were captured within the subsample but don't add them to the redux state
        const FCSFile = await getFCSFileFromPath(sample.filePath)

        const includeEventIds = []
        if (gate.type === constants.GATE_POLYGON) {
            for (let i = 0; i < FCSFile.dataAsNumbers.length; i++) {
                if (pointInsidePolygon([FCSFile.dataAsNumbers[i][sample.selectedXParameterIndex], FCSFile.dataAsNumbers[i][sample.selectedYParameterIndex]], gate.gateData)) {
                    includeEventIds.push(i)
                }
            }
        }

        const newSample = _.find(currentState.samples, s => s.id === sampleId)
        newSample.includeEventIds = includeEventIds

        // Generate the cached images
        const imageForPlot = await getImageForPlot(newSample)
        const imageAction = await setSamplePlotImage(newSample.id, getPlotImageKey(newSample), imageForPlot)
        currentState = applicationReducer(currentState, imageAction)
        store.dispatch(imageAction)

        saveSessionToDisk()
    },

    removeSample: async function (sampleId) {
        const removeAction = removeSample(sampleId)

        currentState = applicationReducer(currentState, removeAction)
        store.dispatch(removeAction)

        saveSessionToDisk()
    },

    selectSample: async function (sampleId, workspaceId) {
        const selectAction = selectSample(sampleId, workspaceId)

        currentState = applicationReducer(currentState, selectAction)
        store.dispatch(selectAction)

        saveSessionToDisk()
    },

    // Update a sample with arbitrary parameters
    updateSample: async function (sampleId, parameters) {
        const updateAction = updateSample(sampleId, parameters)

        currentState = applicationReducer(currentState, updateAction)
        store.dispatch(updateAction)

        // Generate the cached images
        const sample = _.find(currentState.samples, s => s.id === sampleId)
        const imageForPlot = await getImageForPlot(sample)
        const imageAction = await setSamplePlotImage(sample.id, getPlotImageKey(sample), imageForPlot)
        currentState = applicationReducer(currentState, imageAction)
        store.dispatch(imageAction)


        saveSessionToDisk()
    }
}