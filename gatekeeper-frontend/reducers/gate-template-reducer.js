// -------------------------------------------------------------
// A redux reducer for CRUD operations involving gate templates.
// -------------------------------------------------------------

import _ from 'lodash'
import uuidv4 from 'uuid/v4'

const initialState = []

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
            creator: action.payload.gateTemplate.creator,
            exampleGateId: action.payload.gateTemplate.exampleGateId,
            xGroup: action.payload.gateTemplate.xGroup,
            yGroup: action.payload.gateTemplate.yGroup,
            typeSpecificData: action.payload.gateTemplate.typeSpecificData
        }

        newState.push(newGateTemplate)
    }
    // --------------------------------------------------
    // Update a parameter on a gate template
    // --------------------------------------------------
    else if (action.type === 'UPDATE_GATE_TEMPLATE') {
        const gateTemplateIndex = _.findIndex(state, g => g.id === action.payload.gateTemplateId)
        if (gateTemplateIndex > -1) {
            let newGateTemplate = _.merge(_.cloneDeep(newState[gateTemplateIndex]), action.payload.parameters)
            newState = newState.slice(0, gateTemplateIndex).concat([ newGateTemplate ]).concat(newState.slice(gateTemplateIndex + 1))         
        } else {
            console.log('HIGHLIGHT_GATE_TEMPLATE failed: no gateTemplate with id', action.payload.gateTemplateId, 'was found')
        }
    // --------------------------------------------------
    // Remove a gate template
    // --------------------------------------------------
    } else if (action.type === 'REMOVE_GATE_TEMPLATE') {
        const gateTemplate = _.find(state, s => s.id === action.payload.gateTemplateId)

        if (gateTemplate) {
            const gateTemplateIndex = _.findIndex(state, s => s.id === gateTemplate.id)
            newState = newState.slice(0, gateTemplateIndex).concat(newState.slice(gateTemplateIndex + 1))
        } else {
            console.log('REMOVE_GATE_TEMPLATE failed: no gateTemplate with id', action.payload.gateTemplateId, 'was found')
        }
    }


    return newState
}

export default gateTemplates