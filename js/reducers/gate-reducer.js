// -------------------------------------------------------------
// A redux reducer for CRUD operations involving gates.
// -------------------------------------------------------------

import _ from 'lodash'

const gates = (state = [], action = {}) => {
    let newState = state.slice(0)

    // --------------------------------------------------
    // Create a new gate and add to state
    // --------------------------------------------------
    if (action.type === 'CREATE_GATE') {
        console.log(action.payload.gate)
        const newGate = {
            id: action.payload.gate.id,
            type: action.payload.gate.type,
            gateData: action.payload.gate.gateData,
            parentSampleId: action.payload.parentSampleId, // The parent population to gate on
            childSampleId: action.payload.childSampleId, // The resulting subpopulation after the gate
            selectedXParameterIndex: action.payload.gate.selectedXParameterIndex,
            selectedYParameterIndex: action.payload.gate.selectedYParameterIndex,
            selectedXScale: action.payload.gate.selectedXScale,
            selectedYScale: action.payload.gate.selectedYScale,
            gateCreator: action.payload.gate.gateCreator, // string constant for how this gate was created, e.g constants.GATE_CREATOR_MANUAL or constants.GATE_CREATOR_PERSISTENT_HOMOLOGY
            gateCreatorData: _.cloneDeep(action.payload.gate.gateCreatorData), // Additional information from / for the gate creator
            xCutoffs: action.payload.gate.xCutoffs,
            yCutoffs: action.payload.gate.yCutoffs
        }

        newState.push(newGate)
    }
    // --------------------------------------------------
    // Remove a gate
    // --------------------------------------------------
    else if (action.type === 'REMOVE_GATE') {
        const gateIndex = _.findIndex(state, g => g.id === action.payload.gateId)
        if (gateIndex > -1) {
            newState = newState.slice(0, gateIndex).concat(newState.slice(gateIndex + 1))            
        } else {
            console.log('REMOVE_GATE failed: no gate with id', action.payload.gateId, 'was found')
        }
    }
    // --------------------------------------------------
    // Update a parameter on a gate
    // --------------------------------------------------
    else if (action.type === 'UPDATE_GATE') {
        const gateIndex = _.findIndex(state, g => g.id === action.payload.gateId)
        if (gateIndex > -1) {
            let newGate = _.merge(_.cloneDeep(newState[gateIndex]), action.payload.parameters)
            newState = newState.slice(0, gateIndex).concat([ newGate ]).concat(newState.slice(gateIndex + 1))         
        } else {
            console.log('HIGHLIGHT_GATE failed: no gate with id', action.payload.gateId, 'was found')
        }
    }

    return newState
}

export default gates