// -------------------------------------------------------------------------
// Generates a PNG for a plot with options and saves it to the disk.
// -------------------------------------------------------------------------

import constants from '../../gatekeeper-utilities/constants'
import fs from 'fs'
import FCS from 'fcs'
import _ from 'lodash'
import path from 'path'
import { getScales, getMetadataFromFCSFileText, getMetadataFromCSVFileHeader } from '../../gatekeeper-utilities/utilities'

const readFileBuffer = (path) => {
    return new Promise((res, rej) => {
        fs.readFile(path, (err, buffer) => {
            if (err) rej(err)
            else res(buffer)
        })
    })
}

const readFile = (path, opts = 'utf8') => {
    return new Promise((res, rej) => {
        fs.readFile(path, opts, (err, data) => {
            if (err) rej(err)
            else res(data)
        })
    })
}

const FCSFileCache = {}
const CSVFileCache = {}

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

export default async function getFCSMetadata (workspaceId, FCSFileId, fileName) {
    const assetDirectory = process.argv[2]
    const FCSfilePath = path.join(assetDirectory, 'workspaces', workspaceId, FCSFileId, FCSFileId + '.fcs')
    const CSVfilePath = path.join(assetDirectory, 'workspaces', workspaceId, FCSFileId, FCSFileId + '.csv')
    let machineType
    let populationCount
    let fileData
    let parameters
    let isCSV
    // If we can't find an FCS file with this id, try a CSV file
    try {
        const FCSFile = await getFCSFileFromPath(FCSfilePath)
        machineType = FCSFile.text['$CYT'] && FCSFile.text['$CYT'].match(/CYTOF/) ? constants.MACHINE_CYTOF : constants.MACHINE_FLORESCENT
        populationCount = parseInt(FCSFile.text['$TOT'], 10)
        fileData = FCSFile.dataAsNumbers
        parameters = getMetadataFromFCSFileText(FCSFile.text)
    } catch (error) {
        try {
            const CSVFile = await getCSVFileFromPath(CSVfilePath)
            machineType = constants.MACHINE_CYTOF
            populationCount = CSVFile.data.length
            fileData = CSVFile.data
            parameters = CSVFile.headers
            isCSV = true
        } catch (error2) {
            console.log(error2.message, error2.stack)
            return
        }
    }

    const parametersByKey = {}
    for (let parameter of parameters) {
        parametersByKey[parameter.key] = parameter
    }

    // Loop through the parameters and get the min and max values of all the data points
    for (let i = 0; i < fileData.length; i++) {
        for (let j = 0; j < fileData[i].length; j++) {
            if (isCSV) {
                fileData[i][j] = parseFloat(fileData[i][j], 10)
            }
            const parameter = _.find(parameters, p => p.index === j)
            if (fileData[i][j] < parameter.statistics.min) {
                parameter.statistics.min = fileData[i][j]
            }

            if (fileData[i][j] < parameter.statistics.positiveMin && fileData[i][j] > 0) {
                parameter.statistics.positiveMin = Math.max(fileData[i][j], 0.01)
            }

            if (fileData[i][j] > parameter.statistics.max) {
                parameter.statistics.max = fileData[i][j]
            }

            // If we're looking at Cytof data, exclude zero values from mean calculation (they aren't useful)
            if (fileData[i][j] > 0) {
                parameter.statistics.mean += fileData[i][j] / fileData.length
            }
        }
    }

    return {
        FCSParameters: parametersByKey,
        populationCount,
        machineType
    }
}