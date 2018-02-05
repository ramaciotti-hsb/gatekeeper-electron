// -------------------------------------------------------------
// Redux actions for interacting with workspaces.
// -------------------------------------------------------------

import uuidv4 from 'uuid/v4'

let nextTodoId = 0

export const selectWorkspace = id => {
    return {
        type: 'SELECT_WORKSPACE',
        payload: { id }
    }
}

export const createWorkspace = (parameters) => {
    parameters.id = uuidv4()
    return {
        type: 'CREATE_WORKSPACE',
        payload: parameters
    }
}

export const createSampleAndAddToWorkspace = (parameters) => {
    parameters.sample.id = uuidv4()
    return {
        type: 'CREATE_SAMPLE_AND_ADD_TO_WORKSPACE',
        payload: parameters
    }
}

export const removeWorkspace = (id) => {
    return {
        type: 'REMOVE_WORKSPACE',
        payload: { id }
    }
}

// Selects a sample within a workspace
export const selectSample = (sampleId, workspaceId) => {
    return {
        type: 'SELECT_SAMPLE',
        payload: { sampleId, workspaceId }
    }
}