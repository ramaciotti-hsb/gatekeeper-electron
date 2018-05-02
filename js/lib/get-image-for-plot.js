// -------------------------------------------------------------------------
// Generates a PNG for a plot with options and saves it to the disk.
// -------------------------------------------------------------------------

import constants from './constants'
import _ from 'lodash'
import pngjs from 'pngjs'
import path from 'path'
import mkdirp from 'mkdirp'
import fs from 'fs'
import * as d3 from 'd3'
import { getPlotImageKey, heatMapRGBForValue, getScales, getPolygonCenter } from './utilities'

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


export default async (sample, FCSFile, subPopulation, options) => {
    // Offset the entire graph and add histograms if we're looking at cytof data
    let xOffset = FCSFile.machineType === constants.MACHINE_CYTOF ? Math.round(Math.min(options.plotWidth, options.plotHeight) * 0.07) : 0
    let yOffset = FCSFile.machineType === constants.MACHINE_CYTOF ? Math.round(Math.min(options.plotWidth, options.plotHeight) * 0.07) : 0

    const data = []
    let PNGFile
    let tempPNGFile = new pngjs.PNG({ width: options.plotWidth - xOffset, height: options.plotHeight - yOffset });
    // const colourScale = chroma.scale(['white', 'blue', 'green', 'yellow', 'red'])
    // const logScale = d3.scaleLog()
    //         .range([0, 1])
    //         .base(Math.E)
    //         .domain([0.01, Math.log(subPopulation.densityMap.maxDensity)])
    // for (let y = 0; y < subPopulation.densityMap.densityMap.length; y++) {
    //     const column = subPopulation.densityMap.densityMap[y]
    //     if (!column) { continue }
    //     for (let x = 0; x < column.length; x++) {
    //         let xValue = Math.floor(x * ((options.plotWidth - xOffset) / options.plotWidth))
    //         let yValue = Math.floor(y * ((options.plotHeight - yOffset) / options.plotHeight))
    //         const index = (yValue * (options.plotWidth - xOffset) + xValue) * 4

    //         const density = column[x]
    //         if (!density) {
    //             tempPNGFile.data[index] = 255
    //             tempPNGFile.data[index + 1] = 255
    //             tempPNGFile.data[index + 2] = 255
    //             tempPNGFile.data[index + 3] = 255
    //             continue
    //         }
    //         const color = colourScale(logScale(subPopulation.densityMap.densityMap[y][x] / subPopulation.densityMap.maxDensity)).rgb()
    //         // const color = colourScale(subPopulation.densityMap.densityMap[y][x]).rgb()
    //         tempPNGFile.data[index] = color[0]
    //         tempPNGFile.data[index + 1] = color[1]
    //         tempPNGFile.data[index + 2] = color[2]
    //         tempPNGFile.data[index + 3] = 255
    //     }
    // }

    let pointRadius = Math.round(((options.plotWidth - xOffset) + (options.plotHeight - yOffset)) / 1000)

    const xStats = FCSFile.FCSParameters[options.selectedXParameterIndex].statistics
    const yStats = FCSFile.FCSParameters[options.selectedYParameterIndex].statistics
    const scales = getScales({
        selectedXScale: options.selectedXScale,
        selectedYScale: options.selectedYScale,
        xRange: [ options.selectedXScale === constants.SCALE_LOG ? xStats.positiveMin : xStats.min, xStats.max ],
        yRange: [ options.selectedYScale === constants.SCALE_LOG ? yStats.positiveMin : yStats.min, yStats.max ],
        width: options.plotWidth - xOffset,
        height: options.plotHeight - yOffset
    })

    for (let i = 0; i < subPopulation.aboveZeroPopulation.length; i++) {
        const point = [ Math.round(scales.xScale(subPopulation.aboveZeroPopulation[i][0])), Math.round(scales.yScale(subPopulation.aboveZeroPopulation[i][1])) ]
        // if (point[0] >= 0 && point[0] < subPopulation.newDensityMap.densityX.length && point[1] >= 0 && point[1] < subPopulation.newDensityMap.densityY.length) {
        if (subPopulation.densityMap.densityMap[point[1]] && subPopulation.densityMap.densityMap[point[1]][point[0]]) {
            // console.log(point)
            const color = heatMapRGBForValue(subPopulation.densityMap.densityMap[point[1]][point[0]] / subPopulation.maxDensity)
            // const density = (subPopulation.newDensityMap.subPopulation.zeroDensityX.densityMap[point[0]][1] * subPopulation.newDensityMap.subPopulation.zeroDensityY.densityMap[point[1]][1]) / subPopulation.newDensityMap.newMaxDensity
            // console.log(density)
            // const color = heatMapRGBForValue(density)
            for (let y = point[1] - pointRadius * 2; y < point[1] + pointRadius * 2; y++) {
                for (let x = point[0] - pointRadius * 2; x < point[0] + pointRadius * 2; x++) {
                    // Draw a circular point of pointDiameter diameter
                    const xDifference = x - point[0]
                    const yDifference = y - point[1]
                    if ((xDifference * xDifference) + (yDifference * yDifference) < (pointRadius * pointRadius)) {
                        const index = (y * (options.plotWidth - xOffset) + x) * 4
                        tempPNGFile.data[index] = color[0]
                        tempPNGFile.data[index + 1] = color[1]
                        tempPNGFile.data[index + 2] = color[2]
                        tempPNGFile.data[index + 3] = 255 // Alpha channel
                    }
                }
            }
        }
    }

    // If we're looking at cytof data, render histograms at the left and bottom of the graph
    if (FCSFile.machineType === constants.MACHINE_CYTOF) {
        PNGFile = new pngjs.PNG({ width: options.plotWidth, height: options.plotHeight })

        // Build a new image with the graph and histograms
        for (let i = 0; i < options.plotWidth * options.plotHeight * 4; i += 4) {
            // If we're in the bottom left xOffset * yOffset corner, render nothing
            if (i % (options.plotWidth * 4) <= xOffset * 4 && Math.floor((i) / (options.plotWidth * 4)) >= options.plotHeight - yOffset) {
                PNGFile.data[i] = 255
                PNGFile.data[i + 1] = 255
                PNGFile.data[i + 2] = 255
                PNGFile.data[i + 3] = 255 // Alpha channel
            }
            // If we're in the first `xOffset` pixels of a row, render the histogram for the X == 0 points
            else if (i % (options.plotWidth * 4) < xOffset * 4) {
                const xColour = heatMapRGBForValue(subPopulation.zeroDensityX.densityMap[Math.floor(i / (options.plotWidth * 4))] / subPopulation.maxDensity)
                PNGFile.data[i] = xColour[0]
                PNGFile.data[i + 1] = xColour[1]
                PNGFile.data[i + 2] = xColour[2]
                PNGFile.data[i + 3] = 255 // Alpha channel
            // If we're in the last `yOffset` rows, render the histogram
            } else if (Math.floor(i / (options.plotWidth * 4)) > options.plotHeight - yOffset) {
                const yColour = heatMapRGBForValue(subPopulation.zeroDensityY.densityMap[(i % (options.plotWidth * 4) / 4) - xOffset] / subPopulation.maxDensity)
                PNGFile.data[i] = yColour[0]
                PNGFile.data[i + 1] = yColour[1]
                PNGFile.data[i + 2] = yColour[2]
                PNGFile.data[i + 3] = 255 // Alpha channel
            // Otherwise just render the previously generated graph pixel
            } else {
                const extraIndices = (Math.floor(i / (options.plotWidth * 4)) + 1) * (xOffset * 4)
                PNGFile.data[i] = tempPNGFile.data[i - extraIndices]
                PNGFile.data[i + 1] = tempPNGFile.data[i - extraIndices + 1]
                PNGFile.data[i + 2] = tempPNGFile.data[i - extraIndices + 2]
                PNGFile.data[i + 3] = tempPNGFile.data[i - extraIndices + 3]
            }
        }
    } else {
        PNGFile = tempPNGFile
    }

    const directory = path.join(options.directory, 'sample-images', sample.id)
    const sampleKey = getPlotImageKey(_.merge(options, FCSFile))
    const fileName = `${directory}/${sampleKey}.png`
    await mkdirpPromise(directory)
    return await packPNGFile(PNGFile, fileName)
}