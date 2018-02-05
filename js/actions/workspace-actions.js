// -------------------------------------------------------------
// Redux actions for interacting with workspaces.
// -------------------------------------------------------------

import uuidv4 from 'uuid/v4'
import { sampleLoadingFinished } from './sample-actions.js'
import fs from 'fs'
import FCSDataAccess from '../data-access/electron/FCSFile.js'

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

// Returns a thunk that will call sampleLoadingFinished when the FCS file has been loaded from the disk
export const createSampleAndAddToWorkspace = (workspaceId, sampleParameters) => {
    const newId = uuidv4()
    sampleParameters.id = newId
    return {
        type: 'CREATE_SAMPLE_AND_ADD_TO_WORKSPACE',
        payload: { workspaceId, sample: sampleParameters }
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