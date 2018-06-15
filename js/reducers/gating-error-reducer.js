// -------------------------------------------------------------
// A redux reducer for CRUD operations involving gate templates.
// -------------------------------------------------------------

import _ from 'lodash'
import uuidv4 from 'uuid/v4'

const initialState = []

const gatingErrors = (state = initialState, action = {}) => {
    let newState = state.slice(0)

    // --------------------------------------------------
    // Create a new gate and add to state
    // --------------------------------------------------
    if (action.type === 'CREATE_GATING_ERROR') {
        const newGatingError = {
            id: action.payload.gatingError.id,
            gateTemplateGroupId: action.payload.gatingError.gateTemplateGroupId,
            sampleId: action.payload.gatingError.sampleId,
            gates: action.payload.gatingError.gates,
            criteria: action.payload.gatingError.criteria
        }

        newState.push(newGatingError)
    // --------------------------------------------------
    // Remove a gating error
    // --------------------------------------------------
    } else if (action.type === 'REMOVE_GATING_ERROR') {
        const gatingError = _.find(state, s => s.id === action.payload.gatingErrorId)

        if (gatingError) {
            const gatingErrorIndex = _.findIndex(state, s => s.id === gatingError.id)
            newState = newState.slice(0, gatingErrorIndex).concat(newState.slice(gatingErrorIndex + 1))
        } else {
            console.log('REMOVE_GATING_ERROR failed: no gatingError with id', action.payload.gatingErrorId, 'was found')
        }
    }

    return newState
}

export default gatingErrors