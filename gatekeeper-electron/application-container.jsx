// -------------------------------------------------------------
// A react-redux container for application-component.jsx.
// -------------------------------------------------------------

import { connect } from 'react-redux'
import { sampleLoadingFinished } from '../gatekeeper-frontend/actions/sample-actions'
import { createWorkspace, removeWorkspace, selectWorkspace, createSampleAndAddToWorkspace } from '../gatekeeper-frontend/actions/workspace-actions.js'
import Application from './application-component.jsx'
import _ from 'lodash'

const mapStateToProps = state => {
    const selectedWorkspace = _.find(state.workspaces, w => w.id === state.selectedWorkspaceId)
    let selectedGateTemplateId
    if (selectedWorkspace) {
        selectedGateTemplateId = selectedWorkspace.selectedGateTemplateId
    }
    return _.merge(state, { selectedGateTemplateId: selectedGateTemplateId })
}

const mapDispatchToProps = dispatch => {
  return {}
}

const ApplicationContainerWrapped = connect(
    mapStateToProps,
    mapDispatchToProps
)(Application)

export default ApplicationContainerWrapped