// -------------------------------------------------------------
// A react-redux container for homology-modal-component.jsx.
// -------------------------------------------------------------

import { connect } from 'react-redux'
import HomologyModal from '../components/homology-modal-component.jsx'
import _ from 'lodash'

const mapStateToProps = (state, ownProps) => {
    const selectedWorkspace = _.find(state.workspaces, w => w.id === state.selectedWorkspaceId) || {}
    const selectedFCSFile = _.find(state.FCSFiles, fcs => fcs.id === selectedWorkspace.selectedFCSFileId) || {}
    const selectedGateTemplate = _.find(state.gateTemplates, gt => gt.id === selectedWorkspace.selectedGateTemplateId) || {}
    const selectedGateTemplateGroup = _.find(state.gateTemplateGroups, g => g.parentGateTemplateId === selectedGateTemplate.id && g.selectedXParameterIndex === state.gatingModal.selectedXParameterIndex && g.selectedYParameterIndex === state.gatingModal.selectedYParameterIndex) 
    const gateHasChildren = selectedGateTemplateGroup ? true : false
    const selectedSample = _.find(state.samples, s => s.gateTemplateId === selectedGateTemplate.id && s.FCSFileId === selectedFCSFile.id) || {}

    return {
        api: state.api,
        selectedWorkspace,
        selectedFCSFile,
        selectedGateTemplate,
        selectedSample,
        gateHasChildren,
        unsavedGates: state.unsavedGates,
        plotWidth: state.plotWidth,
        plotHeight: state.plotHeight,
        modalOptions: {
            visible: state.gatingModal.sampleId && state.gatingModal.visible,
            sampleId: state.gatingModal.sampleId,
            selectedXParameterIndex: state.gatingModal.selectedXParameterIndex || 0,
            selectedYParameterIndex: state.gatingModal.selectedYParameterIndex || 1
        }
    }
}

const mapDispatchToProps = dispatch => {
    return {
        
    }
}

const HomologyModalWrapped = connect(
    mapStateToProps,
    mapDispatchToProps
)(HomologyModal)

export default HomologyModalWrapped