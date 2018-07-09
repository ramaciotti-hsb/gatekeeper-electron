// -------------------------------------------------------------
// Redux actions for interacting with samples.
// -------------------------------------------------------------

import uuidv4 from 'uuid/v4'

// This is also picked up by the application reducer
export const removeSample = (sampleId) => {
    return {
        type: 'REMOVE_SAMPLE',
        payload: { sampleId }
    }
}

export const setSamplePlotImage = (sampleId, imageKey, filePath) => {
    return {
        type: 'SET_SAMPLE_PLOT_IMAGE',
        payload: { sampleId, imageKey, filePath }
    }
}

// This is also picked up by the application reducer
export const updateSample = (sampleId, parameters) => {
    return {
        type: 'UPDATE_SAMPLE',
        payload: { sampleId, parameters }
    }
}

export const setSampleParametersLoading = (sampleId, key, value) => {
    return {
        type: 'SET_SAMPLE_PARAMETERS_LOADING',
        payload: { sampleId, key, value }
    }
}