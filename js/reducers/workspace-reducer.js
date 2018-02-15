// -------------------------------------------------------------
// A redux reducer for CRUD operations involving workspaces.
// -------------------------------------------------------------

import uuidv4 from 'uuid/v4'
import _ from 'lodash'

// Make sure there is at least one workspace
const initialState = [
    {
        id: uuidv4(),
        title: 'New Workspace',
        description: 'Empty Workspace',
        sampleIds: []
    }
]

const workspaces = (state = initialState, action = {}) => {
    let newState = state.slice(0)

    // --------------------------------------------------
    // Create a new workspace
    // --------------------------------------------------
    if (action.type === 'CREATE_WORKSPACE') {
        newState.push(action.payload.workspace)
    // --------------------------------------------------
    // Remove a workspace from the state
    // --------------------------------------------------
    } else if (action.type === 'REMOVE_WORKSPACE') {
        const workspaceIndex = _.findIndex(state, w => w.id === action.payload.id)
        if (workspaceIndex > -1) {
            newState = newState.slice(0, workspaceIndex).concat(newState.slice(workspaceIndex + 1))
        } else {
            console.log('REMOVE_WORKSPACE failed: no workspace with id', action.payload.id, 'was found')
        }
    // --------------------------------------------------
    // Add an existing sample to a workspace
    // --------------------------------------------------
    } else if (action.type === 'ADD_SAMPLE_TO_WORKSPACE') {
        const workspaceIndex = _.findIndex(state, w => w.id === action.payload.workspaceId)

        if (workspaceIndex > -1) {
            const newWorkspace = _.clone(state[workspaceIndex])
            newWorkspace.sampleIds = state[workspaceIndex].sampleIds.slice(0)
            if (!newWorkspace.sampleIds.includes(action.payload.sampleId)) {
                newWorkspace.sampleIds.push(action.payload.sampleId)

                newState = newState.slice(0, workspaceIndex).concat([ newWorkspace ]).concat(newState.slice(workspaceIndex + 1))
            }
        } else {
            console.log('ADD_SAMPLE_TO_WORKSPACE failed: no workspace with id', action.payload.workspaceId, 'was found')
        }
    // --------------------------------------------------
    // Select a sample that is already within a workspace
    // --------------------------------------------------
    } else if (action.type === 'SELECT_SAMPLE') {
        const workspaceIndex = _.findIndex(state, w => w.id === action.payload.workspaceId)

        if (workspaceIndex > -1) {
            const newWorkspace = _.clone(state[workspaceIndex])
            newWorkspace.sampleIds = state[workspaceIndex].sampleIds.slice(0)
            if (newWorkspace.sampleIds.includes(action.payload.sampleId)) {
                newWorkspace.selectedSampleId = action.payload.sampleId
                newState[workspaceIndex] = newWorkspace
            } else {
                console.log('SELECT_SAMPLE failed: no sample with id', action.payload.sampleId, 'was found in sampleIds of workspace with id', action.payload.workspaceId)       
            }
        } else {
            console.log('SELECT_SAMPLE failed: no workspace with id', action.payload.workspaceId, 'was found')
        }
    // --------------------------------------------------
    // Removes a sample from it's workspace
    // --------------------------------------------------
    } else if (action.type === 'REMOVE_SAMPLE') {
        const workspaceIndex = _.findIndex(state, w => w.sampleIds.includes(action.payload.sampleId))

        if (workspaceIndex > -1) {
            const newWorkspace = _.clone(state[workspaceIndex])
            newWorkspace.sampleIds = state[workspaceIndex].sampleIds.slice(0)

            const sampleIdIndex = _.findIndex(state[workspaceIndex].sampleIds, s => s === action.payload.sampleId)
            if (sampleIdIndex > -1) {
                newWorkspace.sampleIds = newWorkspace.sampleIds.slice(0, sampleIdIndex).concat(newWorkspace.sampleIds.slice(sampleIdIndex + 1))

                newState = newState.slice(0, workspaceIndex).concat([ newWorkspace ]).concat(newState.slice(workspaceIndex + 1))
            }
        } else {
            console.log('REMOVE_SAMPLE failed: no workspace with id', action.payload.workspaceId, 'was found')
        }
    }

    return newState
}

export default workspaces