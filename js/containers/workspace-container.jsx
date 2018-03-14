// -------------------------------------------------------------
// A react-redux container for workspace-component.jsx.
// -------------------------------------------------------------

import { connect } from 'react-redux'
import { createSample, removeSample } from '../actions/sample-actions.js'
import { selectSample } from '../actions/workspace-actions.js'
import { updateGateTemplate } from '../actions/gate-template-actions'
import WorkspaceView from '../components/workspace-component.jsx'
import _ from 'lodash'

const mapStateToProps = (state, ownProps) => {
    if (ownProps.workspaceId) {
        // Find the selected workspace
        const workspace = _.find(state.workspaces, w => w.id === ownProps.workspaceId) || {}
        const newWorkspace = _.clone(workspace)
        newWorkspace.samples = []
        // If the workspace contains samples, find them and add them as complete objects
        if (newWorkspace.sampleIds) {
            for (let sampleId of newWorkspace.sampleIds) {
                const sample = _.find(state.samples, s => s.id === sampleId)
                const gate = _.find(state.gates, g => g.childSampleId === sampleId)
                if (gate) {
                    sample.gate = gate
                }
                if (sample) { newWorkspace.samples.push(sample) }
            }
            newWorkspace.sampleIds = null
        }

        if (newWorkspace.selectedSampleId) {
            for (let sample of newWorkspace.samples) {
                if (sample.id === newWorkspace.selectedSampleId) {
                    newWorkspace.selectedSample = sample
                }
            }
        }

        newWorkspace.gateTemplates = []
        // If the workspace contains gate templates, find them and add them as complete objects
        if (newWorkspace.gateTemplateIds) {
            for (let sampleId of newWorkspace.gateTemplateIds) {
                const sample = _.find(state.gateTemplates, s => s.id === sampleId)
                if (sample) { newWorkspace.gateTemplates.push(sample) }
            }
            newWorkspace.gateTemplateIds = null
        }

        if (newWorkspace.selectedGateTemplateId) {
            for (let gateTemplate of newWorkspace.gateTemplates) {
                if (gateTemplate.id === newWorkspace.selectedGateTemplateId) {
                    newWorkspace.selectedGateTemplate = gateTemplate
                }
            }
        }

        newWorkspace.gateTemplateGroups = []
        // If the workspace contains gate template groups, find them and add them as complete objects
        if (newWorkspace.gateTemplateGroupIds) {
            for (let sampleId of newWorkspace.gateTemplateGroupIds) {
                const sample = _.find(state.gateTemplateGroups, s => s.id === sampleId)
                if (sample) { newWorkspace.gateTemplateGroups.push(sample) }
            }
            newWorkspace.gateTemplateGroupIds = null
        }

        // If there is a highlighted gate, highlight it's subsample
        const highlightedGate = _.find(state.gates, g => g.highlighted && workspace.sampleIds.includes(g.childSampleId)) || {}
        return { api: state.api, workspace: newWorkspace, highlightedGate }
    } else {
        return { api: state.api, workspace: { samples: [] }, highlightGate: {} }
    }
}

const mapDispatchToProps = dispatch => {
    return {
        updateGateTemplate: (gateTemplateId, parameters) => {
            dispatch(updateGateTemplate(gateTemplateId, parameters))
        }
    }
}

const WorkspaceViewWrapped = connect(
    mapStateToProps,
    mapDispatchToProps
)(WorkspaceView)

export default WorkspaceViewWrapped