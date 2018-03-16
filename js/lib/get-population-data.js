// -------------------------------------------------------------------------
// Generates a PNG for a plot with options and saves it to the disk.
// -------------------------------------------------------------------------

import constants from './constants'
import fs from 'fs'
import FCS from 'fcs'
import _ from 'lodash'
import * as d3 from 'd3'
import { getScales } from './utilities'

// Wrap the read file function from FS in a promise
const readFileBuffer = (path) => {
    return new Promise((res, rej) => {
        fs.readFile(path, (err, buffer) => {
            if (err) rej(err)
            else res(buffer)
        })
    })
}

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

export default async function getPopulationForSample (sample, options) {
    process.stdout.write(JSON.stringify({ data: 'Reading FCS File' }))
    const FCSFile = await getFCSFileFromPath(sample.filePath)

    const selectedMachineType = FCSFile.text['$CYT'].match(/CYTOF/) ? constants.MACHINE_CYTOF : MACHINE_FLORESCENT

    let xOffset = selectedMachineType === constants.MACHINE_CYTOF ? constants.CYTOF_HISTOGRAM_WIDTH : 0
    let yOffset = selectedMachineType === constants.MACHINE_CYTOF ? constants.CYTOF_HISTOGRAM_HEIGHT : 0

    if (!sample) { console.log('Error in getPopulationForSample(): no sample with id ', sampleId, 'was found'); return }

    // Loop through the parameters and get the min and max values of all the data points
    const FCSParameters = []

    process.stdout.write(JSON.stringify({ data: 'Getting parameters' }))
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

    const subPopulation = []
    const xChannelZeroes = []
    const yChannelZeroes = []

    process.stdout.write(JSON.stringify({ data: 'Removing zeroes and calculating statistics' }))
    for (let i = 0; i < FCSFile.dataAsNumbers.length; i++) {
        if (selectedMachineType === constants.MACHINE_CYTOF) {
            if (sample.includeEventIds.length === 0 || sample.includeEventIds[i]) {
                // Every point that has a zero in the selected X channel
                if (FCSFile.dataAsNumbers[i][options.selectedXParameterIndex] === 0 && FCSFile.dataAsNumbers[i][options.selectedYParameterIndex] === 0) {
                    // doubleChannelZeroes.push(scales.yScale(sample.FCSParameters[options.selectedYParameterIndex].statistics.max))
                }
                // Every point that has a zero in the selected X channel
                else if (FCSFile.dataAsNumbers[i][options.selectedXParameterIndex] === 0) {
                    xChannelZeroes.push(FCSFile.dataAsNumbers[i][options.selectedYParameterIndex])
                // Every point that has a zero in the selected Y channel
                } else if (FCSFile.dataAsNumbers[i][options.selectedYParameterIndex] === 0) {
                    yChannelZeroes.push(FCSFile.dataAsNumbers[i][options.selectedXParameterIndex])
                } else {
                    subPopulation.push([ FCSFile.dataAsNumbers[i][options.selectedXParameterIndex], FCSFile.dataAsNumbers[i][options.selectedYParameterIndex] ])
                }
            }
        } else if (sample.includeEventIds.length === 0 || sample.includeEventIds.includes[i]) {
            subPopulation.push([ FCSFile.dataAsNumbers[i][options.selectedXParameterIndex], FCSFile.dataAsNumbers[i][options.selectedYParameterIndex] ])
        }

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

    const scales = getScales({
        selectedXScale: options.selectedXScale,
        selectedYScale: options.selectedYScale,
        xRange: [ FCSParameters[options.selectedXParameterIndex].statistics.min, FCSParameters[options.selectedXParameterIndex].statistics.max ],
        yRange: [ FCSParameters[options.selectedYParameterIndex].statistics.min, FCSParameters[options.selectedYParameterIndex].statistics.max ],
        width: constants.PLOT_WIDTH - xOffset,
        height: constants.PLOT_HEIGHT - yOffset
    })

    // Data should be an array of 2d points, in [x, y] format i.e. [[1, 1], [2, 2]]
    const calculateDensity = function (points, scales, densityWidth = 2) {
        // Create a sorted point cache that's accessible by [row][column] for faster density estimation
        const pointCache = []
        let maxDensity = 0
        
        for (let i = 0; i < points.length; i++) {
            const point = points[i]

            const xVal = Math.round(scales.xScale(point[0]))
            const yVal = Math.round(scales.yScale(point[1]))

            if (!pointCache[yVal]) {
                pointCache[yVal] = []
            }
            if (!pointCache[yVal][xVal]) {
                pointCache[yVal][xVal] = 1
            }

            // Increment the density of neighbouring points
            for (let y = yVal - densityWidth; y < yVal + densityWidth; y++) {
                const columnDens = pointCache[y]
                if (!columnDens) {
                    pointCache[y] = []
                }

                for (let x = xVal - densityWidth; x < xVal + densityWidth; x++) {
                    const rowDens = pointCache[y][x]
                    if (!rowDens) {
                        pointCache[y][x] = ((1 - Math.abs(xVal - x) / densityWidth) + (1 - Math.abs(yVal - y) / densityWidth))
                        // console.log(pointCache[y][x])
                    } else {
                        pointCache[y][x] += ((1 - Math.abs(xVal - x) / densityWidth) + (1 - Math.abs(yVal - y) / densityWidth))
                        if (pointCache[y][x] > maxDensity) {
                            maxDensity = pointCache[y][x]
                        }
                    }
                }
            }
        }


        // const scale = d3.scaleLog().range([0, 1]domain([1, maxDensity])
        // maxDensity = 1
        // for (let y = 0; y < pointCache.length; y++) {
        //     if (!pointCache[y]) { continue }
        //     for (let x = 0; x < pointCache[y].length; x++) {
        //         if (!pointCache[y][x]) { continue }
        //         pointCache[y][x] = scale(pointCache[y][x])
        //     }   
        // }

        let meanDensity = 0
        for (let y = 0; y < pointCache.length; y++) {
            if (!pointCache[y]) { continue }
            for (let x = 0; x < pointCache[y].length; x++) {
                if (!pointCache[y][x]) { continue }
                meanDensity += pointCache[y][x] / ((constants.PLOT_WIDTH - xOffset) * (constants.PLOT_WIDTH - yOffset))
            }   
        }

        for (let y = 0; y < pointCache.length; y++) {
            if (!pointCache[y]) { continue }
            for (let x = 0; x < pointCache[y].length; x++) {
                if (!pointCache[y][x]) { continue }
                if (pointCache[y][x] > meanDensity * 15) {
                    const difference = Math.min((maxDensity - pointCache[y][x]) / (maxDensity - (meanDensity * 15)) + 0.5, 1)
                    pointCache[y][x] = (meanDensity * 15) + (pointCache[y][x] - meanDensity * 15) * difference
                }
            }   
        }

        return {
            densityMap: pointCache,
            maxDensity,
            meanDensity
        }
    }

    process.stdout.write(JSON.stringify({ data: 'Calculating density' }))

    const densityMap = calculateDensity(subPopulation, scales, Math.floor((constants.PLOT_WIDTH + constants.PLOT_HEIGHT) * 0.006))

    return {
        subPopulation,
        xChannelZeroes,
        yChannelZeroes,
        densityMap,
        FCSParameters,
        selectedMachineType: selectedMachineType,
        populationCount: subPopulation.length
    }
}