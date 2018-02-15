// -------------------------------------------------------------
// Redux actions for interacting with workspaces.
// -------------------------------------------------------------

import uuidv4 from 'uuid/v4'
import { sampleLoadingFinished } from './sample-actions.js'
import fs from 'fs'

export const selectWorkspace = id => {
    return {
        type: 'SELECT_WORKSPACE',
        payload: { id }
    }
}

export const createWorkspace = (workspace) => {
    return {
        type: 'CREATE_WORKSPACE',
        payload: { workspace }
    }
}

export const createSampleAndAddToWorkspace = (workspaceId, sampleParameters) => {
    return {
        type: 'CREATE_SAMPLE_AND_ADD_TO_WORKSPACE',
        payload: { workspaceId, sample: sampleParameters }
    }
}

// This event creates both a new sample and a new gate
export const createSubSampleAndAddToWorkspace = (workspaceId, parentSampleId, sampleParameters, gateParameters) => {
    return {
        type: 'CREATE_SUBSAMPLE_AND_ADD_TO_WORKSPACE',
        payload: { workspaceId, parentSampleId, sample: sampleParameters, gate: gateParameters }
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