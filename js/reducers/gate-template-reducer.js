// -------------------------------------------------------------
// A redux reducer for CRUD operations involving gate templates.
// -------------------------------------------------------------

import _ from 'lodash'
import uuidv4 from 'uuid/v4'

const initialState = [
    {
        id: uuidv4(),
        title: 'New Template'
    }
]

const gateTemplates = (state = initialState, action = {}) => {
    let newState = state.slice(0)

    // --------------------------------------------------
    // Create a new gate and add to state
    // --------------------------------------------------
    if (action.type === 'CREATE_GATE_TEMPLATE') {
        const newGateTemplate = {
            id: action.payload.gateTemplate.id,
            title: action.payload.gateTemplate.title,
            type: action.payload.gateTemplate.type,
            childGateTemplateIds: action.payload.gateTemplate.childGateTemplateIds,
            selectedXParameterIndex: action.payload.gateTemplate.selectedXParameterIndex,
            selectedYParameterIndex: action.payload.gateTemplate.selectedYParameterIndex,
            selectedXScale: action.payload.gateTemplate.selectedXScale,
            selectedYScale: action.payload.gateTemplate.selectedYScale,
            expectedGates: action.payload.gateTemplate.expectedGates,
            typeSpecificData: action.payload.gateTemplate.typeSpecificData
        }

        newState.push(newGateTemplate)
    }

    return newState
}

export default gateTemplates