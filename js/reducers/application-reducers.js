import { combineReducers } from 'redux'
import sampleReducer from './sample-reducer'
import workspaceReducer from './workspace-reducer'
import _ from 'lodash'
import path from 'path'
import { remote } from 'electron'
import fs from 'fs'

let initialState = {
    samples: sampleReducer(),
    workspaces: workspaceReducer(),
    selectedWorkspaceId: null
}

// Load the workspaces and samples the user last had open when the app was used
const sessionFilePath = path.join(remote.app.getPath('userData'), 'session2.json')
try {
    const session = JSON.parse(fs.readFileSync(sessionFilePath))
    initialState = session
} catch (error) {
    // If there's no session file, create one
    if (error.code === 'ENOENT') {
        fs.writeFile(sessionFilePath, JSON.stringify(initialState), () => {})
    } else {
        console.log(error)
    }
}

const applicationReducers = (state = initialState, action) => {
    const newState = {
        samples: state.samples.slice(0),
        workspaces: state.workspaces.slice(0),
        selectedWorkspaceId: state.selectedWorkspaceId
    }

    // --------------------------------------------------
    // Create a new workspace and select it
    // --------------------------------------------------
    if (action.type === 'CREATE_WORKSPACE') {
        // Workspaces are always selected after creating them
        newState.workspaces = workspaceReducer(newState.workspaces, { TYPE: 'CREATE_WORKSPACE', payload: action.payload })
        newState.selectedWorkspaceId = action.payload.id
    // --------------------------------------------------
    // Select an existing workspace
    // --------------------------------------------------
    } else if (action.type === 'SELECT_WORKSPACE') {
        newState.selectedWorkspaceId = action.payload.id
    // --------------------------------------------------
    // Create a sample and add it to a particular workspace
    // --------------------------------------------------
    } else if (action.type === 'CREATE_SAMPLE_AND_ADD_TO_WORKSPACE') {
        // Find the workspace the user wants to add to
        const workspace = _.find(state.workspaces, w => w.id === action.payload.workspaceId)
        if (workspace) {
            // Create a new sample with the sample reducer
            newState.samples = sampleReducer(newState.samples, { type: 'CREATE_SAMPLE', payload: action.payload.sample })
            newState.workspaces = workspaceReducer(newState.workspaces, { type: 'ADD_SAMPLE_TO_WORKSPACE', payload: { workspaceId: workspace.id, sampleId: action.payload.sample.id } })
            newState.workspaces = workspaceReducer(newState.workspaces, { type: 'SELECT_SAMPLE', payload: { workspaceId: workspace.id, sampleId: action.payload.sample.id } })
        }
    // --------------------------------------------------
    // Remove a workspace and all the samples in it
    // --------------------------------------------------
    } else if (action.type === 'REMOVE_WORKSPACE') {
        // Find all samples related to the workspace being removed
        const workspace = _.find(state.workspaces, w => w.id === action.payload.id)
        const samplesToRemove = workspace.sampleIds
        for (let sample of state.samples) {
            newState.samples = sampleReducer(newState.samples, { type: 'REMOVE_SAMPLE', payload: { id: sample.id } })
        }

        newState.workspaces = workspaceReducer(newState.workspaces, action)
    // --------------------------------------------------
    // Remove a sample, any subsamples and unselect if selected
    // --------------------------------------------------
    } else if (action.type === 'REMOVE_SAMPLE') {
        // If the sample being deleted is currently selected, select a different sample instead
        const workspaceIndex = _.findIndex(state.workspaces, w => w.id === action.payload.workspaceId)

        if (workspaceIndex > -1) {
            const newWorkspace = _.clone(state.workspaces[workspaceIndex])
            newWorkspace.sampleIds = newWorkspace.sampleIds.slice(0)

            if (newWorkspace.selectedSampleId === action.payload.sampleId) {
                const selectedSampleIndex = _.findIndex(newWorkspace.sampleIds, s => s === action.payload.sampleId)
                if (selectedSampleIndex > -1) {

                    // Select another sample if there is one available to select, otherwise do nothing
                    if (newWorkspace.sampleIds.length > 1) {

                        if (selectedSampleIndex < newWorkspace.sampleIds.length - 1) {
                            newWorkspace.selectedSampleId = newWorkspace.sampleIds[Math.min(Math.max(selectedSampleIndex + 1, 0), newWorkspace.sampleIds.length - 1)]
                        } else {
                            newWorkspace.selectedSampleId = newWorkspace.sampleIds[newWorkspace.sampleIds.length - 2]
                        }
                    } else {
                        newWorkspace.selectedSampleId = null
                    }

                    newState.workspaces = newState.workspaces.slice(0, workspaceIndex).concat([ newWorkspace ]).concat(newState.workspaces.slice(workspaceIndex + 1))
                } else {
                    console.log('REMOVE_SAMPLE failed: no sample with id', action.payload.sampleId, 'was found in sampleIds of workspace with id', action.payload.workspaceId)       
                }
            }

            newState.workspaces = workspaceReducer(newState.workspaces, action)
            newState.samples = sampleReducer(newState.samples, action)
        } else {
            console.log('REMOVE_SAMPLE failed: no workspace with id', action.payload.workspaceId, 'was found')
        }
    // --------------------------------------------------
    // Pass on any unmatched actions to workspaceReducer and
    // sampleReducer
    // --------------------------------------------------
    } else {
        newState.workspaces = workspaceReducer(newState.workspaces, action)
        newState.samples = sampleReducer(newState.samples, action)
    }

    // Save the new state to the disk
    const sessionFilePath = path.join(remote.app.getPath('userData'), 'session2.json')
    fs.writeFile(sessionFilePath, JSON.stringify(newState, null, 4), () => {})

    return newState
}

export default applicationReducers