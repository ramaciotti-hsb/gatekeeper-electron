// -------------------------------------------------------------
// Redux actions for interacting with samples.
// -------------------------------------------------------------

import uuidv4 from 'uuid/v4'

export const sampleLoadingFinished = (sampleId, FCSFile) => {
    return {
        type: 'SAMPLE_LOADING_FINISHED',
        payload: { sampleId, FCSFile }
    }
}

// This event is also picked up by the workspace reducer
export const removeSample = (sampleId, workspaceId) => {
    return {
        type: 'REMOVE_SAMPLE',
        payload: { sampleId, workspaceId }
    }
}