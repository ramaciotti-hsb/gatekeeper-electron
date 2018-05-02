// -------------------------------------------------------------------------
// Generates a PNG for a plot with options and saves it to the disk.
// -------------------------------------------------------------------------

import constants from './constants'
import fs from 'fs'
import FCS from 'fcs'
import _ from 'lodash'
import * as d3 from 'd3'
import { getScales, kernelDensityEstimator, kernelEpanechnikov } from './utilities'

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
    try {
        const buffer = await readFileBuffer(filePath)        
        const FCSFile = new FCS({ dataFormat: 'asNumber', eventsToRead: -1 }, buffer)
        FCSFileCache[filePath] = FCSFile
        return FCSFile
    } catch (error) {
        process.stderr.write(JSON.stringify(error))
    }
}

export default async function getPopulationForSample (sample, FCSFile, options) {
    process.stdout.write(JSON.stringify({ data: 'Reading FCS File: ' + FCSFile.filePath }))
    let FCSFileData
    try  {
        FCSFileData = await getFCSFileFromPath(FCSFile.filePath)        
    } catch (error) {
        process.stderr.write(JSON.stringify(error))
        return
    }

    let xOffset = FCSFile.machineType === constants.MACHINE_CYTOF ? Math.round(Math.min(options.plotWidth, options.plotHeight) * 0.07) : 0
    let yOffset = FCSFile.machineType === constants.MACHINE_CYTOF ? Math.round(Math.min(options.plotWidth, options.plotHeight) * 0.07) : 0

    if (!sample) { console.log('Error in getPopulationForSample(): no sample with id ', sampleId, 'was found'); return }

    const subPopulation = []
    const aboveZeroPopulation = []
    const xChannelZeroes = []
    const yChannelZeroes = []

    process.stdout.write(JSON.stringify({ data: 'Removing zeroes' }))
    for (let i = 0; i < FCSFileData.dataAsNumbers.length; i++) {
        if (FCSFile.machineType === constants.MACHINE_CYTOF) {
            if (sample.includeEventIds.length === 0 || sample.includeEventIds.includes(i)) {
                // Every point that has a zero in the selected X channel
                if (FCSFileData.dataAsNumbers[i][options.selectedXParameterIndex] === 0 && FCSFileData.dataAsNumbers[i][options.selectedYParameterIndex] === 0) {
                    // doubleChannelZeroes.push(scales.yScale(sample.FCSFile.FCSParameters[options.selectedYParameterIndex].statistics.max))
                }
                // Every point that has a zero in the selected X channel
                else if (FCSFileData.dataAsNumbers[i][options.selectedXParameterIndex] === 0) {
                    xChannelZeroes.push(FCSFileData.dataAsNumbers[i][options.selectedYParameterIndex])
                // Every point that has a zero in the selected Y channel
                } else if (FCSFileData.dataAsNumbers[i][options.selectedYParameterIndex] === 0) {
                    yChannelZeroes.push(FCSFileData.dataAsNumbers[i][options.selectedXParameterIndex])
                } else {
                    aboveZeroPopulation.push([ FCSFileData.dataAsNumbers[i][options.selectedXParameterIndex], FCSFileData.dataAsNumbers[i][options.selectedYParameterIndex], i ])
                }
                subPopulation.push([ FCSFileData.dataAsNumbers[i][options.selectedXParameterIndex], FCSFileData.dataAsNumbers[i][options.selectedYParameterIndex], i ])
            }
        } else if (sample.includeEventIds.length === 0 || sample.includeEventIds.includes(i)) {
            subPopulation.push([ FCSFileData.dataAsNumbers[i][options.selectedXParameterIndex], FCSFileData.dataAsNumbers[i][options.selectedYParameterIndex], i ])
            aboveZeroPopulation.push([ FCSFileData.dataAsNumbers[i][options.selectedXParameterIndex], FCSFileData.dataAsNumbers[i][options.selectedYParameterIndex], i ])
        }
    }

    const scales = getScales({
        selectedXScale: options.selectedXScale,
        selectedYScale: options.selectedYScale,
        xRange: [ FCSFile.FCSParameters[options.selectedXParameterIndex].statistics.positiveMin, FCSFile.FCSParameters[options.selectedXParameterIndex].statistics.max ],
        yRange: [ FCSFile.FCSParameters[options.selectedYParameterIndex].statistics.positiveMin, FCSFile.FCSParameters[options.selectedYParameterIndex].statistics.max ],
        width: options.plotWidth - xOffset,
        height: options.plotHeight - yOffset
    })

    // process.stdout.write(JSON.stringify({ data: 'Calculating density' }))
    // // Perform kernel density for each channel then combine for 2d density
    // const densityX = kernelDensityEstimator(kernelEpanechnikov(options.plotWidth * 0.012), _.range(0, options.plotWidth - xOffset))(subPopulation.map(value => scales.xScale(value[0])))
    // const densityY = kernelDensityEstimator(kernelEpanechnikov(options.plotHeight * 0.012), _.range(0, options.plotHeight - yOffset))(subPopulation.map(value => scales.yScale(value[1])))

    // let newMaxDensity = 0
    // for (let i = 0; i < densityX.length; i++) {
    //     // densityX[i][1] = densityX[i][1] * 100
    //     for (let j = 0; j < densityY.length; j++) {
    //         // densityY[j][1] = densityY[j][1] * 100
    //         if (densityX[i][1] * densityY[j][1] > newMaxDensity) {
    //             newMaxDensity = densityX[i][1] * densityY[j][1]
    //         }
    //     }
    // }

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
                    if (x === xVal && y === yVal) { continue }

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

        // let meanDensity = 0
        // for (let y = 0; y < pointCache.length; y++) {
        //     if (!pointCache[y]) { continue }
        //     for (let x = 0; x < pointCache[y].length; x++) {
        //         if (!pointCache[y][x]) { continue }
        //         meanDensity += pointCache[y][x] / ((options.plotWidth - xOffset) * (options.plotHeight - yOffset))
        //     }   
        // }

        // // Normalize any extreme outliers from the mean density
        // for (let y = 0; y < pointCache.length; y++) {
        //     if (!pointCache[y]) { continue }
        //     for (let x = 0; x < pointCache[y].length; x++) {
        //         if (!pointCache[y][x]) { continue }
        //         if (pointCache[y][x] > meanDensity * 15) {
        //             const difference = Math.min((maxDensity - pointCache[y][x]) / (maxDensity - (meanDensity * 15)) + 0.5, 1)
        //             pointCache[y][x] = (meanDensity * 15) + (pointCache[y][x] - meanDensity * 15) * difference
        //         }
        //     }   
        // }

        return {
            densityMap: pointCache,
            maxDensity,
            // meanDensity
        }
    }

    const calculateDensity1D = function (points, scale, densityWidth = 2) {
        // Create a sorted point cache that's accessible by [row] for faster density estimation
        const pointCache = []
        let maxDensity = 0
        
        for (let i = 0; i < points.length; i++) {
            const point = points[i]

            const val = Math.round(scale(point))

            if (!pointCache[val]) {
                pointCache[val] = 1
            }

            // Increment the density of neighbouring points
            for (let j = val - densityWidth; j < val + densityWidth; j++) {
                if (j === val) { continue }
                const density = pointCache[j]
                if (!pointCache[j]) {
                    pointCache[j] = 0
                }

                pointCache[j] += Math.abs(val - j) / densityWidth
                if (pointCache[j] > maxDensity) {
                    maxDensity = pointCache[j]
                }
            }
        }

        return {
            densityMap: pointCache,
            maxDensity
        }
    }

    process.stdout.write(JSON.stringify({ data: 'Calculating density' }))

    const densityWidth = Math.floor((options.plotWidth + options.plotHeight) * 0.009)

    const densityMap = calculateDensity(aboveZeroPopulation, scales, densityWidth)

    let zeroDensityY
    let zeroDensityX
    let maxDensityY
    let maxDensityX

    if (FCSFile.machineType === constants.MACHINE_CYTOF) {
        // densityY = kernelDensityEstimator(kernelEpanechnikov(options.plotWidth * 0.05), _.range(0, options.plotWidth - xOffset))(yChannelZeroes.map(value => scales.xScale(value)))
        // densityX = kernelDensityEstimator(kernelEpanechnikov(options.plotHeight * 0.05), _.range(0, options.plotHeight - yOffset))(xChannelZeroes.map(value => scales.yScale(value)))
        zeroDensityX = calculateDensity1D(xChannelZeroes, scales.yScale, densityWidth)
        zeroDensityY = calculateDensity1D(yChannelZeroes, scales.xScale, densityWidth)
    }

    let realMaxDensity = densityMap.maxDensity
    if (zeroDensityX) {
        realMaxDensity = Math.max(realMaxDensity, zeroDensityX.maxDensity)
    }
    if (zeroDensityY) {
        realMaxDensity = Math.max(realMaxDensity, zeroDensityY.maxDensity)
    }

    return {
        subPopulation,
        aboveZeroPopulation,
        xChannelZeroes,
        yChannelZeroes,
        densityMap,
        zeroDensityX,
        zeroDensityY,
        maxDensity: realMaxDensity
    }
}