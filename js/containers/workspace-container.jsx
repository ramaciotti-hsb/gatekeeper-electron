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
        newWorkspace.FCSFiles = []
        // If the workspace contains FCSFiles, find them and add them as complete objects
        if (newWorkspace.FCSFileIds) {
            for (let sampleId of newWorkspace.FCSFileIds) {
                const sample = _.find(state.FCSFiles, s => s.id === sampleId)
                const gate = _.find(state.gates, g => g.childSampleId === sampleId)
                if (gate) {
                    sample.gate = gate
                }
                if (sample) { newWorkspace.FCSFiles.push(sample) }
            }
            newWorkspace.FCSFileIds = null
        }

        if (newWorkspace.selectedFCSFileId) {
            for (let FCSFile of newWorkspace.FCSFiles) {
                if (FCSFile.id === newWorkspace.selectedFCSFileId) {
                    newWorkspace.selectedFCSFile = FCSFile
                }
            }
        }

        newWorkspace.gateTemplates = []
        // If the workspace contains gate templates, find them and add them as complete objects
        if (newWorkspace.gateTemplateIds) {
            for (let gateTemplateId of newWorkspace.gateTemplateIds) {
                const gateTemplate = _.find(state.gateTemplates, s => s.id === gateTemplateId)
                if (gateTemplate) { newWorkspace.gateTemplates.push(gateTemplate) }
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
            for (let gateTemplateGroupId of newWorkspace.gateTemplateGroupIds) {
                const gateTemplateGroup = _.find(state.gateTemplateGroups, s => s.id === gateTemplateGroupId)
                if (gateTemplateGroup) { newWorkspace.gateTemplateGroups.push(gateTemplateGroup) }
            }
            newWorkspace.gateTemplateGroupIds = null
        }

        // If there is a highlighted gate, highlight it's subsample
        const highlightedGate = _.find(state.gates, g => g.highlighted && workspace.sampleIds.includes(g.childSampleId)) || {}
        return { api: state.api, workspace: newWorkspace, highlightedGate }
    } else {
        return { api: state.api, workspace: { FCSFiles: [] }, highlightGate: {} }
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