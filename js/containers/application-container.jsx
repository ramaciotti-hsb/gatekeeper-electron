// -------------------------------------------------------------
// A react-redux container for application-component.jsx.
// -------------------------------------------------------------

import { connect } from 'react-redux'
import { createWorkspace, removeWorkspace, selectWorkspace, createSampleAndAddToWorkspace } from '../actions/workspace-actions.js'
import Application from '../components/application-component.jsx'

const mapStateToProps = state => {
    return state
}

const mapDispatchToProps = dispatch => {
  return {
    createWorkspace: (parameters) => {
        dispatch(createWorkspace(parameters))
    },

    removeWorkspace: (id) => {
        dispatch(removeWorkspace(id))
    },

    selectWorkspace: (id) => {
        dispatch(selectWorkspace(id))
    },

    createSampleAndAddToWorkspace: (parameters) => {
        dispatch(createSampleAndAddToWorkspace(parameters))
    }
  }
}

const ApplicationContainerWrapped = connect(
    mapStateToProps,
    mapDispatchToProps
)(Application)

export default ApplicationContainerWrapped