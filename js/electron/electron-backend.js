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
import * as d3 from "d3"
import pngjs from 'pngjs'
import mkdirp from 'mkdirp'
import { getPlotImageKey, heatMapRGBForValue, getScalesForSample, getPolygonCenter } from '../lib/utilities'
import constants from '../lib/constants'
import Density from '../lib/2d-density'
import PersistentHomology from '../lib/persistent-homology.js'
import GrahamScan from '../lib/graham-scan.js'
import pointInsidePolygon from 'point-in-polygon'
import { distanceToPolygon, distanceBetweenPoints } from 'distance-to-polygon'
import applicationReducer from '../reducers/application-reducer'
import { updateSample, removeSample, setSamplePlotImage } from '../actions/sample-actions'
import { createWorkspace, selectWorkspace, removeWorkspace,
    createSampleAndAddToWorkspace, createSubSampleAndAddToWorkspace, selectSample,
    createGateTemplateAndAddToWorkspace, selectGateTemplate } from '../actions/workspace-actions'

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
    const FCSParameters = []

    for (let key of _.keys(FCSFile.text)) {
        if ((key.match(/^\$P.+N$/) || key.match(/^\$P.+S$/)) &&
            !FCSParameters[parseInt(key.match(/\d+/)[0]) - 1]) {
            FCSParameters[parseInt(key.match(/\d+/)[0]) - 1] = {
                key: FCSFile.text[key],
                label: FCSFile.text[key],
                statistics: {
                    min: Infinity,
                    positiveMin: Infinity,
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

            if (FCSFile.dataAsNumbers[i][j] < FCSParameters[j].statistics.positiveMin && FCSFile.dataAsNumbers[i][j] > 0) {
                FCSParameters[j].statistics.positiveMin = FCSFile.dataAsNumbers[i][j]
            }

            if (FCSFile.dataAsNumbers[i][j] > FCSParameters[j].statistics.max) {
                FCSParameters[j].statistics.max = FCSFile.dataAsNumbers[i][j]
            }

            // If we're looking at Cytof data, exclude zero values from mean calculation (they aren't useful)
            if (FCSFile.dataAsNumbers[i][j] > 0) {
                FCSParameters[j].statistics.mean += FCSFile.dataAsNumbers[i][j] / FCSFile.dataAsNumbers.length                
            }
        }
    }

    return {
        FCSParameters,
        populationCount: FCSFile.dataAsNumbers.length
    }
}

// Generates an image for a 2d scatter plot
const getImageForPlot = async (sample, width = 600, height = 460) => {
    if (sample.plotImages[getPlotImageKey(sample)]) { return sample.plotImages[getPlotImageKey(sample)] }

    // Offset the entire graph and add histograms if we're looking at cytof data
    let xOffset = sample.selectedMachineType === constants.MACHINE_CYTOF ? constants.CYTOF_HISTOGRAM_WIDTH : 0
    let yOffset = sample.selectedMachineType === constants.MACHINE_CYTOF ? constants.CYTOF_HISTOGRAM_HEIGHT : 0
    const scales = getScalesForSample(sample, width - xOffset, height - yOffset)

    // Find the related sample
    let subPopulation = await api.getPopulationForSample(sample.id)
    let xChannelZeroes = []
    let yChannelZeroes = []

    if (sample.selectedMachineType === constants.MACHINE_CYTOF) {
        let newSubPopulation = []
        for (let i = 0; i < subPopulation.length; i++) {
            // Every point that has a zero in the selected X channel
            if (subPopulation[i][sample.selectedXParameterIndex] === 0) {
                xChannelZeroes.push(subPopulation[i])
            // Every point that has a zero in the selected Y channel
            } else if (subPopulation[i][sample.selectedYParameterIndex] === 0) {
                yChannelZeroes.push(subPopulation[i])
            } else {
                newSubPopulation.push(subPopulation[i])
            }
        }
        subPopulation = newSubPopulation
    }
        
    const densityPoints = subPopulation.map((point) => {
        return [
            scales.xScale(point[sample.selectedXParameterIndex]),
            scales.yScale(point[sample.selectedYParameterIndex])
        ]
    })

    window.scales = scales

    const densityMap = new Density(densityPoints, {
        shape: [width - xOffset, height - yOffset]
    })
    densityMap.calculateDensity()


    const data = []
    let PNGFile
    let tempPNGFile = new pngjs.PNG({ width: width - xOffset, height: height - yOffset });
    // for (let y = 0; y < densityMap.getDensityMap().length; y++) {
    //     const column = densityMap.getDensityMap()[y]
    //     if (!column || column.length === 0) { continue }

    //     for (let x = 0; x < column.length; x++) {
    //         const density = column[x]
    //         const index = (y * width + x) * 4
    //         const color = heatMapRGBForValue(densityMap.getDensityMap()[y][x])
    //         tempPNGFile.data[index] = color[0]
    //         tempPNGFile.data[index + 1] = color[1]
    //         tempPNGFile.data[index + 2] = color[2]
    //         tempPNGFile.data[index + 3] = 255
    //     }
    // }

    for (let i = 0; i < subPopulation.length; i++) {
        const xValue = Math.floor(scales.xScale(subPopulation[i][sample.selectedXParameterIndex]))
        const yValue = Math.floor(scales.yScale(subPopulation[i][sample.selectedYParameterIndex]))
        const index = (yValue * (width - xOffset) + xValue) * 4
        if (densityMap.getDensityMap()[yValue] && densityMap.getDensityMap()[yValue][xValue]) {
            const color = heatMapRGBForValue(densityMap.getDensityMap()[yValue][xValue])
            tempPNGFile.data[index] = color[0]
            tempPNGFile.data[index + 1] = color[1]
            tempPNGFile.data[index + 2] = color[2]
            tempPNGFile.data[index + 3] = 255 // Alpha channel
        }
    }

    // If we're looking at cytof data, render histograms at the left and bottom of the graph
    if (sample.selectedMachineType === constants.MACHINE_CYTOF) {
        PNGFile = new pngjs.PNG({ width: width, height: height })
        // Perform kernel density estimation to generate histograms for zero points
        const densityY = kernelDensityEstimator(kernelEpanechnikov(7), _.range(0, width - xOffset))(yChannelZeroes.map(p => scales.xScale(p[sample.selectedXParameterIndex])))
        const densityX = kernelDensityEstimator(kernelEpanechnikov(7), _.range(0, height - yOffset))(xChannelZeroes.map(p => scales.yScale(p[sample.selectedYParameterIndex])))

        const maxDensityY = densityY.reduce((accumulator, currentValue) => { return Math.max(currentValue[1], accumulator) }, densityY[0][1])
        const maxDensityX = densityX.reduce((accumulator, currentValue) => { return Math.max(currentValue[1], accumulator) }, densityX[0][1])

        // Build a new image with the graph and histograms
        for (let i = 0; i < width * height * 4; i += 4) {
            // If we're in the bottom left xOffset * yOffset corner, render nothing
            if (i % (width * 4) <= xOffset * 4 && Math.floor((i) / (width * 4)) >= height - yOffset) {
                PNGFile.data[i] = 255
                PNGFile.data[i + 1] = 255
                PNGFile.data[i + 2] = 255
                PNGFile.data[i + 3] = 255 // Alpha channel
            }
            // If we're in the first `xOffset` pixels of a row, render the histogram for the X == 0 points
            else if (i % (width * 4) < xOffset * 4) {
                const xColour = heatMapRGBForValue(densityX[Math.floor(i / (width * 4))][1] / maxDensityY * 0.5)
                PNGFile.data[i] = xColour[0]
                PNGFile.data[i + 1] = xColour[1]
                PNGFile.data[i + 2] = xColour[2]
                PNGFile.data[i + 3] = 255 // Alpha channel
            // If we're in the last `yOffset` rows, render the histogram
            } else if (Math.floor(i / (width * 4)) > height - yOffset) {
                const xColour = heatMapRGBForValue(densityY[(i % (width * 4) / 4) - xOffset][1] / maxDensityX * 0.5)
                PNGFile.data[i] = xColour[0]
                PNGFile.data[i + 1] = xColour[1]
                PNGFile.data[i + 2] = xColour[2]
                PNGFile.data[i + 3] = 255 // Alpha channel
            // Otherwise just render the previously generated graph pixel
            } else {
                const extraIndices = (Math.floor(i / (width * 4)) + 1) * (xOffset * 4)
                PNGFile.data[i] = tempPNGFile.data[i - extraIndices]
                PNGFile.data[i + 1] = tempPNGFile.data[i - extraIndices + 1]
                PNGFile.data[i + 2] = tempPNGFile.data[i - extraIndices + 2]
                PNGFile.data[i + 3] = tempPNGFile.data[i - extraIndices + 3]
            }
        }
    } else {
        PNGFile = tempPNGFile
    }

    const directory = `/Users/nicbarker/Downloads/sample-images/${sample.id}`
    const sampleKey = getPlotImageKey(sample)
    const fileName = `${directory}/${sampleKey}.png`
    await mkdirpPromise(directory)
    return await packPNGFile(PNGFile, fileName)
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
            const workspaceId = await api.createWorkspace({ title: 'New Workspace', description: 'New Workspace' })
            // Add an empty Gate Template
            api.createGateTemplateAndAddToWorkspace(workspaceId, { title: 'New Gating Strategy' })
        }
    },

    createWorkspace: async function (parameters) {
        const workspaceId = uuidv4()

        const newWorkspace = {
            id: workspaceId,
            title: parameters.title,
            description: parameters.description,
            sampleIds: [],
            gateTemplateIds: []
        }

        const createAction = createWorkspace(newWorkspace)
        currentState = applicationReducer(currentState, createAction)
        store.dispatch(createAction)

        saveSessionToDisk()

        return newWorkspace.id
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

    createGateTemplateAndAddToWorkspace: async function (workspaceId, gateTemplateParameters) {
        const gateTemplateId = uuidv4()

        // Create a Gate Template for this parameter combination
        const gateTemplate = {
            id: gateTemplateId,
            type: gateTemplateParameters.type,
            title: gateTemplateParameters.title,
            parentTemplateId: gateTemplateParameters.parentTemplateId,
            childGateTemplateIds: [],
            selectedXParameterIndex: gateTemplateParameters.selectedXParameterIndex,
            selectedYParameterIndex: gateTemplateParameters.selectedYParameterIndex,
            selectedXScale: gateTemplateParameters.selectedXScale,
            selectedYScale: gateTemplateParameters.selectedYScale,
            expectedGates: gateTemplateParameters.expectedGates,
            typeSpecificData: gateTemplateParameters.typeSpecificData,
        }

        const createGateTemplateAction = createGateTemplateAndAddToWorkspace(workspaceId, gateTemplate)
        currentState = applicationReducer(currentState, createGateTemplateAction)
        store.dispatch(createGateTemplateAction)

        saveSessionToDisk()
    },

    selectGateTemplate: async function (gateTemplateId, workspaceId) {
        const selectAction = selectGateTemplate(gateTemplateId, workspaceId)

        currentState = applicationReducer(currentState, selectAction)
        store.dispatch(selectAction)

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
            selectedMachineType: constants.MACHINE_FLORESCENT,
            selectedXScale: constants.SCALE_LINEAR,
            selectedYScale: constants.SCALE_LINEAR,
            plotImages: {}
        }

        // Create a root Gate Template
        const gateTemplate = {
            id: uuidv4(),
            title: sample.filePath,
            sampleId: sample.id
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
        const sampleId = sampleParameters.id || uuidv4()
        const gateId = gateParameters.id || uuidv4()

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
            selectedMachineType: parentSample.selectedMachineType,
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
            gateCreator: gateParameters.gateCreator,
            gateCreatorData: gateParameters.gateCreatorData,
            xCutoffs: gateParameters.xCutoffs,
            yCutoffs: gateParameters.yCutoffs
        }

        // Store the events that were captured within the subsample but don't add them to the redux state
        const FCSFile = await getFCSFileFromPath(sample.filePath)

        const includeEventIds = []

        // TODO: Using mean to do naming is primitive, as it doesn't account for dense blobs lower down
        let includedMeanX = 0
        let includedMeanY = 0
        if (gate.type === constants.GATE_TYPE_POLYGON) {
            for (let i = 0; i < FCSFile.dataAsNumbers.length; i++) {
                if (pointInsidePolygon([FCSFile.dataAsNumbers[i][sample.selectedXParameterIndex], FCSFile.dataAsNumbers[i][sample.selectedYParameterIndex]], gate.gateData)) {
                    includeEventIds.push(i)
                } else {
                    if (gate.xCutoffs && FCSFile.dataAsNumbers[i][sample.selectedXParameterIndex] === 0 && FCSFile.dataAsNumbers[i][sample.selectedYParameterIndex] >= gate.xCutoffs[0] && FCSFile.dataAsNumbers[i][sample.selectedYParameterIndex] <= gate.xCutoffs[1]) {
                        includeEventIds.push(i)
                    }
                    if (gate.yCutoffs && FCSFile.dataAsNumbers[i][sample.selectedYParameterIndex] === 0 && FCSFile.dataAsNumbers[i][sample.selectedXParameterIndex] >= gate.yCutoffs[0] && FCSFile.dataAsNumbers[i][sample.selectedXParameterIndex] <= gate.yCutoffs[1]) {
                        includeEventIds.push(i)
                    }
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
            const xHigh = includedMeanX > sample.FCSParameters[sample.selectedXParameterIndex].statistics.mean
            const yHigh = includedMeanY > sample.FCSParameters[sample.selectedYParameterIndex].statistics.mean

            title = sample.FCSParameters[sample.selectedXParameterIndex].label + (xHigh ? ' (HIGH) - ' : ' (LOW) - ')
            title += sample.FCSParameters[sample.selectedYParameterIndex].label + (yHigh ? ' (HIGH) ' : ' (LOW) ')
        }

        sample.title = title
        sample.populationCount = includeEventIds.length

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
        const sample = _.find(currentState.samples, s => s.id === sampleId)

        // Offset the entire graph and add histograms if we're looking at cytof data
        let xOffset = sample.selectedMachineType === constants.MACHINE_CYTOF ? constants.CYTOF_HISTOGRAM_WIDTH : 0
        let yOffset = sample.selectedMachineType === constants.MACHINE_CYTOF ? constants.CYTOF_HISTOGRAM_HEIGHT : 0
        
        const width = 600 - xOffset
        const height = 480 - yOffset

        if (!sample) { console.log('Error in calculateHomology(): no sample with id ', sampleId, 'was found'); return }
        // Dispatch a redux action to mark the sample as loading
        const loadingStartedAction = updateSample(sampleId, { loading: true, loadingMessage: 'Creating gates using Persistent Homology...' })
        store.dispatch(loadingStartedAction)

        const scales = getScalesForSample(sample, width, height)

        let subPopulation = await api.getPopulationForSample(sampleId)

        const xChannelZeroes = []
        const yChannelZeroes = []
        if (sample.selectedMachineType === constants.MACHINE_CYTOF) {
            let newSubPopulation = []
            for (let i = 0; i < subPopulation.length; i++) {
                // Every point that has a zero in the selected X channel
                if (subPopulation[i][sample.selectedXParameterIndex] === 0) {
                    xChannelZeroes.push(subPopulation[i])
                // Every point that has a zero in the selected Y channel
                } else if (subPopulation[i][sample.selectedYParameterIndex] === 0) {
                    yChannelZeroes.push(subPopulation[i])
                } else {
                    newSubPopulation.push(subPopulation[i])
                }
            }
            subPopulation = newSubPopulation
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
        densityMap.calculateDensity(5)

        const homology = new PersistentHomology({
            densityMap
        })

        let percentageComplete = 0
        const intervalToken = setInterval(() => {
            const loadingPercentageAction = updateSample(sampleId, { loading: true, loadingMessage: 'Gating using Persistent Homology: ' + Math.floor(percentageComplete) + '% complete.' })
            store.dispatch(loadingPercentageAction)
        }, 500)
        const truePeaks = await homology.findPeaks(densityMap, (height) => {
            // Called every time another iteration happens in findpeaks
            percentageComplete = (1 - height) * 100
        })

        clearInterval(intervalToken)

        // If we're looking at cytof data, extend lower gates out towards zero if there is a peak there
        if (sample.selectedMachineType === constants.MACHINE_CYTOF) {
            const densityY = kernelDensityEstimator(kernelEpanechnikov(12), _.range(0, width))(yChannelZeroes.map(p => scales.xScale(p[sample.selectedXParameterIndex])))
            const densityX = kernelDensityEstimator(kernelEpanechnikov(12), _.range(0, height))(xChannelZeroes.map(p => scales.yScale(p[sample.selectedYParameterIndex])))
            
            let yPeaks = []
            const minPeakWidth = 20
            const inflectionWidth = 10
            // Find peaks in the 1d data where one of the channels is zero
            for (let i = 0; i < densityY.length; i++) {
                let isPeak = true
                for (let j = Math.max(i - minPeakWidth, 0); j < Math.min(i + minPeakWidth, densityY.length); j++) {
                    if (i === j) { continue }

                    if (densityY[j][1] >= densityY[i][1]) {
                        isPeak = false
                    }
                }
                if (isPeak) {
                    yPeaks.push(i)
                }
            }
            
            const yCutoffs = []
            // Capture the peaks by iterating outwards until an inflection point or minimum value is found
            for (let i = 0; i < yPeaks.length; i++) {
                yCutoffs[i] = []
                const peak = yPeaks[i]
                let lowerCutoffFound = false
                let upperCutoffFound = false
                let index = peak - 1
                while (!lowerCutoffFound) {
                    if (index === -1) {
                        lowerCutoffFound = true
                        yCutoffs[i][0] = 0
                    // If the mean of the next inflectionWidth points is greater than the current point, the slope is increasing again (approaching another peak)
                    } else if (densityY[index][1] < densityY.slice(index - inflectionWidth - 1, index - 1).reduce((acc, curr) => { return acc + curr[1] }, 0) / inflectionWidth || densityY[index][1] < 0.001) {
                        lowerCutoffFound = true
                        yCutoffs[i][0] = index
                    }

                    index--
                }

                index = peak + 1
                while (!upperCutoffFound) {
                    if (index === densityY.length) {
                        upperCutoffFound = true
                        yCutoffs[i][1] = index - 1
                    // If the mean of the next inflectionWidth points is greater than the current point, the slope is increasing again (approaching another peak)
                    } else if (densityY[index][1] < densityY.slice(index + 1, index + inflectionWidth + 1).reduce((acc, curr) => { return acc + curr[1] }, 0) / inflectionWidth || densityY[index][1] < 0.001) {
                        upperCutoffFound = true
                        yCutoffs[i][1] = index
                    }

                    index++
                }
            }

            let xPeaks = []
            // Find peaks in the 1d data where one of the channels is zero
            for (let i = 0; i < densityX.length; i++) {
                let isPeak = true
                for (let j = Math.max(i - minPeakWidth, 0); j < Math.min(i + minPeakWidth, densityX.length); j++) {
                    if (i === j) { continue }

                    if (densityX[j][1] >= densityX[i][1]) {
                        isPeak = false
                    }
                }
                if (isPeak) {
                    xPeaks.push(i)
                }
            }

            const xCutoffs = []
            // Capture the peaks by iterating outwards until an inflection point or minimum value is found
            for (let i = 0; i < xPeaks.length; i++) {
                xCutoffs[i] = []
                const peak = xPeaks[i]
                let lowerCutoffFound = false
                let upperCutoffFound = false
                let index = peak - 1
                while (!lowerCutoffFound) {
                    if (index === -1) {
                        lowerCutoffFound = true
                        xCutoffs[i][0] = 0
                    // If the mean of the next inflectionWidth points is greater than the current point, the slope is increasing again (approaching another peak)
                    } else if (densityX[index][1] < densityX.slice(index - inflectionWidth - 1, index - 1).reduce((acc, curr) => { return acc + curr[1] }, 0) / inflectionWidth || densityX[index][1] < 0.001) {
                        lowerCutoffFound = true
                        xCutoffs[i][0] = index
                    }

                    index--
                }

                index = peak + 1
                while (!upperCutoffFound) {
                    if (index === densityX.length) {
                        upperCutoffFound = true
                        xCutoffs[i][1] = index - 1
                    // If the mean of the next inflectionWidth points is greater than the current point, the slope is increasing again (approaching another peak)
                    } else if (densityX[index][1] < densityX.slice(index + 1, index + inflectionWidth + 1).reduce((acc, curr) => { return acc + curr[1] }, 0) / inflectionWidth || densityX[index][1] < 0.001) {
                        upperCutoffFound = true
                        xCutoffs[i][1] = index
                    }

                    index++
                }
            }

            for (let p = 0; p < yPeaks.length; p++) {
                const peak = yPeaks[p]
                // Find the closest gate
                let closestGate = {}
                let closestDistance = Infinity
                for (let gate of truePeaks) {
                    const centerPoint = getPolygonCenter(gate.polygon)
                    const distance = distanceBetweenPoints(centerPoint, [peak, height])
                    if (distance < closestDistance && pointInsidePolygon([peak, centerPoint[1]], gate.polygon)) {
                        closestDistance = distance
                        closestGate = gate
                    }
                }

                // Insert the new 0 edge points
                const newGatePolygon = closestGate.polygon.slice(0).concat([
                    [yCutoffs[p][0], height - yOffset],
                    [yCutoffs[p][0], height],
                    [yCutoffs[p][1], height],
                    [yCutoffs[p][1], height - yOffset]
                ])
                // Recalculate the polygon boundary
                const grahamScan = new GrahamScan();
                newGatePolygon.map(p => grahamScan.addPoint(p[0], p[1]))
                closestGate.polygon = grahamScan.getHull().map(p => [p.x, p.y])
                closestGate.yCutoffs = yCutoffs[p]
                closestGate.zeroY = true
            }

            for (let p = 0; p < xPeaks.length; p++) {
                const peak = xPeaks[p]
                // Find the closest gate
                let closestGate = {}
                let closestDistance = Infinity
                for (let gate of truePeaks) {
                    const centerPoint = getPolygonCenter(gate.polygon)
                    const distance = distanceBetweenPoints(centerPoint, [xOffset, peak])
                    if (distance < closestDistance && pointInsidePolygon([centerPoint[0], peak], gate.polygon)) {
                        closestDistance = distance
                        closestGate = gate
                    }
                }

                // Insert the two new 0 edge points
                const newGatePolygon = closestGate.polygon.slice(0).concat([
                    [xOffset, xCutoffs[p][0]],
                    [0, xCutoffs[p][0]],
                    [0, xCutoffs[p][1]],
                    [xOffset, xCutoffs[p][1]]
                ])
                // Recalculate the polygon boundary
                const grahamScan = new GrahamScan();
                newGatePolygon.map(p => grahamScan.addPoint(p[0], p[1]))
                closestGate.polygon = grahamScan.getHull().map(p => [p.x, p.y])
                closestGate.xCutoffs = xCutoffs[p]
                closestGate.zeroX = true
            }

            // If a gate includes zeroes on both the x and y axis, add a special (0,0) point to the gate
            for (let gate of truePeaks) {
                if (gate.zeroX && gate.zeroY) {
                    // Insert the two new 0 edge points
                    const newGatePolygon = gate.polygon.concat([[0, height]])
                    // Recalculate the polygon boundary
                    const grahamScan = new GrahamScan();
                    newGatePolygon.map(p => grahamScan.addPoint(p[0], p[1]))
                    gate.xCutoffs[1] = height
                    gate.yCutoffs[0] = 0
                    gate.polygon = grahamScan.getHull().map(p => [p.x, p.y])
                }
            }
        }

        const gates = truePeaks.map((peak) => {
            // Convert the gate polygon back into real space
            for (let i = 0; i < peak.polygon.length; i++) {
                peak.polygon[i][0] = scales.xScale.invert(peak.polygon[i][0])
                peak.polygon[i][1] = scales.yScale.invert(peak.polygon[i][1])
            }

            const gate = {
                type: constants.GATE_TYPE_POLYGON,
                gateData: peak.polygon,
                selectedXParameterIndex: sample.selectedXParameterIndex,
                selectedYParameterIndex: sample.selectedYParameterIndex,
                selectedXScale: sample.selectedXScale,
                selectedYScale: sample.selectedYScale,
                gateCreator: constants.GATE_CREATOR_PERSISTENT_HOMOLOGY,
                gateCreatorData: peak.homologyParameters
            }

            if (sample.selectedMachineType === constants.MACHINE_CYTOF) {
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

        // Create a Gate Template for this parameter combination
        const gateTemplate = {
            id: uuidv4(),
            type: constants.GATE_CREATOR_PERSISTENT_HOMOLOGY,
            parentTemplateId: null,
            selectedXParameterIndex: sample.selectedXParameterIndex,
            selectedYParameterIndex: sample.selectedYParameterIndex,
            selectedXScale: sample.selectedXScale,
            selectedYScale: sample.selectedYScale,
            expectedGates: [],
            typeSpecificData: {}
        }

        for (let i = 0; i < gates.length; i++) {
            const gate = gates[i]

            gateTemplate.expectedGates.push({
                xOrder: truePeaks[i].xOrder,
                yOrder: truePeaks[i].yOrder,
                typeSpecificData: truePeaks[i].homologyParameters
            })

            gate.gateTemplateId = gateTemplate.id
        }

        const gateTemplateAction = createGateTemplate(gateTemplate)
        currentState = applicationReducer(currentState, gateTemplateAction)
        store.dispatch(gateTemplateAction)


        for (let i = 0; i < gates.length; i++) {
            const gate = gates[i]
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

        // Dispatch a redux action to mark the sample as finished loading
        const loadingFinishedAction = updateSample(sampleId, { loading: false, loadingMessage: null })
        store.dispatch(loadingFinishedAction)
    },

    getPopulationForSample: async function (sampleId) {
        // Find the related sample
        const sample = _.find(currentState.samples, s => s.id === sampleId)

        if (!sample) { console.log('Error in getPopulationForSample(): no sample with id ', sampleId, 'was found'); return }

        const fullPopulation = (await getFCSFileFromPath(sample.filePath)).dataAsNumbers
        let subPopulation = []
        if (sample.includeEventIds && sample.includeEventIds.length > 0) {
            for (let i = 0; i < sample.includeEventIds.length; i++) {
                subPopulation.push(fullPopulation[sample.includeEventIds[i]])
            }
        } else {
            subPopulation = fullPopulation
        }

        return subPopulation
    }
}