// -------------------------------------------------------------------------
// Generates a PNG for a plot with options and saves it to the disk.
// -------------------------------------------------------------------------

import constants from './constants'
import fs from 'fs'
import mkdirp from 'mkdirp'
import FCS from 'fcs'
import _ from 'lodash'
import path from 'path'
import * as d3 from 'd3'
import { getScales, kernelDensityEstimator, kernelEpanechnikov, getPlotImageKey } from './utilities'

// Wrap the read file function from FS in a promise
const readFileBuffer = (path) => {
    return new Promise((res, rej) => {
        fs.readFile(path, (err, buffer) => {
            if (err) rej(err)
            else res(buffer)
        })
    })
}

// Wrap the read file function from FS in a promise
const readFile = (path, opts = 'utf8') => {
    return new Promise((res, rej) => {
        fs.readFile(path, opts, (err, data) => {
            if (err) rej(err)
            else res(data)
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

async function getPopulationForSampleInternal (sample, FCSFile, options) {
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
                    xChannelZeroes.push([ FCSFileData.dataAsNumbers[i][options.selectedYParameterIndex], i ])
                // Every point that has a zero in the selected Y channel
                } else if (FCSFileData.dataAsNumbers[i][options.selectedYParameterIndex] === 0) {
                    yChannelZeroes.push([ FCSFileData.dataAsNumbers[i][options.selectedXParameterIndex], i ])
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

        return {
            densityMap: pointCache,
            maxDensity,
            // meanDensity
        }
    }

    const calculateDensity1D = function (points, scale, densityWidth = 2) {
        // Create a sorted point cache that's accessible by [row] for faster density estimation
        const pointCache = Array(points.length).fill(0)
        let maxDensity = 0
        
        for (let i = 0; i < points.length; i++) {
            const point = points[i][0]

            const val = Math.round(scale(point))

            if (val < 0) { continue }

            if (!pointCache[val]) {
                pointCache[val] = 1
            }

            // Increment the density of neighbouring points
            for (let j = Math.max(val - densityWidth, 0); j < Math.min(val + densityWidth, pointCache.length); j++) {
                if (j === val) { continue }
                const density = pointCache[j]

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

    const toReturn = {
        subPopulation,
        aboveZeroPopulation,
        xChannelZeroes,
        yChannelZeroes,
        densityMap,
        zeroDensityX,
        zeroDensityY,
        maxDensity: realMaxDensity
    }

    const directory = path.join(options.assetDirectory, 'sample-images', sample.id)
    const sampleKey = getPlotImageKey(_.merge(options, FCSFile))
    const fileName = path.join(directory, `${sampleKey}.json`)
    await mkdirpPromise(directory)
    fs.writeFile(fileName, JSON.stringify(toReturn), () => { console.log('population data saved to disk') })

    return toReturn
}

export default async function getPopulationForSample (sample, FCSFile, options) {
    const directory = path.join(options.assetDirectory, 'sample-images', sample.id)
    const sampleKey = getPlotImageKey(_.merge(options, FCSFile))
    const fileName = path.join(directory, `${sampleKey}.json`)

    try {
        const cacheFile = await readFile(fileName)
        return JSON.parse(cacheFile)
    } catch (error) {
        return await getPopulationForSampleInternal(sample, FCSFile, options)
    }
}