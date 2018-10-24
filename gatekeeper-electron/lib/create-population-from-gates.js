// -------------------------------------------------------------------------
// Creates a new population from gates + an FCS file and saves it to the disk
// -------------------------------------------------------------------------

import { getScales } from '../../gatekeeper-utilities/utilities'
import path from 'path'
import fs from 'fs'
import FCS from 'fcs'
import md5 from 'md5'
import mkdirp from 'mkdirp'
import pointInsidePolygon from 'point-in-polygon'
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
const CSVFileCache = {}

const unblock = async () => {
    new Promise((resolve, reject) => { _.defer(resolve) })
}

const getFCSFileFromPath = async (filePath) => {
    if (FCSFileCache[filePath]) {
        return {
            dataAsNumbers: FCSFileCache[filePath].dataAsNumbers.slice(0)
        }
    }
    // Read in the data from the FCS file, and emit another action when finished
    try {
        const buffer = await readFileBuffer(filePath)
        const FCSFile = new FCS({ dataFormat: 'asNumber', eventsToRead: -1 }, buffer)
        FCSFileCache[filePath] = FCSFile
        return {
            dataAsNumbers: FCSFileCache[filePath].dataAsNumbers.slice(0)
        }
    } catch (error) {
        console.log(error)
    }
}

const getCSVFileFromPath = async (filePath) => {
    if (CSVFileCache[filePath]) {
        return CSVFileCache[filePath]
    }
    // Read in the data from the CSV file, and emit another action when finished
    const file = await readFile(filePath)
    const CSVFile = file.split('\n').map(row => row.split(','))
    CSVFileCache[filePath] = {
        headers: getMetadataFromCSVFileHeader(CSVFile[0]),
        data: CSVFile.slice(1)
    }
    return CSVFileCache[filePath]
}

export default async function createPopulationFromGates (workspaceId, FCSFile, gates, options) {
    const assetDirectory = process.argv[2]
    const directory = path.join(assetDirectory, 'workspaces', workspaceId, FCSFile.id, 'other-samples', md5(gates.map(g => g.id).sort().join('-')))

    try {
        await readFile(path.join(directory, 'include-event-ids.json'))
        return
    } catch (error) {
        console.log("Generating population from gate")
    }

    let FCSFileData

    try  {
        FCSFileData = await getFCSFileFromPath(path.join(assetDirectory, 'workspaces', workspaceId, FCSFile.id, FCSFile.id + '.fcs'))
    } catch (error) {
        console.log(error)
        process.stderr.write(JSON.stringify(error))
        return
    }

    const CYTOF_HISTOGRAM_WIDTH = Math.round(Math.min(options.plotWidth, options.plotHeight) * 0.07)

    // Offset the entire graph and add histograms if we're looking at cytof data
    let xOffset = options.machineType === constants.MACHINE_CYTOF ? CYTOF_HISTOGRAM_WIDTH : 0
    let yOffset = options.machineType === constants.MACHINE_CYTOF ? CYTOF_HISTOGRAM_WIDTH : 0

    const polygonGates = gates.filter(g => g.type === constants.GATE_TYPE_POLYGON)

    for (let i = 0; i < FCSFileData.dataAsNumbers.length; i++) {
        let excluded = false
        for (let j = 0; j < polygonGates.length && !excluded; j++) {
            const gate = polygonGates[j]

            const scales = getScales({
                selectedXScale: gate.selectedXScale,
                selectedYScale: gate.selectedYScale,
                xRange: [ FCSFile.FCSParameters[gate.selectedXParameter].statistics.positiveMin, FCSFile.FCSParameters[gate.selectedXParameter].statistics.max ],
                yRange: [ FCSFile.FCSParameters[gate.selectedYParameter].statistics.positiveMin, FCSFile.FCSParameters[gate.selectedYParameter].statistics.max ],
                width: options.plotWidth - xOffset,
                height: options.plotHeight - yOffset
            })

            // Round polygons vertices to the nearest 0.01
            const invertedPolygon = gate.renderedPolygon.map(p => [ Math.round(scales.xScale.invert(p[0]) * 100) / 100, Math.round(scales.yScale.invert(p[1]) * 100) / 100 ])
            let invertedXCutoffs
            let invertedYCutoffs

            if (gate.gateCreatorData.includeXChannelZeroes) {
                invertedXCutoffs = [ Math.round(scales.yScale.invert(gate.renderedXCutoffs[1]) * 100) / 100, Math.round(scales.yScale.invert(gate.renderedXCutoffs[0]) * 100) / 100 ]
            }

            if (gate.gateCreatorData.includeYChannelZeroes) {
                invertedYCutoffs = [ Math.round(scales.xScale.invert(gate.renderedYCutoffs[0]) * 100) / 100, Math.round(scales.xScale.invert(gate.renderedYCutoffs[1]) * 100) / 100 ]
            }

            const point = [FCSFileData.dataAsNumbers[i][FCSFile.FCSParameters[gate.selectedXParameter].index], FCSFileData.dataAsNumbers[i][FCSFile.FCSParameters[gate.selectedYParameter].index]]
            // Double zeroes are vulnerable to logarithm minimum value problems, so if we're including double zeroes don't bother to measure them against cutoffs
            if (gate.gateCreatorData.includeXChannelZeroes && gate.gateCreatorData.includeYChannelZeroes && point[0] === 0 && point[1] === 0) {
                // excluded
            }
            else if (invertedXCutoffs && gate.gateCreatorData.includeXChannelZeroes && point[0] === 0 && point[1] >= invertedXCutoffs[0] && point[1] <= invertedXCutoffs[1]) {
                // excluded
            } else if (invertedYCutoffs && gate.gateCreatorData.includeYChannelZeroes && point[1] === 0 && point[0] >= invertedYCutoffs[0] && point[0] <= invertedYCutoffs[1]) {
                // excluded
            }
            else if (pointInsidePolygon(point, invertedPolygon)) {
                // excluded
            } else {
                excluded = true
            }
        }

        if (excluded) {
            FCSFileData.dataAsNumbers[i] = null
        }
    }

    const includeEventIds = []
    for (let i = 0; i < FCSFileData.dataAsNumbers.length; i++) {
        if (FCSFileData.dataAsNumbers[i]) {
            includeEventIds.push(i)
        }
    }

    await mkdirpPromise(directory)

    await new Promise((resolve, reject) => {
        fs.writeFile(path.join(directory, 'include-event-ids.json'), JSON.stringify(includeEventIds), (error) => {
            if (error) {
                reject()
            } else {
                resolve()
                console.log(path.join(directory, 'include-event-ids.json'))
            }
        })
    })
}