// -------------------------------------------------------------
// A data access library for working with FCS Files in Electron
// (i.e. desktop environment)
// -------------------------------------------------------------

import FCS from 'fcs'
import fs from 'fs'
import _ from 'lodash'
import ndarray from 'ndarray'
import constants from '../../lib/constants'
import pngjs from 'pngjs'
import mkdirp from 'mkdirp'
import path from 'path'
import { remote } from 'electron'
import { heatMapRGBForValue } from '../../lib/utilities.js'
import Density from '../../lib/2d-density.js'
import { setSamplePlotImage } from '../../actions/sample-actions'
import { getPlotImageKey } from '../../lib/utilities'
import { api } from '../../electron/electron-backend.js'

const FCSFileCache = {}

export const connectors = {}

export const getFCSFileFromPath = (filePath) => {
    return new Promise((resolve, reject) => {
        if (FCSFileCache[filePath]) {
            return resolve(FCSFileCache[filePath])
        }
        // Read in the data from the FCS file, and emit another action when finished
        fs.readFile(filePath, (error, buffer) => {
            if (error) {
                console.log('Error reading FCS file: ', error)
                reject()
            } else {
                const FCSFile = new FCS({ dataFormat: 'asNumber', eventsToRead: -1 }, buffer)
                FCSFileCache[filePath] = FCSFile
                resolve(FCSFile)
            }
        })
    })
}

export const initializeSampleData = (sample) => {
    if (!sample.id) { return }

    return new Promise((resolve, reject) => {
        // Find the related sample
        getFCSFileFromPath(sample.filePath).then((FCSFile) => {
            resolve({
                FCSParameters: _.filter(_.keys(FCSFile.text), param => param.match(/^\$P.+N$/)).map(key => FCSFile.text[key])
            })
        })
    })
}

// Generates an image for a 2d scatter plot
export const getImageForPlot = (sample, width = 600, height = 460) => {
    const xRatio = width / 262000
    const xScale = (value) => {
        return xRatio * value
    }

    const yRatio = height / 262000
    const yScale = (value) => {
        return height - (yRatio * value)
    }

    return new Promise((resolve, reject) => {
        // Find the related sample
        const subPopulation = FCSFileCache[sample.filePath].dataAsNumbers
        // Find all the gates that are above this sample
        // for (let gate of state.gates) {
        //     if (gate.subSampleId === parameters.sampleId) {
        //         console.log('GATED')
        //     }
        // }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext("2d")
            
        const densityPoints = FCSFileCache[sample.filePath].dataAsNumbers.map(point => [Math.max(Math.min(xScale(point[sample.selectedXParameterIndex]), 262000), 0), Math.max(Math.min(yScale(point[sample.selectedYParameterIndex]), 262000), 0)])

        const densityMap = new Density(densityPoints)
        densityMap.calculateDensity()

        const data = []
        var newfile = new pngjs.PNG({ width: width, height: height });
        for (let i = 0; i < subPopulation.length; i++) {
            const xValue = Math.max(Math.min(Math.floor(xScale(subPopulation[i][sample.selectedXParameterIndex])), 262000), 0)
            const yValue = Math.max(Math.min(Math.floor(yScale(subPopulation[i][sample.selectedYParameterIndex])), 262000), 0)
            const index = (yValue * canvas.width + xValue) * 4
            const color = heatMapRGBForValue(Math.min((densityMap.getDensityMap()[yValue][xValue] / densityMap.getMaxDensity() * 1.5), 1))
            newfile.data[index] = color[0]
            newfile.data[index + 1] = color[1]
            newfile.data[index + 2] = color[2]
            newfile.data[index + 3] = 255
        }

        const directory = `/Users/nicbarker/Downloads/sample-images/${sample.id}`
        const sampleKey = getPlotImageKey(sample)
        const fileName = `${directory}/${sampleKey}.png`
        mkdirp(directory, function (err) {
            if (err) console.error(err)
            newfile.pack()
            .pipe(fs.createWriteStream(fileName))
            .on('finish', function() {
                resolve(fileName)
            });
        });
    })
}