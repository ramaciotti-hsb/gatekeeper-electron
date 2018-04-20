// -------------------------------------------------------------
// A react-redux container for homology-modal-component.jsx.
// -------------------------------------------------------------

import { connect } from 'react-redux'
import HomologyModal from '../components/homology-modal-component.jsx'
import { updateModalParameters } from '../actions/application-actions'
import _ from 'lodash'

const mapStateToProps = (state, ownProps) => {
    const selectedWorkspace = _.find(state.workspaces, w => w.id === state.selectedWorkspaceId) || {}
    const selectedFCSFile = _.find(state.FCSFiles, fcs => fcs.id === selectedWorkspace.selectedFCSFileId) || {}
    const selectedGateTemplate = _.find(state.gateTemplates, gt => gt.id === selectedWorkspace.selectedGateTemplateId) || {}
    const selectedSample = _.find(state.samples, s => s.gateTemplateId === selectedGateTemplate.id && s.FCSFileId === selectedFCSFile.id) || {}

    return {
        api: state.api,
        selectedWorkspace,
        selectedFCSFile,
        selectedGateTemplate,
        selectedSample,
        plotWidth: state.plotWidth,
        plotHeight: state.plotHeight,
        modalOptions: state.modals.homology,
        modalVisible: state.modals.homology.visible
    }
}

const mapDispatchToProps = dispatch => {
    return {
        updateModalParameters: (modalKey, parameters) => {
            dispatch(updateModalParameters(modalKey, parameters))
        }
    }
}

const HomologyModalWrapped = connect(
    mapStateToProps,
    mapDispatchToProps
)(HomologyModal)

export default HomologyModalWrapped