// -------------------------------------------------------------
// A redux reducer for CRUD operations involving subsamples.
// Subsamples are fractions of a parent sample created using a
// 2d "gate" or some kind of clustering.
// -------------------------------------------------------------

import _ from 'lodash'
import { sampleLoadingFinished } from '../actions/sample-actions'

const samples = (state = [], action = {}) => {
    let newState = state.slice(0)
    console.log(action)

    // --------------------------------------------------
    // Create a new sample and add to state
    // --------------------------------------------------
    if (action.type === 'CREATE_SAMPLE') {
        const newSample = {
            id: action.payload.id,
            title: action.payload.title,
            description: action.payload.description,
            type: action.payload.type,
            filePath: action.payload.filePath,
            FCSParameters: action.payload.FCSParameters || [],
            statistics: action.payload.statistics || {},
            selectedMachineType: action.payload.selectedMachineType,
            selectedXParameterIndex: action.payload.selectedXParameterIndex,
            selectedYParameterIndex: action.payload.selectedYParameterIndex,
            selectedXScale: action.payload.selectedXScale,
            selectedYScale: action.payload.selectedYScale,
            subSampleIds: [],
            plotImages: action.payload.plotImages || {}
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
                const parentSample = state.slice(parentSampleIndex, parentSampleIndex + 1)[0]
                const childIdIndex = _.findIndex(parentSample.subSampleIds, s => s === action.payload.sampleId)
                parentSample.subSampleIds = parentSample.subSampleIds.slice(0, childIdIndex).concat(parentSample.subSampleIds.slice(childIdIndex + 1))
                newState = newState.slice(0, parentSampleIndex).concat([parentSample]).concat(newState.slice(parentSampleIndex + 1))
            }
        } else {
            console.log('REMOVE_SAMPLE failed: no sample with id', action.payload.sampleId, 'was found')
        }
    // --------------------------------------------------
    // Add a subsample id to the "child ids" array
    // --------------------------------------------------
    } else if (action.type === 'ADD_CHILD_SAMPLE') {
        // Find the target sample if there is one
        const sampleIndex = _.findIndex(state, s => s.id === action.payload.childSampleId)
        if (sampleIndex > -1) {
            // Find the parent sample if there is one
            const parentSampleIndex = _.findIndex(state, s => s.id === action.payload.parentSampleId)
            if (parentSampleIndex > -1) {
                const parentSample = _.cloneDeep(state[parentSampleIndex])
                parentSample.subSampleIds.push(action.payload.childSampleId)
                newState = state.slice(0, parentSampleIndex).concat([parentSample]).concat(state.slice(parentSampleIndex + 1))
            } else {
                console.log('ADD_CHILD_SAMPLE failed: no parent sample with id', action.payload.parentSampleId, 'was found')   
            }
        } else {
            console.log('ADD_CHILD_SAMPLE failed: no child sample with id', action.payload.parentSampleId, 'was found')   
        }
    // --------------------------------------------------
    // Set the url for a sample plot image
    // --------------------------------------------------
    } else if (action.type === 'SET_SAMPLE_PLOT_IMAGE') {
        // Find the target sample if there is one
        const sampleIndex = _.findIndex(state, s => s.id === action.payload.sampleId)
        if (sampleIndex > -1) {
            const newSample = _.clone(state[sampleIndex])
            newSample.plotImages = Object.assign({}, newSample.plotImages)
            newSample.plotImages[action.payload.imageKey] = action.payload.filePath
            newState = state.slice(0, sampleIndex).concat([newSample]).concat(state.slice(sampleIndex + 1))
        } else {
            console.log('SET_SAMPLE_PLOT_IMAGE failed: no sample with id', action.payload.sampleId, 'was found')   
        }
    // --------------------------------------------------
    // Update an arbitrary parameters on a sample
    // --------------------------------------------------
    } else if (action.type === 'UPDATE_SAMPLE') {
        const sampleIndex = _.findIndex(state, s => s.id === action.payload.sampleId)

        if (sampleIndex > -1) {
            const newSample = _.merge(_.clone(state[sampleIndex]), action.payload.parameters)
            newState = state.slice(0, sampleIndex).concat([newSample]).concat(state.slice(sampleIndex + 1))
        }
    }
    return newState
}

export default samples