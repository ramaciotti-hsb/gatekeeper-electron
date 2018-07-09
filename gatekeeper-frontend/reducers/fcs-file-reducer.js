// -------------------------------------------------------------
// A redux reducer for CRUD operations involving FCS files.
// -------------------------------------------------------------

import _ from 'lodash'

const FCSFiles = (state = [], action = {}) => {
    let newState = state.slice(0)
    // console.log(action)

    // --------------------------------------------------
    // Create a new sample and add to state
    // --------------------------------------------------
    if (action.type === 'CREATE_FCS_FILE') {
        const newFCSFile = {
            id: action.payload.id,
            title: action.payload.title,
            description: action.payload.description,
            machineType: action.payload.machineType,
            filePath: action.payload.filePath,
            FCSParameters: action.payload.FCSParameters || [],
            statistics: action.payload.statistics || {}
        }

        newState.push(newFCSFile)
    // --------------------------------------------------
    // Remove an FCS File
    // --------------------------------------------------
    } else if (action.type === 'REMOVE_FCS_FILE') {
        const FCSFile = _.find(newState, fcs => fcs.id === action.payload.FCSFileId)

        if (FCSFile) {
            const FCSFileIndex = _.findIndex(state, fcs => fcs.id === FCSFile.id)
            newState = newState.slice(0, FCSFileIndex).concat(newState.slice(FCSFileIndex + 1))
        } else {
            console.log('REMOVE_FCS_FILE failed: no fcs file with id', action.payload.FCSFileId, 'was found')
        }
    // --------------------------------------------------
    // Update an arbitrary parameters on an FCS File
    // --------------------------------------------------
    } else if (action.type === 'UPDATE_FCS_FILE') {
        const FCSFileIndex = _.findIndex(state, fcs => fcs.id === action.payload.FCSFileId)

        if (FCSFileIndex > -1) {
            const newFCSFile = _.merge(_.clone(state[FCSFileIndex]), action.payload.parameters)
            newState = state.slice(0, FCSFileIndex).concat([newFCSFile]).concat(state.slice(FCSFileIndex + 1))
        } else {
            console.log('UPDATE_FCS_FILE failed: no fcs file with id', action.payload.sampleId, 'was found')
        }
    }

    return newState
}

export default FCSFiles