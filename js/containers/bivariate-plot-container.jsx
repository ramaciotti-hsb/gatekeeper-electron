// -------------------------------------------------------------
// A react-redux container for bivariate-plot-component.jsx.
// -------------------------------------------------------------

import { connect } from 'react-redux'
import { createSubSampleAndAddToWorkspace } from '../actions/workspace-actions'
import BivariatePlot from '../components/sample-components/bivariate-plot-component.jsx'
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
        // Find the workspace that this sample is inside
        const workspace = _.find(state.workspaces, w => w.sampleIds.includes(ownProps.sampleId))

        // Find any gates on this plot
        const gates = []
        for (let gate of state.gates) {
            if (gate.parentSampleId === ownProps.sampleId
                && gate.selectedXParameterIndex === sample.selectedXParameterIndex
                && gate.selectedYParameterIndex === sample.selectedYParameterIndex) {
                gates.push(gate)
            }
        }

        // Find the parent sample if there is one
        const parent = _.find(state.samples, s => s.subSampleIds.includes(ownProps.sampleId))
        if (parent) {
            newSample.parentTitle = parent.title
        }

        return { api: state.api, workspaceId: workspace.id, sample: newSample, gates }
    } else {
        return { api: state.api, sample: { subSamples: [] }, gates: [] }
    }
}

const mapDispatchToProps = dispatch => {
    return {}
}

const BivariatePlotWrapped = connect(
    mapStateToProps,
    mapDispatchToProps
)(BivariatePlot)

export default BivariatePlotWrapped