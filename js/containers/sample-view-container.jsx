// -------------------------------------------------------------
// A react-redux container for sample-view-outer-component.jsx.
// -------------------------------------------------------------

import { connect } from 'react-redux'
import { updateGate } from '../actions/gate-actions'
import constants from '../lib/constants'
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
                if (sample) { newSample.subSamples.push(subSample) }
            }
            
            newSample.subSampleIds = null
        }
        // Find the workspace that this sample is inside
        const workspace = _.find(state.workspaces, w => w.sampleIds.includes(ownProps.sampleId))

        newSample.sampleId = newSample.id

        // Find any gates on this plot
        const gates = []
        for (let gate of state.gates) {
            if (gate.parentSampleId === ownProps.sampleId) {
                gates.push(gate)
            }
        }

        // Find the parent sample if there is one
        const parent = _.find(state.samples, s => s.subSampleIds.includes(ownProps.sampleId))
        if (parent) {
            newSample.parentTitle = parent.title
            newSample.parentId = parent.id
        }

        newSample.selectedMachineType = newSample.selectedMachineType || constants.MACHINE_FLORESCENT

        return { api: state.api, workspaceId: workspace.id, sample: newSample, gates }
    } else {
        return { api: state.api, sample: { subSamples: [] }, gates: [] }
    }
}

const mapDispatchToProps = dispatch => {
    return {
        updateGate: (gateId, parameters) => {
            dispatch(updateGate(gateId, parameters))
        }
    }
}

const SampleViewWrapped = connect(
    mapStateToProps,
    mapDispatchToProps
)(SampleView)

export default SampleViewWrapped