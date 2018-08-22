// -------------------------------------------------------------------------
// Generates a PNG for a plot with options and saves it to the disk.
// -------------------------------------------------------------------------

import constants from '../../gatekeeper-utilities/constants'
import fs from 'fs'
import FCS from 'fcs'
import _ from 'lodash'
import path from 'path'
import { getScales } from '../../gatekeeper-utilities/utilities'

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

export default async function getFCSMetadata (workspaceId, FCSFileId, fileName) {
    const assetDirectory = process.argv[2]
    const filePath = path.join(assetDirectory, 'workspaces', workspaceId, FCSFileId, FCSFileId + '.fcs')
    let FCSFile
    try {
        FCSFile = await getFCSFileFromPath(filePath)        
    } catch (error) {
        process.stderr.write(JSON.stringify(error))
        return
    }

    const machineType = FCSFile.text['$CYT'] && FCSFile.text['$CYT'].match(/CYTOF/) ? constants.MACHINE_CYTOF : constants.MACHINE_FLORESCENT

    const populationCount = parseInt(FCSFile.text['$TOT'], 10)

    // Loop through the parameters and get the min and max values of all the data points
    const FCSParameters = []

    for (let key of _.keys(FCSFile.text)) {
        if ((key.match(/^\$P.+N$/) || key.match(/^\$P.+S$/)) &&
            !FCSParameters[parseInt(key.match(/\d+/)[0]) - 1]) {
            FCSParameters[parseInt(key.match(/\d+/)[0]) - 1] = {
                key: FCSFile.text[key],
                label: FCSFile.text[key],
                index: parseInt(key.match(/\d+/)[0]) - 1,
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

    const FCSParametersByKey = {}
    for (let parameter of FCSParameters) {
        FCSParametersByKey[parameter.key] = parameter
    }

    for (let i = 0; i < FCSFile.dataAsNumbers.length; i++) {
        for (let j = 0; j < FCSFile.dataAsNumbers[i].length; j++) {
            const parameter = _.find(FCSParameters, p => p.index === j)
            if (FCSFile.dataAsNumbers[i][j] < parameter.statistics.min) {
                parameter.statistics.min = FCSFile.dataAsNumbers[i][j]
            }

            if (FCSFile.dataAsNumbers[i][j] < parameter.statistics.positiveMin && FCSFile.dataAsNumbers[i][j] > 0) {
                parameter.statistics.positiveMin = Math.max(FCSFile.dataAsNumbers[i][j], 0.01)
            }

            if (FCSFile.dataAsNumbers[i][j] > parameter.statistics.max) {
                parameter.statistics.max = FCSFile.dataAsNumbers[i][j]
            }

            // If we're looking at Cytof data, exclude zero values from mean calculation (they aren't useful)
            if (FCSFile.dataAsNumbers[i][j] > 0) {
                parameter.statistics.mean += FCSFile.dataAsNumbers[i][j] / FCSFile.dataAsNumbers.length                
            }
        }
    }

    return {
        FCSParameters: FCSParametersByKey,
        populationCount,
        machineType
    }
}