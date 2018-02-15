// -------------------------------------------------------------
// A react-redux container for application-component.jsx.
// -------------------------------------------------------------

import { connect } from 'react-redux'
import { sampleLoadingFinished } from '../actions/sample-actions'
import { createWorkspace, removeWorkspace, selectWorkspace, createSampleAndAddToWorkspace } from '../actions/workspace-actions.js'
import Application from '../components/application-component.jsx'

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