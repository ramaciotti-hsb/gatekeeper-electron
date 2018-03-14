// -------------------------------------------------------------
// A redux reducer for CRUD operations involving gate templates.
// -------------------------------------------------------------

import _ from 'lodash'
import uuidv4 from 'uuid/v4'

const initialState = [
    {
        id: uuidv4(),
        title: 'New Template Group'
    }
]

const gateTemplateGroups = (state = initialState, action = {}) => {
    let newState = state.slice(0)

    // --------------------------------------------------
    // Create a new gate and add to state
    // --------------------------------------------------
    if (action.type === 'CREATE_GATE_TEMPLATE_GROUP') {
        const newGateTemplateGroup = {
            id: action.payload.gateTemplateGroup.id,
            title: action.payload.gateTemplateGroup.title,
            creator: action.payload.gateTemplateGroup.creator,
            parentGateTemplateId: action.payload.gateTemplateGroup.parentGateTemplateId,
            childGateTemplateIds: action.payload.gateTemplateGroup.childGateTemplateIds,
            selectedXParameterIndex: action.payload.gateTemplateGroup.selectedXParameterIndex,
            selectedYParameterIndex: action.payload.gateTemplateGroup.selectedYParameterIndex,
            selectedXScale: action.payload.gateTemplateGroup.selectedXScale,
            selectedYScale: action.payload.gateTemplateGroup.selectedYScale,
            selectedMachineType: action.payload.gateTemplateGroup.selectedMachineType,
            typeSpecificData: action.payload.gateTemplateGroup.typeSpecificData
        }

        newState.push(newGateTemplateGroup)
    // --------------------------------------------------
    // Remove a gate template group
    // --------------------------------------------------
    } else if (action.type === 'REMOVE_GATE_TEMPLATE_GROUP') {
        const gateTemplateGroup = _.find(state, s => s.id === action.payload.gateTemplateGroupId)

        if (gateTemplateGroup) {
            const gateTemplateGroupIndex = _.findIndex(state, s => s.id === gateTemplateGroup.id)
            newState = newState.slice(0, gateTemplateGroupIndex).concat(newState.slice(gateTemplateGroupIndex + 1))
        } else {
            console.log('REMOVE_GATE_TEMPLATE_GROUP failed: no gateTemplateGroup with id', action.payload.gateTemplateGroupId, 'was found')
        }
    // --------------------------------------------------
    // Remove a gate template from it's group
    // --------------------------------------------------
    // --------------------------------------------------
    // Removes a gate template from it's group
    // --------------------------------------------------
    } else if (action.type === 'REMOVE_GATE_TEMPLATE_FROM_GROUP') {
        const gateTemplateGroupIndex = _.findIndex(state, w => w.id === action.payload.gateTemplateGroupId)

        if (gateTemplateGroupIndex > -1) {
            const newWorkspace = _.clone(state[gateTemplateGroupIndex])
            newWorkspace.childGateTemplateIds = state[gateTemplateGroupIndex].childGateTemplateIds.slice(0)

            const gateTemplateIdIndex = _.findIndex(state[gateTemplateGroupIndex].childGateTemplateIds, s => s === action.payload.gateTemplateId)
            if (gateTemplateIdIndex > -1) {
                newWorkspace.childGateTemplateIds = newWorkspace.childGateTemplateIds.slice(0, gateTemplateIdIndex).concat(newWorkspace.childGateTemplateIds.slice(gateTemplateIdIndex + 1))

                newState = newState.slice(0, gateTemplateGroupIndex).concat([ newWorkspace ]).concat(newState.slice(gateTemplateGroupIndex + 1))
            }
        } else {
            console.log('REMOVE_GATE_TEMPLATE_FROM_GROUP failed: no gateTemplateGroup with id', action.payload.gateTemplateGroupId, 'was found')
        }

    }

    return newState
}

export default gateTemplateGroups