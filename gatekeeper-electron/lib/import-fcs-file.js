// -------------------------------------------------------------------------
// Copies an fcs file from the disk to the structured "application data" folder
// -------------------------------------------------------------------------

import constants from '../../gatekeeper-utilities/constants'
import mkdirp from 'mkdirp'
import path from 'path'
import fs from 'fs-extra'

const mkdirpPromise = (directory) => {
    return new Promise((resolve, reject) => {
        mkdirp(directory, function (error) {
            if (error) { console.error(error) && reject(error) }
            resolve()
        });
    })
}

export default async function importFCSFile (workspaceId, FCSFileId, filePath) {
    const assetDirectory = process.argv[2]
    await mkdirp(path.join(assetDirectory, workspaceId, FCSFileId))
    await fs.copy(filePath, path.join(assetDirectory, 'workspaces', workspaceId, FCSFileId, FCSFileId + '.fcs'))
}