// -------------------------------------------------------------
// A react-redux container for application-component.jsx.
// -------------------------------------------------------------

import { connect } from 'react-redux'
import { createWorkspace, removeWorkspace, selectWorkspace, createSampleAndAddToWorkspace } from '../gatekeeper-frontend/actions/workspace-actions.js'
import Application from './application-component.jsx'
import _ from 'lodash'

const mapStateToProps = state => {
    return state
}

const mapDispatchToProps = dispatch => {
  return {}
}

const ApplicationContainerWrapped = connect(
    mapStateToProps,
    mapDispatchToProps
)(Application)

export default ApplicationContainerWrapped