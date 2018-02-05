// -------------------------------------------------------------
// A redux reducer for CRUD operations involving subsamples.
// Subsamples are fractions of a parent sample created using a
// 2d "gate" or some kind of clustering.
// -------------------------------------------------------------

import _ from 'lodash'

const samples = (state = [], action = {}) => {
    let newState = state.slice(0)

    // --------------------------------------------------
    // Create a new sample and add to state
    // --------------------------------------------------
    if (action.type === 'CREATE_SAMPLE') {
        const newSample = {
            id: action.payload.id,
            title: action.payload.title,
            description: action.payload.description,
            type: action.payload.type,
            gate: action.payload.gate,
            filePath: action.payload.filePath,
            selectedXParameterIndex: action.payload.selectedXParameterIndex,
            selectedYParameterIndex: action.payload.selectedYParameterIndex,
            selectedXScaleId: action.payload.selectedXScaleId,
            selectedYScaleId: action.payload.selectedYScaleId,
            subSampleIds: []
        }

        // Find the parent sample if there is one
        const parentSampleIndex = _.findIndex(state, s => s.id === action.payload.parentId)
        if (parentSampleIndex > -1) {
            const parentSample = state.slice(parentSampleIndex, parentSampleIndex + 1)
            parentSample.subSampleIds.push(newSample.id)
            newState = state.slice(0, parentSampleIndex).concat([parentSample]).concat(state.slice(parentSampleIndex + 1))
        }

        newState.push(newSample)
    // --------------------------------------------------
    // Remove a sample, all it's children and any references to it in it's parent
    // --------------------------------------------------
    } else if (action.type === 'REMOVE_SAMPLE') {
        // First, recursively remove all the children
        const removeElementAndChildren = function (sample) {
            if (sample.subSampleIds.length > 0) {
                for (let sample of sample.subSampleIds) {
                    removeElementAndChildren(sample)
                }
            }
            const sampleIndex = _.findIndex(state, s => s.id === sample.id)
            newState = newState.slice(0, sampleIndex).concat(newState.slice(sampleIndex + 1))
        }

        const sample = _.find(state, s => s.id === action.payload.sampleId)

        if (sample) {
            removeElementAndChildren(sample)

            // Then remove the id of the removed sample from the parents subSampleIds array if there is a parent
            const parentSampleIndex = _.findIndex(state, s => s.subSampleIds.includes(action.payload.sampleId))
            if (parentSampleIndex > -1) {
                const parentSample = state.slice(parentSampleIndex, parentSampleIndex + 1)
                const childIdIndex = _.findIndex(parentSample.subSampleIds, s => s === action.payload.sampleId)
                parentSample.subSampleIds = parentSample.subSampleIds.slice(0, childIdIndex).concat(parentSample.subSampleIds.slice(childIdIndex + 1))
                newState = newState.slice(0, parentSampleIndex).concat([parentSample]).concat(newState.slice(parentSampleIndex + 1))
            }
        } else {
            console.log('REMOVE_SAMPLE failed: no sample with id', action.payload.sampleId, 'was found')
        }
    }
    
    return newState
}

export default samples