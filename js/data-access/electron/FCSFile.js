// -------------------------------------------------------------
// A data access library for working with FCS Files in Electron
// (i.e. desktop environment)
// -------------------------------------------------------------

import FCS from 'fcs'
import fs from 'fs'


export const getFCSFileFromPath = (filePath) => {
    return new Promise((resolve, reject) => {
        // Read in the data from the FCS file, and emit another action when finished
        fs.readFile(filePath, (error, buffer) => {
            if (error) {
                console.log('Error reading FCS file: ', error)
                reject()
            } else {
                const FCSFile = new FCS({ dataFormat: 'asNumber', eventsToRead: -1 }, buffer)
                resolve(FCSFile)
            }
        })
    })
}