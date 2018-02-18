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
import persistentHomology from '../lib/persistent-homology.js'
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
    console.log(FCS)
    // Read in the data from the FCS file, and emit another action when finished
    const buffer = await readFileBuffer(filePath)
    const FCSFile = new FCS({ dataFormat: 'asNumber', eventsToRead: -1 }, buffer)
    console.log(FCSFile)
    FCSFileCache[filePath] = FCSFile
    return FCSFile
}

const initializeSampleData = async (sample) => {
    if (!sample.id) { return }

    // Find the related sample
    const FCSFile = await getFCSFileFromPath(sample.filePath)

    // Loop through the parameters and get the min and max values of all the data points
    const FCSParameters = []

    for (let key of _.keys(FCSFile.text)) {
        if ((key.match(/^\$P.+N$/) || key.match(/^\$P.+S$/)) &&
            !FCSParameters[parseInt(key.match(/\d+/)[0]) - 1]) {
            FCSParameters[parseInt(key.match(/\d+/)[0]) - 1] = {
                key: FCSFile.text[key],
                label: FCSFile.text[key],
                statistics: {
                    min: Infinity,
                    max: -Infinity,
                    mean: 0
                }
            }
        }

        if (key.match(/^\$P.+N$/)) {
            FCSParameters[parseInt(key.match(/\d+/)[0]) - 1].key = FCSFile.text[key]
        } else if (key.match(/^\$P.+S$/)) {
            FCSParameters[parseInt(key.match(/\d+/)[0]) - 1].label = FCSFile.text[key]
        }
    }

    for (let i = 0; i < FCSFile.dataAsNumbers.length; i++) {
        for (let j = 0; j < FCSFile.dataAsNumbers[i].length; j++) {
            if (FCSFile.dataAsNumbers[i][j] < FCSParameters[j].statistics.min) {
                FCSParameters[j].statistics.min = FCSFile.dataAsNumbers[i][j]
            }

            if (FCSFile.dataAsNumbers[i][j] > FCSParameters[j].statistics.max) {
                FCSParameters[j].statistics.max = FCSFile.dataAsNumbers[i][j]
            }

            FCSParameters[j].statistics.mean += FCSFile.dataAsNumbers[i][j] / FCSFile.dataAsNumbers.length
        }
    }

    return {
        FCSParameters
    }
}

