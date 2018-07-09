// -------------------------------------------------------------
// A redux reducer for CRUD operations involving workspaces.
// -------------------------------------------------------------

import uuidv4 from 'uuid/v4'
import _ from 'lodash'
import constants from '../gatekeeper-utilities/constants'

const initialState = []

const workspaces = (state = initialState, action = {}) => {
    let newState = state.slice(0)

    // --------------------------------------------------
    // Create a new workspace
    // --------------------------------------------------
    if (action.type === 'CREATE_WORKSPACE') {
        newState.push(action.payload.workspace)
    // --------------------------------------------------
    // Remove a workspace from the state
    // --------------------------------------------------
    } else if (action.type === 'REMOVE_WORKSPACE') {
        const workspaceIndex = _.findIndex(state, w => w.id === action.payload.id)
        if (workspaceIndex > -1) {
            newState = newState.slice(0, workspaceIndex).concat(newState.slice(workspaceIndex + 1))
        } else {
            console.log('REMOVE_WORKSPACE failed: no workspace with id', action.payload.id, 'was found')
        }
    // --------------------------------------------------
    // Add an existing FCS file to a workspace
    // --------------------------------------------------
    } else if (action.type === 'ADD_FCS_FILE_TO_WORKSPACE') {
        const workspaceIndex = _.findIndex(state, w => w.id === action.payload.workspaceId)

        if (workspaceIndex > -1) {
            const newWorkspace = _.clone(state[workspaceIndex])
            newWorkspace.FCSFileIds = state[workspaceIndex].FCSFileIds.slice(0)
            if (!newWorkspace.FCSFileIds.includes(action.payload.FCSFileId)) {
                newWorkspace.FCSFileIds.push(action.payload.FCSFileId)

                newState = newState.slice(0, workspaceIndex).concat([ newWorkspace ]).concat(newState.slice(workspaceIndex + 1))
            }
        } else {
            console.log('ADD_FCS_FILE_TO_WORKSPACE failed: no workspace with id', action.payload.workspaceId, 'was found')
        }
    // --------------------------------------------------
    // Add an existing gate template to a workspace
    // --------------------------------------------------
    } else if (action.type === 'ADD_GATE_TEMPLATE_TO_WORKSPACE') {
        const workspaceIndex = _.findIndex(state, w => w.id === action.payload.workspaceId)

        if (workspaceIndex > -1) {
            const newWorkspace = _.clone(state[workspaceIndex])
            newWorkspace.gateTemplateIds = state[workspaceIndex].gateTemplateIds.slice(0)
            if (!newWorkspace.gateTemplateIds.includes(action.payload.gateTemplateId)) {
                newWorkspace.gateTemplateIds.push(action.payload.gateTemplateId)

                newState = newState.slice(0, workspaceIndex).concat([ newWorkspace ]).concat(newState.slice(workspaceIndex + 1))
            }
        } else {
            console.log('ADD_GATE_TEMPLATE_TO_WORKSPACE failed: no workspace with id', action.payload.workspaceId, 'was found')
        }
    // --------------------------------------------------
    // Add an existing gate template group to a workspace
    // --------------------------------------------------
    } else if (action.type === 'ADD_GATE_TEMPLATE_GROUP_TO_WORKSPACE') {
        const workspaceIndex = _.findIndex(state, w => w.id === action.payload.workspaceId)

        if (workspaceIndex > -1) {
            const newWorkspace = _.clone(state[workspaceIndex])
            newWorkspace.gateTemplateGroupIds = state[workspaceIndex].gateTemplateGroupIds.slice(0)
            if (!newWorkspace.gateTemplateGroupIds.includes(action.payload.gateTemplateGroupId)) {
                newWorkspace.gateTemplateGroupIds.push(action.payload.gateTemplateGroupId)

                newState = newState.slice(0, workspaceIndex).concat([ newWorkspace ]).concat(newState.slice(workspaceIndex + 1))
            }
        } else {
            console.log('ADD_GATE_TEMPLATE_TO_WORKSPACE failed: no workspace with id', action.payload.workspaceId, 'was found')
        }
    // --------------------------------------------------
    // Select a gate template that is already within a workspace
    // --------------------------------------------------
    } else if (action.type === 'SELECT_GATE_TEMPLATE') {
        const workspaceIndex = _.findIndex(state, w => w.id === action.payload.workspaceId)

        if (workspaceIndex > -1) {
            const newWorkspace = _.clone(state[workspaceIndex])
            newWorkspace.gateTemplateIds = state[workspaceIndex].gateTemplateIds.slice(0)
            if (newWorkspace.gateTemplateIds.includes(action.payload.gateTemplateId)) {
                newWorkspace.selectedGateTemplateId = action.payload.gateTemplateId
                newState[workspaceIndex] = newWorkspace
            } else {
                console.log('SELECT_GATE_TEMPLATE failed: no gateTemplate with id', action.payload.gateTemplateId, 'was found in gateTemplateIds of workspace with id', action.payload.workspaceId)       
            }
        } else {
            console.log('SELECT_GATE_TEMPLATE failed: no workspace with id', action.payload.workspaceId, 'was found')
        }
    // --------------------------------------------------
    // Add an existing sample to a workspace
    // --------------------------------------------------
    } else if (action.type === 'ADD_SAMPLE_TO_WORKSPACE') {
        const workspaceIndex = _.findIndex(state, w => w.id === action.payload.workspaceId)

        if (workspaceIndex > -1) {
            const newWorkspace = _.clone(state[workspaceIndex])
            newWorkspace.sampleIds = state[workspaceIndex].sampleIds.slice(0)
            if (!newWorkspace.sampleIds.includes(action.payload.sampleId)) {
                newWorkspace.sampleIds.push(action.payload.sampleId)

                newState = newState.slice(0, workspaceIndex).concat([ newWorkspace ]).concat(newState.slice(workspaceIndex + 1))
            }
        } else {
            console.log('ADD_SAMPLE_TO_WORKSPACE failed: no workspace with id', action.payload.workspaceId, 'was found')
        }
    // --------------------------------------------------
    // Select an FCS File that is already within a workspace
    // --------------------------------------------------
    } else if (action.type === 'SELECT_FCS_FILE') {
        console.log(action.type, action.payload)
        const workspaceIndex = _.findIndex(state, w => w.id === action.payload.workspaceId)

        if (workspaceIndex > -1) {
            const newWorkspace = _.clone(state[workspaceIndex])
            newWorkspace.FCSFileIds = state[workspaceIndex].FCSFileIds.slice(0)
            if (newWorkspace.FCSFileIds.includes(action.payload.FCSFileId)) {
                newWorkspace.selectedFCSFileId = action.payload.FCSFileId
                newState[workspaceIndex] = newWorkspace
            } else {
                console.log('SELECT_FCS_FILE failed: no FCS File with id', action.payload.FCSFileId, 'was found in FCSFileIds of workspace with id', action.payload.workspaceId)       
            }
        } else {
            console.log('SELECT_FCS_FILE failed: no workspace with id', action.payload.workspaceId, 'was found')
        }
    // --------------------------------------------------
    // Removes a gate template from it's workspace
    // --------------------------------------------------
    } else if (action.type === 'REMOVE_GATE_TEMPLATE') {
        const workspaceIndex = _.findIndex(state, w => w.gateTemplateIds.includes(action.payload.gateTemplateId))

        if (workspaceIndex > -1) {
            const newWorkspace = _.clone(state[workspaceIndex])
            newWorkspace.gateTemplateIds = state[workspaceIndex].gateTemplateIds.slice(0)

            const gateTemplateIdIndex = _.findIndex(state[workspaceIndex].gateTemplateIds, s => s === action.payload.gateTemplateId)
            if (gateTemplateIdIndex > -1) {
                newWorkspace.gateTemplateIds = newWorkspace.gateTemplateIds.slice(0, gateTemplateIdIndex).concat(newWorkspace.gateTemplateIds.slice(gateTemplateIdIndex + 1))

                newState = newState.slice(0, workspaceIndex).concat([ newWorkspace ]).concat(newState.slice(workspaceIndex + 1))
            }
        } else {
            console.log('REMOVE_GATE_TEMPLATE failed: no workspace with id', action.payload.workspaceId, 'was found')
        }
    // --------------------------------------------------
    // Removes a gate template group from it's workspace
    // --------------------------------------------------
    } else if (action.type === 'REMOVE_GATE_TEMPLATE_GROUP') {
        const workspaceIndex = _.findIndex(state, w => w.gateTemplateGroupIds.includes(action.payload.gateTemplateGroupId))

        if (workspaceIndex > -1) {
            const newWorkspace = _.clone(state[workspaceIndex])
            newWorkspace.gateTemplateGroupIds = state[workspaceIndex].gateTemplateGroupIds.slice(0)

            const gateTemplateGroupIdIndex = _.findIndex(state[workspaceIndex].gateTemplateGroupIds, s => s === action.payload.gateTemplateGroupId)
            if (gateTemplateGroupIdIndex > -1) {
                newWorkspace.gateTemplateGroupIds = newWorkspace.gateTemplateGroupIds.slice(0, gateTemplateGroupIdIndex).concat(newWorkspace.gateTemplateGroupIds.slice(gateTemplateGroupIdIndex + 1))

                newState = newState.slice(0, workspaceIndex).concat([ newWorkspace ]).concat(newState.slice(workspaceIndex + 1))
            }
        } else {
            console.log('REMOVE_GATE_TEMPLATE failed: no workspace with id', action.payload.workspaceId, 'was found')
        }
    // --------------------------------------------------
    // Removes a sample from it's workspace
    // --------------------------------------------------
    } else if (action.type === 'REMOVE_SAMPLE') {
        const workspaceIndex = _.findIndex(state, w => w.sampleIds.includes(action.payload.sampleId))

        if (workspaceIndex > -1) {
            const newWorkspace = _.clone(state[workspaceIndex])
            newWorkspace.sampleIds = state[workspaceIndex].sampleIds.slice(0)

            const sampleIdIndex = _.findIndex(state[workspaceIndex].sampleIds, s => s === action.payload.sampleId)
            if (sampleIdIndex > -1) {
                newWorkspace.sampleIds = newWorkspace.sampleIds.slice(0, sampleIdIndex).concat(newWorkspace.sampleIds.slice(sampleIdIndex + 1))

                newState = newState.slice(0, workspaceIndex).concat([ newWorkspace ]).concat(newState.slice(workspaceIndex + 1))
            }
        } else {
            console.log('REMOVE_SAMPLE failed: no workspace with id', action.payload.workspaceId, 'was found')
        }
    // --------------------------------------------------
    // Update an arbitrary parameters on a workspace
    // --------------------------------------------------
    } else if (action.type === 'UPDATE_WORKSPACE') {
        const workspaceIndex = _.findIndex(state, s => s.id === action.payload.workspaceId)

        if (workspaceIndex > -1) {
            const newWorkspace = _.merge(_.cloneDeep(state[workspaceIndex]), action.payload.parameters)
            newState = state.slice(0, workspaceIndex).concat([newWorkspace]).concat(state.slice(workspaceIndex + 1))
        }
    // --------------------------------------------------
    // Toggle parameter inversion for display (i.e flip x and y axis)
    // --------------------------------------------------
    } else if (action.type === 'INVERT_PLOT_AXIS') {
        const workspaceIndex = _.findIndex(state, s => s.id === action.payload.workspaceId)

        if (workspaceIndex > -1) {
            const newWorkspace = _.clone(state[workspaceIndex])
            newWorkspace.invertedAxisPlots = _.clone(state[workspaceIndex].invertedAxisPlots)
            const x = Math.min(action.payload.selectedXParameterIndex, action.payload.selectedYParameterIndex)
            const y = Math.max(action.payload.selectedXParameterIndex, action.payload.selectedYParameterIndex)

            if (!newWorkspace.invertedAxisPlots[`${x}_${y}`]) {
                newWorkspace.invertedAxisPlots[`${x}_${y}`] = true
            } else {
                newWorkspace.invertedAxisPlots[`${x}_${y}`] = false
            }
            newState = newState.slice(0, workspaceIndex).concat([ newWorkspace ]).concat(newState.slice(workspaceIndex + 1))
        }
    // --------------------------------------------------
    // Toggle FCS parameters betweeen enabled / disabled
    // --------------------------------------------------
    } else if (action.type === 'SET_FCS_PARAMETERS_DISABLED') {
        const workspaceIndex = _.findIndex(state, s => s.id === action.payload.workspaceId)

        if (workspaceIndex > -1) {
            const newWorkspace = _.clone(state[workspaceIndex])
            newWorkspace.disabledParameters = _.clone(state[workspaceIndex].disabledParameters)
            if (!newWorkspace.disabledParameters) {
                newWorkspace.disabledParameters = {}
            }
            newWorkspace.disabledParameters = _.merge(newWorkspace.disabledParameters, action.payload.parameters)
            newState = newState.slice(0, workspaceIndex).concat([ newWorkspace ]).concat(newState.slice(workspaceIndex + 1))
        }
    }

    return newState
}

export default workspaces