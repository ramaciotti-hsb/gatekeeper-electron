// -------------------------------------------------------------
// Redux actions for interacting with samples.
// -------------------------------------------------------------

import uuidv4 from 'uuid/v4'

let nextTodoId = 0
export const createSample = parameters => {
    return {
        type: 'CREATE_SAMPLE',
        payload: parameters
    }
}

// This event is also picked up by the workspace reducer
export const removeSample = (sampleId, workspaceId) => {
    return {
        type: 'REMOVE_SAMPLE',
        payload: { sampleId, workspaceId }
    }
}