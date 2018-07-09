// -------------------------------------------------------------
// A react-redux container for sample-view-outer-component.jsx.
// -------------------------------------------------------------

import { connect } from 'react-redux'
import constants from '../../gatekeeper-utilities/constants'
import FCSFileSelector from '../components/fcs-file-selector-component.jsx'
import '../scss/fcs-file-selector-component.scss'
import _ from 'lodash'

const mapStateToProps = (state, ownProps) => {
    // Find the selected sample based on the selected FCS file and gate template
    const workspace = _.find(state.workspaces, w => w.id === ownProps.workspaceId)
    const selectedSample = _.find(state.samples, s => ownProps.selectedFCSFile && s.FCSFileId === ownProps.selectedFCSFile.id && s.gateTemplateId === workspace.selectedGateTemplateId) || {}
    return {
        api: state.api,
        FCSFiles: _.filter(state.FCSFiles, fcs => _.find(state.workspaces, w => w.id === ownProps.workspaceId).FCSFileIds.includes(fcs.id)),
        selectedFCSFile: ownProps.selectedFCSFile,
        selectedSample,
        workspaceId: ownProps.workspaceId,
        backgroundJobsEnabled: state.backgroundJobsEnabled,
        unsavedGates: state.unsavedGates
    }
}

const mapDispatchToProps = dispatch => {
    return {}
}

const FCSFileSelectorWrapped = connect(
    mapStateToProps,
    mapDispatchToProps
)(FCSFileSelector)

export default FCSFileSelectorWrapped