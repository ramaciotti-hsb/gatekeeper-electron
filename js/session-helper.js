import fs from 'fs'
import path from 'path'
import _ from 'lodash'
import uuidv4 from 'uuid/v4'
import { remote } from 'electron'

class SessionHelper {

    constructor () {
        const newId = uuidv4()

        // The default state if there is no saved session or the saved session is empty
        this.state = {
            selectedWorkspaceId: newId,
            workspaces: [
                {
                    id: newId,
                    title: 'New Workspace',
                    samples: []
                }
            ]
        }
    }

    saveSessionStateToDisk () {
        if (!this.rootComponent) {
            console.log('Error: saveSessionState() was called without setting rootComponent.')
            return
        }
        const sessionFilePath = path.join(remote.app.getPath('userData'), 'session.json')
        fs.writeFile(sessionFilePath, JSON.stringify(this.rootComponent.getDataRepresentation(), null, 4), () => {})
    }

    readSessionStateFromDisk () {
        // Load the workspaces and samples the user last had open when the app was used
        const sessionFilePath = path.join(remote.app.getPath('userData'), 'session.json')
        try {
            const session = JSON.parse(fs.readFileSync(sessionFilePath))
            if (!session.workspaces) { return }
            this.state = _.merge(this.state, session)
        } catch (error) {
            // If there's no session file, create one
            if (error.code === 'ENOENT') {
                fs.writeFile(sessionFilePath, JSON.stringify(this.state), () => {})
            } else {
                console.log(error)
            }
        }
    }

    getSessionState () {
        return this.state
    }

    // Set the root component that the session helper uses to roll up the session state
    setRootComponent (rootComponent) {
        this.rootComponent = rootComponent
    }
}

const sessionHelper = new SessionHelper()
sessionHelper.readSessionStateFromDisk()

export default sessionHelper