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

export const updateWorkspace = (workspaceId, parameters) => {
    return {
        type: 'UPDATE_WORKSPACE',
        payload: { workspaceId, parameters }
    }
}

export const createGateTemplateAndAddToWorkspace = (workspaceId, gateTemplateParameters) => {
    return {
        type: 'CREATE_GATE_TEMPLATE_AND_ADD_TO_WORKSPACE',
        payload: { workspaceId, gateTemplate: gateTemplateParameters }
    }
}

// Selects a gate template within a workspace
export const selectGateTemplate = (gateTemplateId, workspaceId) => {
    return {
        type: 'SELECT_GATE_TEMPLATE',
        payload: { gateTemplateId, workspaceId }
    }
}

export const createGateTemplateGroupAndAddToWorkspace = (workspaceId, gateTemplateGroupParameters) => {
    return {
        type: 'CREATE_GATE_TEMPLATE_GROUP_AND_ADD_TO_WORKSPACE',
        payload: { workspaceId, gateTemplateGroup: gateTemplateGroupParameters }
    }
}


export const createFCSFileAndAddToWorkspace = (workspaceId, FCSFileParameters) => {
    return {
        type: 'CREATE_FCS_FILE_AND_ADD_TO_WORKSPACE',
        payload: { workspaceId, FCSFile: FCSFileParameters }
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

// Selects an FCS file within a workspace
export const selectFCSFile = (FCSFileId, workspaceId) => {
    return {
        type: 'SELECT_FCS_FILE',
        payload: { FCSFileId, workspaceId }
    }
}

// Selects a sample within a workspace
export const selectSample = (sampleId, workspaceId) => {
    return {
        type: 'SELECT_SAMPLE',
        payload: { sampleId, workspaceId }
    }
}

// Toggles parameter inversion (i.e. flip x and y axis) on a plot for display
export const invertPlotAxis = (workspaceId, selectedXParameterIndex, selectedYParameterIndex) => {
    return {
        type: 'INVERT_PLOT_AXIS',
        payload: { workspaceId, selectedXParameterIndex, selectedYParameterIndex }
    }
}

// Toggles FCS parameters between enabled / disabled
export const setFCSParametersDisabled = (workspaceId, parameters) => {
    return {
        type: 'SET_FCS_PARAMETERS_DISABLED',
        payload: { workspaceId, parameters }
    }
}