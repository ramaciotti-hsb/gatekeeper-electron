// -------------------------------------------------------------
// A react-redux container for sample-view-outer-component.jsx.
// -------------------------------------------------------------

import { connect } from 'react-redux'
import { createSample } from '../actions/sample-actions.js'
import SampleView from '../components/sample-components/sample-view-outer-component.jsx'
import _ from 'lodash'

const mapStateToProps = (state, ownProps) => {
    if (ownProps.sampleId) {
        // Find the selected sample
        const sample = _.find(state.samples, w => w.id === ownProps.sampleId) || {}
        const newSample = _.clone(sample)
        newSample.subSamples = []
        // If the workspace contains samples, find them and add them as complete objects
        if (newSample.subSampleIds) {
            for (let subSampleId of newSample.subSampleIds) {
                const subSample = _.find(state.samples, s => s.id === subSampleId)
                if (sample) { newSample.subSamples.push(sample) }
            }
            
            newSample.subSampleIds = null
        }

        return newSample
    } else {
        return { subSamples: [] }
    }
}

const mapDispatchToProps = dispatch => {
    return {
        // selectSample: (sampleId, workspaceId) => {
        //     dispatch(selectSample(sampleId, workspaceId))
        // },
    }
}

const SampleViewWrapped = connect(
    mapStateToProps,
    mapDispatchToProps
)(SampleView)

export default SampleViewWrapped