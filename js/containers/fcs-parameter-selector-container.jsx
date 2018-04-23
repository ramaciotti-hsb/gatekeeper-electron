// -------------------------------------------------------------
// A react-redux container for homology-modal-component.jsx.
// -------------------------------------------------------------

import { connect } from 'react-redux'
import FCSParameterSelector from '../components/fcs-parameter-selector.jsx'
import { updateModalParameters } from '../actions/application-actions'
import _ from 'lodash'

const mapStateToProps = (state, ownProps) => {
    const selectedWorkspace = _.find(state.workspaces, w => w.id === state.selectedWorkspaceId) || {}
    const selectedFCSFile = _.find(state.FCSFiles, fcs => fcs.id === selectedWorkspace.selectedFCSFileId) || {}

    return {
        api: state.api,
        selectedWorkspace,
        selectedFCSFile,
        showDisabledParameters: state.showDisabledParameters
    }
}

const mapDispatchToProps = dispatch => {
    return {}
}

const FCSParameterSelectorWrapped = connect(
    mapStateToProps,
    mapDispatchToProps
)(FCSParameterSelector)

export default FCSParameterSelectorWrapped