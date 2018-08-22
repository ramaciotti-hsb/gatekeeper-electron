// -------------------------------------------------------------------------
// Generates a PNG for a plot with options and saves it to the disk.
// -------------------------------------------------------------------------

import fs from 'fs-extra'
import mkdirp from 'mkdirp'
import FCS from 'fcs'
import _ from 'lodash'
import path from 'path'
import { getScales, getPlotImageKey } from '../../gatekeeper-utilities/utilities'
import constants from '../../gatekeeper-utilities/constants'

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

async function getFullSubSamplePopulation (workspaceId, FCSFileId, sampleId, options) {
    const assetDirectory = process.argv[2]
    const directory = path.join(assetDirectory, 'workspaces', workspaceId, FCSFileId, sampleId)
    const sampleKey = getPlotImageKey(options)
    const filePath = path.join(directory, `${sampleKey}.json`)

    let toReturn = []

    let FCSFileData
    try  {
        FCSFileData = await getFCSFileFromPath(path.join(assetDirectory, 'workspaces', workspaceId, FCSFileId, FCSFileId + '.fcs'))
    } catch (error) {
        process.stderr.write(JSON.stringify(error))
        return
    }

    let population = {}
    try {
        population = JSON.parse(await readFile(filePath))
    } catch (error) {
        console.log("Couldn't find cached population file", error)
        return FCSFileData.dataAsNumbers.map((p, index) => { return [p, index] })
    }

    const subPopulation = []

    for (let i = 0; i < population.subPopulation.length; i++) {
        subPopulation.push([ FCSFileData.dataAsNumbers[population.subPopulation[i]], population.subPopulation[i] ])
    }

    return subPopulation
}

async function getPopulationForSampleInternal (workspaceId, FCSFileId, sampleId, options) {
    const assetDirectory = process.argv[2]
    const directory = path.join(assetDirectory, 'workspaces', workspaceId, FCSFileId, sampleId)
    const sampleKey = getPlotImageKey(options)
    const filePath = path.join(directory, `${sampleKey}.json`)

    try {
        return JSON.parse(await readFile(filePath))
    } catch (error) {
        // console.log("Couldn't find cached population file", error)
    }

    await mkdirpPromise(directory)

    let FCSFileData
    try  {
        FCSFileData = await getFCSFileFromPath(path.join(assetDirectory, 'workspaces', workspaceId, FCSFileId, FCSFileId + '.fcs'))
    } catch (error) {
        process.stderr.write(JSON.stringify(error))
        return
    }

    let xOffset = options.machineType === constants.MACHINE_CYTOF ? Math.round(Math.min(options.plotWidth, options.plotHeight) * 0.07) : 0
    let yOffset = options.machineType === constants.MACHINE_CYTOF ? Math.round(Math.min(options.plotWidth, options.plotHeight) * 0.07) : 0

    const subPopulation = []
    const aboveZeroPopulation = []
    const doubleChannelZeroes = []
    const xChannelZeroes = []
    const yChannelZeroes = []

    let includeEventIds = []
    try {
        const eventResults = await readFile(path.join(assetDirectory, 'workspaces', workspaceId, FCSFileId, sampleId, 'include-event-ids.json'))
        includeEventIds = JSON.parse(eventResults)
    } catch (error) {
        // console.log(error)
    }

    if (includeEventIds && includeEventIds.length > 0) {
        for (let i = 0; i < includeEventIds.length; i++) {
            const point = FCSFileData.dataAsNumbers[includeEventIds[i]]

            if (options.machineType === constants.MACHINE_CYTOF) {
                // Every point that has a zero in the selected X channel
                if (point[options.selectedXParameterIndex] === 0 && point[options.selectedYParameterIndex] === 0) {
                    doubleChannelZeroes.push([ point[options.selectedXParameterIndex], includeEventIds[i] ])
                }
                // Every point that has a zero in the selected X channel
                else if (point[options.selectedXParameterIndex] === 0) {
                    xChannelZeroes.push([ point[options.selectedYParameterIndex], includeEventIds[i] ])
                // Every point that has a zero in the selected Y channel
                } else if (point[options.selectedYParameterIndex] === 0) {
                    yChannelZeroes.push([ point[options.selectedXParameterIndex], includeEventIds[i] ])
                } else {
                    aboveZeroPopulation.push([ point[options.selectedXParameterIndex], point[options.selectedYParameterIndex], includeEventIds[i] ])
                }
            } else {
                aboveZeroPopulation.push([ FCSFileData.dataAsNumbers[i][options.selectedXParameterIndex], FCSFileData.dataAsNumbers[i][options.selectedYParameterIndex], includeEventIds[i] ])
            }

            subPopulation.push([ point[options.selectedXParameterIndex], point[options.selectedYParameterIndex], includeEventIds[i] ])
        }
    } else {
        for (let i = 0; i < FCSFileData.dataAsNumbers.length; i++) {
            if (options.machineType === constants.MACHINE_CYTOF) {
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
        xRange: [ options.minXValue, options.maxXValue ],
        yRange: [ options.minYValue, options.maxYValue ],
        width: options.plotWidth - xOffset,
        height: options.plotHeight - yOffset
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
            } else {
                pointCache[yVal][xVal] += 1
            }
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

            for (let i = 0; i < incrementors.length; i++) {
                newDensityMap[x] += incrementors[i].currentValue
                if (newDensityMap[x] > maxDensity) {
                    maxDensity = newDensityMap[x]
                }
            }

            if (pointCache[x]) {
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

            for (let i = 0; i < incrementors.length; i++) {
                newDensityMap[x] += incrementors[i].currentValue
                if (newDensityMap[x] > maxDensity) {
                    maxDensity = newDensityMap[x]
                }
            }

            if (pointCache[x]) {
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

    const densityWidth = Math.floor((options.plotWidth + options.plotHeight) * 0.012)

    const densityMap = calculateDensity(aboveZeroPopulation, scales, densityWidth)

    let zeroDensityY
    let zeroDensityX
    let maxDensityY
    let maxDensityX

    if (options.machineType === constants.MACHINE_CYTOF) {
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

    fs.writeFile(filePath, JSON.stringify(toReturn), (error) => { if (error) { console.log(error) } /* console.log('population data saved to disk') */ })

    return toReturn
}

async function getPopulationForSample (workspaceId, FCSFileId, sampleId, options) {
    return await getPopulationForSampleInternal(workspaceId, FCSFileId, sampleId, options)
}

export { getFullSubSamplePopulation, getPopulationForSample }