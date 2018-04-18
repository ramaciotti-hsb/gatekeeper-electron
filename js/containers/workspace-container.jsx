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
            for (let FCSFileId of newWorkspace.FCSFileIds) {
                const FCSFile = _.find(state.FCSFiles, s => s.id === FCSFileId)
                if (FCSFile) { newWorkspace.FCSFiles.push(FCSFile) }
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
                const gateTemplate = _.clone(_.find(state.gateTemplates, s => s.id === gateTemplateId))
                if (gateTemplate) {
                    // Add the population count for the corresponding sample
                    const sampleForGateTemplate = _.find(state.samples, s => s.FCSFileId === newWorkspace.selectedFCSFileId && s.gateTemplateId === gateTemplate.id)
                    if (sampleForGateTemplate) {
                        gateTemplate.populationCount = sampleForGateTemplate.populationCount
                    }
                    newWorkspace.gateTemplates.push(gateTemplate)
                }
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
                const gateTemplateGroup = _.clone(_.find(state.gateTemplateGroups, s => s.id === gateTemplateGroupId))
                if (gateTemplateGroup) {
                    // If there are no subsamples for this FCS file and gate template group, mark the gate template as loading
                    if (!_.find(state.samples, s => gateTemplateGroup.childGateTemplateIds.includes(s.gateTemplateId) && s.FCSFileId === newWorkspace.selectedFCSFileId)) {
                        gateTemplateGroup.loading = true
                    }
                    newWorkspace.gateTemplateGroups.push(gateTemplateGroup)
                }
            }
            newWorkspace.gateTemplateGroupIds = null
        }

        let selectedSample
        if (newWorkspace.selectedSampleId) {
            selectedSample = _.find(state.samples, s => s.id === newWorkspace.selectedSampleId)
        }

        // If there is a highlighted gate, highlight it's subsample
        const highlightedGate = _.find(state.gates, g => g.highlighted && workspace.sampleIds.includes(g.childSampleId)) || {}
        return { api: state.api, workspace: newWorkspace, highlightedGate }
    } else {
        return { api: state.api }
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