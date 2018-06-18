// -------------------------------------------------------------
// A react-redux container for homology-modal-component.jsx.
// -------------------------------------------------------------

import { connect } from 'react-redux'
import GatingErrorModal from '../components/gating-error-modal-component.jsx'
import { updateModalParameters } from '../actions/application-actions'
import _ from 'lodash'

const mapStateToProps = (state, ownProps) => {
    const selectedWorkspace = _.find(state.workspaces, w => w.id === state.selectedWorkspaceId) || {}
    const selectedFCSFile = _.find(state.FCSFiles, fcs => fcs.id === selectedWorkspace.selectedFCSFileId) || {}
    let selectedGateTemplateGroup = {}
    let selectedSample = {}

    let gatingError = _.find(state.gatingErrors, e => e.id === state.modals.gatingError.gatingErrorId)
    if (gatingError) {
        selectedGateTemplateGroup = _.find(state.gateTemplateGroups, g => g.id === gatingError.gateTemplateGroupId)
        selectedSample = _.find(state.samples, s => s.id === gatingError.sampleId) || {}
    }

    return {
        api: state.api,
        selectedWorkspace,
        selectedFCSFile,
        selectedGateTemplateGroup,
        selectedSample,
        gatingError,
        plotWidth: state.plotWidth,
        plotHeight: state.plotHeight,
        modalVisible: state.modals.gatingError.visible
    }
}

const mapDispatchToProps = dispatch => {
    return {
        updateModalParameters: (modalKey, parameters) => {
            dispatch(updateModalParameters(modalKey, parameters))
        }
    }
}

const GatingErrorModalWrapped = connect(
    mapStateToProps,
    mapDispatchToProps
)(GatingErrorModal)

export default GatingErrorModalWrapped