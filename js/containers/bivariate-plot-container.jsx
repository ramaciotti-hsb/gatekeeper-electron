// -------------------------------------------------------------
// A react-redux container for bivariate-plot-component.jsx.
// -------------------------------------------------------------

import { connect } from 'react-redux'
import { createSubSampleAndAddToWorkspace } from '../actions/workspace-actions'
import { updateGateTemplate } from '../actions/gate-template-actions'
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
            let selectedXParameterIndex = !_.isUndefined(ownProps.selectedXParameterIndex) ? ownProps.selectedXParameterIndex : workspace.selectedXParameterIndex
            let selectedYParameterIndex = !_.isUndefined(ownProps.selectedYParameterIndex) ? ownProps.selectedYParameterIndex : workspace.selectedYParameterIndex
            if (gate.parentSampleId === ownProps.sampleId
                && gate.selectedXParameterIndex === selectedXParameterIndex
                && gate.selectedYParameterIndex === selectedYParameterIndex) {
                gates.push(gate)
            }
        }

        // Find gate templates that gates refer to
        const gateTemplates = gates.map(g => _.find(state.gateTemplates, gt => g.gateTemplateId === gt.id))
        // Find gate template groups that templates are in
        const gateTemplateGroups = gateTemplates.map(gt => _.find(state.gateTemplateGroups, g => g.childGateTemplateIds.includes(gt.id)))

        // Find the parent sample if there is one
        const parent = _.find(state.samples, s => s.subSampleIds.includes(ownProps.sampleId))
        if (parent) {
            newSample.parentTitle = parent.title
        }

        return { api: state.api, workspace: workspace, sample: newSample, gates, gateTemplates, gateTemplateGroups }
    } else {
        return { api: state.api, sample: { subSamples: [] }, gates: [], gateTemplates: [] }
    }
}

const mapDispatchToProps = dispatch => {
    return {
        updateGateTemplate: (gateTemplateId, parameters) => {
            dispatch(updateGateTemplate(gateTemplateId, parameters))
        }
    }
}

const BivariatePlotWrapped = connect(
    mapStateToProps,
    mapDispatchToProps
)(BivariatePlot)

export default BivariatePlotWrapped