// Generates an image for a 2d scatter plot
const getImageForPlot = async (sample, width = 600, height = 460) => {
    if (sample.plotImages[getPlotImageKey(sample)]) { return sample.plotImages[getPlotImageKey(sample)] }
    const scales = getScalesForSample(sample, width, height)

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

    window.scales = scales

    const densityMap = new Density(densityPoints, {
        shape: [scales.xScale(sample.FCSParameters[sample.selectedXParameterIndex].statistics.max), height - scales.yScale(sample.FCSParameters[sample.selectedYParameterIndex].statistics.max)]
    })
    densityMap.calculateDensity()

    const data = []
    var PNGFile = new pngjs.PNG({ width: width, height: height });
    // for (let y = 0; y < densityMap.getDensityMap().length; y++) {
    //     const column = densityMap.getDensityMap()[y]
    //     if (!column || column.length === 0) { continue }

    //     for (let x = 0; x < column.length; x++) {
    //         const density = column[x]
    //         const index = (y * canvas.width + x) * 4
    //         const color = heatMapRGBForValue(Math.min((densityMap.getDensityMap()[y][x] / densityMap.getMaxDensity() * 1.5), 1))
    //         PNGFile.data[index] = color[0]
    //         PNGFile.data[index + 1] = color[1]
    //         PNGFile.data[index + 2] = color[2]
    //         PNGFile.data[index + 3] = 255
    //     }
    // }

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
            description: sampleParameters.description,
            filePath: parentSample.filePath,
            selectedXParameterIndex: parentSample.selectedXParameterIndex,
            selectedYParameterIndex: parentSample.selectedYParameterIndex,
            selectedXScale: parentSample.selectedXScale,
            selectedYScale: parentSample.selectedYScale,
            FCSParameters: _.clone(parentSample.FCSParameters),
            statistics: _.clone(parentSample.statistics),
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

        // Store the events that were captured within the subsample but don't add them to the redux state
        const FCSFile = await getFCSFileFromPath(sample.filePath)

        const includeEventIds = []

        // TODO: Using mean to do naming is primitive, as it doesn't account for dense blobs lower down
        let includedMeanX = 0
        let includedMeanY = 0
        if (gate.type === constants.GATE_POLYGON) {
            for (let i = 0; i < FCSFile.dataAsNumbers.length; i++) {
                if (pointInsidePolygon([FCSFile.dataAsNumbers[i][sample.selectedXParameterIndex], FCSFile.dataAsNumbers[i][sample.selectedYParameterIndex]], gate.gateData)) {
                    includeEventIds.push(i)
                }
            }

            for (let i = 0; i < includeEventIds.length; i++) {
                const eventId = includeEventIds[i]
                if (pointInsidePolygon([FCSFile.dataAsNumbers[eventId][sample.selectedXParameterIndex], FCSFile.dataAsNumbers[eventId][sample.selectedYParameterIndex]], gate.gateData)) {
                    includedMeanX += FCSFile.dataAsNumbers[eventId][sample.selectedXParameterIndex] / includeEventIds.length
                    includedMeanY += FCSFile.dataAsNumbers[eventId][sample.selectedYParameterIndex] / includeEventIds.length
                }
            }
        }

        // If there was no title specified, auto generate one
        let title = 'Subsample'
        if (!sampleParameters.title) {
            console.log(sample.FCSParameters[sample.selectedXParameterIndex].statistics.mean, sample.FCSParameters[sample.selectedYParameterIndex].statistics.mean)
            console.log(includedMeanX, includedMeanY)
            const xHigh = includedMeanX > sample.FCSParameters[sample.selectedXParameterIndex].statistics.mean
            const yHigh = includedMeanY > sample.FCSParameters[sample.selectedYParameterIndex].statistics.mean

            title = sample.FCSParameters[sample.selectedXParameterIndex].key + (xHigh ? ' (HIGH) - ' : ' (LOW) - ')
            title += sample.FCSParameters[sample.selectedYParameterIndex].key + (yHigh ? ' (HIGH) ' : ' (LOW) ')
        }

        sample.title = title

        const backendSample = _.cloneDeep(sample)
        backendSample.includeEventIds = includeEventIds

        currentState = applicationReducer(currentState, createSubSampleAndAddToWorkspace(workspaceId, parentSampleId, backendSample, gate))
        store.dispatch(createSubSampleAndAddToWorkspace(workspaceId, parentSampleId, sample, gate))

        // Generate the cached images
        const imageForPlot = await getImageForPlot(backendSample)
        const imageAction = await setSamplePlotImage(backendSample.id, getPlotImageKey(backendSample), imageForPlot)
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
    },

    // Performs persistent homology calculation to automatically create gates on a sample
    calculateHomology: async function (sampleId, workspaceId) {
        const width = 600
        const height = 480

        const sample = _.find(currentState.samples, s => s.id === sampleId)

        if (!sample) { console.log('Error in calculateHomology(): no sample with id ', sampleId, 'was found'); return }
        // Dispatch a redux action to mark the sample as loading
        const loadingStartedAction = updateSample(sampleId, { loading: true, loadingMessage: 'Creating gates using Persistent Homology...' })
        store.dispatch(loadingStartedAction)

        const scales = getScalesForSample(sample, width, height)

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
            
        const densityPoints = subPopulation.map((point) => {
            return [
                scales.xScale(point[sample.selectedXParameterIndex]),
                scales.yScale(point[sample.selectedYParameterIndex])
            ]
        })

        const densityMap = new Density(densityPoints, {
            shape: [scales.xScale(sample.FCSParameters[sample.selectedXParameterIndex].statistics.max), height - scales.yScale(sample.FCSParameters[sample.selectedYParameterIndex].statistics.max)]
        })
        densityMap.calculateDensity(3)

        const truePeaks = await persistentHomology(densityMap)

        for (let peak of truePeaks) {
            // Convert the gate polygon back into real space
            for (let i = 0; i < peak.polygon.length; i++) {
                peak.polygon[i][0] = scales.xScale.invert(peak.polygon[i][0])
                peak.polygon[i][1] = scales.yScale.invert(peak.polygon[i][1])
            }

            const gate = {
                type: constants.GATE_POLYGON,
                gateData: peak.polygon,
                selectedXParameterIndex: sample.selectedXParameterIndex,
                selectedYParameterIndex: sample.selectedYParameterIndex,
                selectedXScale: sample.selectedXScale,
                selectedYScale: sample.selectedYScale
            }

            api.createSubSampleAndAddToWorkspace(
                workspaceId,
                sampleId,
                {
                    filePath: sample.filePath,
                    FCSParameters: sample.FCSParameters,
                    plotImages: {},
                    subSampleIds: [],
                    selectedXParameterIndex: sample.selectedXParameterIndex,
                    selectedYParameterIndex: sample.selectedYParameterIndex,
                    selectedXScale: sample.selectedXScale,
                    selectedYScale: sample.selectedYScale,
                },
                gate,
            )
        }

        // Dispatch a redux action to mark the sample as loading
        const loadingFinishedAction = updateSample(sampleId, { loading: false, loadingMessage: null })
        store.dispatch(loadingFinishedAction)
    }
}