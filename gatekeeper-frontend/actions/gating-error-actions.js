// -------------------------------------------------------------
// Redux actions for interacting with gating errors
// -------------------------------------------------------------

import uuidv4 from 'uuid/v4'

// Create a new gating error
export const createGatingError = (parameters) => {
    if (!parameters.id) { parameters.id = uuidv4() }
    return {
        type: 'CREATE_GATING_ERROR',
        payload: { gatingError: parameters }
    }
}

// Remove a gating error
export const removeGatingError = (gatingErrorId) => {
    return {
        type: 'REMOVE_GATING_ERROR',
        payload: { gatingErrorId }
    }
}

// Update an arbitrary property on a gating error
export const updateGatingError = (gatingErrorId, parameters) => {
    return {
        type: 'UPDATE_GATING_ERROR',
        payload: { gatingErrorId, parameters }
    }
}