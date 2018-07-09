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

async function getFullSubSamplePopulation (sample, FCSFile) {
    process.stdout.write(JSON.stringify({ data: 'Reading FCS File: ' + FCSFile.filePath }))
    let FCSFileData
    try  {
        FCSFileData = await getFCSFileFromPath(FCSFile.filePath)        
    } catch (error) {
        process.stderr.write(JSON.stringify(error))
        return
    }

    const subPopulation = []

    if (sample.includeEventIds && sample.includeEventIds.length > 0) {
        for (let i = 0; i < sample.includeEventIds.length; i++) {
            subPopulation.push([ FCSFileData.dataAsNumbers[sample.includeEventIds[i]], sample.includeEventIds[i] ])
        }
    } else {
        return FCSFileData.dataAsNumbers.map((p, index) => { return [p, index] })
    }

    return subPopulation
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
    const doubleChannelZeroes = []
    const xChannelZeroes = []
    const yChannelZeroes = []

    process.stdout.write(JSON.stringify({ data: 'Removing zeroes' }))
    if (sample.includeEventIds && sample.includeEventIds.length > 0) {
        for (let i = 0; i < sample.includeEventIds.length; i++) {
            const point = FCSFileData.dataAsNumbers[sample.includeEventIds[i]]

            if (FCSFile.machineType === constants.MACHINE_CYTOF) {
                // Every point that has a zero in the selected X channel
                if (point[options.selectedXParameterIndex] === 0 && point[options.selectedYParameterIndex] === 0) {
                    doubleChannelZeroes.push([ point[options.selectedXParameterIndex], sample.includeEventIds[i] ])
                }
                // Every point that has a zero in the selected X channel
                else if (point[options.selectedXParameterIndex] === 0) {
                    xChannelZeroes.push([ point[options.selectedYParameterIndex], sample.includeEventIds[i] ])
                // Every point that has a zero in the selected Y channel
                } else if (point[options.selectedYParameterIndex] === 0) {
                    yChannelZeroes.push([ point[options.selectedXParameterIndex], sample.includeEventIds[i] ])
                } else {
                    aboveZeroPopulation.push([ point[options.selectedXParameterIndex], point[options.selectedYParameterIndex], sample.includeEventIds[i] ])
                }
            } else {
                aboveZeroPopulation.push([ FCSFileData.dataAsNumbers[i][options.selectedXParameterIndex], FCSFileData.dataAsNumbers[i][options.selectedYParameterIndex], sample.includeEventIds[i] ])
            }

            subPopulation.push([ point[options.selectedXParameterIndex], point[options.selectedYParameterIndex], sample.includeEventIds[i] ])
        }
    } else {
        for (let i = 0; i < FCSFileData.dataAsNumbers.length; i++) {
            if (FCSFile.machineType === constants.MACHINE_CYTOF) {
                // Every point that has a zero in the selected X channel
                if (FCSFileData.dataAsNumbers[i][options.selectedXParameterIndex] === 0 && FCSFileData.dataAsNumbers[i][options.selectedYParameterIndex] === 0) {
                    doubleChannelZeroes.push([ FCSFileData.dataAsNumbers[i][options.selectedYParameterIndex], i ])
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
            } else {
                subPopulation.push([ FCSFileData.dataAsNumbers[i][options.selectedXParameterIndex], FCSFileData.dataAsNumbers[i][options.selectedYParameterIndex], i ])
                aboveZeroPopulation.push([ FCSFileData.dataAsNumbers[i][options.selectedXParameterIndex], FCSFileData.dataAsNumbers[i][options.selectedYParameterIndex], i ])
            }
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
            } else {
                pointCache[yVal][xVal] += 1
            }

            // // Increment the density of neighbouring points
            // for (let y = Math.max(yVal - densityWidth, 0); y < Math.min(yVal + densityWidth, pointCache.length); y++) {
            //     const columnDens = pointCache[y]
            //     if (!columnDens) {
            //         pointCache[y] = []
            //     }

            //     for (let x = Math.max(xVal - densityWidth, 0); x < xVal + densityWidth; x++) {
            //         if (x === xVal && y === yVal) { continue }

            //         const rowDens = pointCache[y][x]
            //         if (!rowDens) {
            //             pointCache[y][x] = ((1 - Math.abs(xVal - x) / densityWidth) + (1 - Math.abs(yVal - y) / densityWidth))
            //             // console.log(pointCache[y][x])
            //         } else {
            //             pointCache[y][x] += ((1 - Math.abs(xVal - x) / densityWidth) + (1 - Math.abs(yVal - y) / densityWidth))
            //             if (pointCache[y][x] > maxDensity) {
            //                 maxDensity = pointCache[y][x]
            //             }
            //         }
            //     }
            // }
        }

        const newDensityMap = Array(options.plotHeight).fill(0)

        for (let y = 0; y < options.plotHeight; y++) {
            newDensityMap[y] = Array(options.plotWidth).fill(0)

            // console.log('row', y)
            let incrementors = []
            for (let x = 0; x < options.plotWidth; x++) {

                for (let i = 0; i < incrementors.length; i++) {
                    incrementors[i].currentValue -= incrementors[i].originalValue / densityWidth

                    if (Math.round(incrementors[i].currentValue * 10) / 10 === 0) {
                        incrementors.splice(i, 1)
                        i--
                    }
                }

                // console.log('incrementors', incrementors)

                for (let i = 0; i < incrementors.length; i++) {
                    newDensityMap[y][x] += incrementors[i].currentValue
                }

                if (pointCache[y] && pointCache[y][x]) {
                    // newDensityMap[y][x] += pointCache[y][x]
                    incrementors.push({ originalValue: pointCache[y][x], currentValue: pointCache[y][x] })
                }
            }
            // console.log(newDensityMap)
        }

        // incrementorCache = Array(options.plotWidth).fill(0)

        // console.log('--------------------------------------------------------------------')

        for (let y = 0; y < options.plotHeight; y++) {
            // console.log('row', y)
            let incrementors = []
            for (let x = options.plotWidth - 1; x > -1; x--) {

                for (let i = 0; i < incrementors.length; i++) {
                    incrementors[i].currentValue -= incrementors[i].originalValue / densityWidth

                    if (Math.round(incrementors[i].currentValue * 10) / 10 === 0) {
                        incrementors.splice(i, 1)
                        i--
                    }
                }

                // console.log('incrementors', incrementors)

                for (let i = 0; i < incrementors.length; i++) {
                    newDensityMap[y][x] += incrementors[i].currentValue
                }

                if (pointCache[y] && pointCache[y][x]) {
                    // newDensityMap[y][x] += pointCache[y][x]
                    incrementors.push({ originalValue: pointCache[y][x], currentValue: pointCache[y][x] })
                }
            }
            // console.log(newDensityMap)
        }

        // incrementorCache = Array(options.plotWidth).fill(0)

        // console.log('--------------------------------------------------------------------')

        for (let x = 0; x < options.plotWidth; x++) {
            // console.log('column', x)
            let incrementors = []
            for (let y = 0; y < options.plotHeight; y++) {

                for (let i = 0; i < incrementors.length; i++) {
                    incrementors[i].currentValue -= incrementors[i].originalValue / densityWidth

                    if (Math.round(incrementors[i].currentValue * 10) / 10 === 0) {
                        incrementors.splice(i, 1)
                        i--
                    }
                }

                // console.log('incrementors', incrementors)

                for (let i = 0; i < incrementors.length; i++) {
                    newDensityMap[y][x] += incrementors[i].currentValue
                }

                if (pointCache[y] && pointCache[y][x]) {
                    // newDensityMap[y][x] += pointCache[y][x]
                    incrementors.push({ originalValue: pointCache[y][x], currentValue: pointCache[y][x] })
                }
            }
            // console.log(newDensityMap)
        }

        // // incrementorCache = Array(options.plotWidth).fill(0)

        // console.log('--------------------------------------------------------------------')

        for (let x = 0; x < options.plotWidth; x++) {
            // console.log('column', x)
            let incrementors = []
            for (let y = options.plotHeight - 1; y > -1; y--) {

                for (let i = 0; i < incrementors.length; i++) {
                    incrementors[i].currentValue -= incrementors[i].originalValue / densityWidth

                    if (Math.round(incrementors[i].currentValue * 10) / 10 === 0) {
                        incrementors.splice(i, 1)
                        i--
                    }
                }

                // console.log('incrementors', incrementors)

                for (let i = 0; i < incrementors.length; i++) {
                    newDensityMap[y][x] += incrementors[i].currentValue
                }

                if (pointCache[y] && pointCache[y][x]) {
                    // newDensityMap[y][x] += pointCache[y][x]
                    incrementors.push({ originalValue: pointCache[y][x], currentValue: pointCache[y][x] })
                }
            }
            // console.log(newDensityMap)
        }


        // console.log('--------------------------------------------------------------------')

        for (let x = 0; x < options.plotWidth; x++) {
            for (let y = options.plotHeight - 1; y > -1; y--) {
                if (pointCache[y] && pointCache[y][x]) {
                    newDensityMap[y][x] += pointCache[y][x]
                }
            }
        }

        for (let y = 1; y < options.plotHeight - 1; y++) {
            for (let x = 1; x < options.plotWidth - 1; x++) {
                const toAdd = (newDensityMap[y - 1][x - 1] + newDensityMap[y - 1][x + 1] + newDensityMap[y + 1][x - 1] + newDensityMap[y + 1][x + 1]) / 4
                newDensityMap[y][x] += toAdd
                maxDensity = Math.max(maxDensity, newDensityMap[y][x])                
            }
        }

        return {
            densityMap: newDensityMap,
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

            pointCache[val] += 1

            // // Increment the density of neighbouring points
            // for (let j = Math.max(val - densityWidth, 0); j < Math.min(val + densityWidth, pointCache.length); j++) {
            //     if (j === val) { continue }
            //     const density = pointCache[j]

            //     pointCache[j] += Math.abs(val - j) / densityWidth
            //     if (pointCache[j] > maxDensity) {
            //         maxDensity = pointCache[j]
            //     }
            // }
        }

        const newDensityMap = Array(points.length).fill(0)
        let incrementors = []
        for (let x = 0; x < pointCache.length; x++) {

            for (let i = 0; i < incrementors.length; i++) {
                incrementors[i].currentValue -= incrementors[i].originalValue / densityWidth

                if (Math.round(incrementors[i].currentValue * 10) / 10 === 0) {
                    incrementors.splice(i, 1)
                    i--
                }
            }

            // console.log('incrementors', incrementors)

            for (let i = 0; i < incrementors.length; i++) {
                newDensityMap[x] += incrementors[i].currentValue
                if (newDensityMap[x] > maxDensity) {
                    maxDensity = newDensityMap[x]
                }
            }

            if (pointCache[x]) {
                // newDensityMap[y][x] += pointCache[y][x]
                incrementors.push({ originalValue: pointCache[x], currentValue: pointCache[x] })
            }
        }

        incrementors = []
        for (let x = pointCache.length - 1; x > -1; x--) {

            for (let i = 0; i < incrementors.length; i++) {
                incrementors[i].currentValue -= incrementors[i].originalValue / densityWidth

                if (Math.round(incrementors[i].currentValue * 10) / 10 === 0) {
                    incrementors.splice(i, 1)
                    i--
                }
            }

            // console.log('incrementors', incrementors)

            for (let i = 0; i < incrementors.length; i++) {
                newDensityMap[x] += incrementors[i].currentValue
                if (newDensityMap[x] > maxDensity) {
                    maxDensity = newDensityMap[x]
                }
            }

            if (pointCache[x]) {
                // newDensityMap[y][x] += pointCache[y][x]
                incrementors.push({ originalValue: pointCache[x], currentValue: pointCache[x] })
            }
        }

        for (let x = 0; x < pointCache.length; x++) {
            if (pointCache[x]) {
                newDensityMap[x] += pointCache[x] / 2
                if (newDensityMap[x] > maxDensity) {
                    maxDensity = newDensityMap[x]
                }
            }
        }

        return {
            densityMap: newDensityMap,
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
    if (doubleChannelZeroes.length > 0) {
        realMaxDensity = Math.max(realMaxDensity, doubleChannelZeroes.length / 4)   
    }

    const toReturn = {
        subPopulation,
        aboveZeroPopulation,
        doubleChannelZeroes,
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

async function getPopulationForSample (sample, FCSFile, options) {
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

export { getFullSubSamplePopulation, getPopulationForSample }