// -------------------------------------------------------------
// A react-redux container for bivariate-plot-component.jsx.
// -------------------------------------------------------------

import { connect } from 'react-redux'
import { createSubSampleAndAddToWorkspace } from '../actions/workspace-actions'
import { updateGateTemplate } from '../actions/gate-template-actions'
import BivariatePlot from '../components/sample-components/bivariate-plot-component.jsx'
import _ from 'lodash'

const mapStateToProps = (state, ownProps) => {
    // Find the selected FCS file
    const FCSFile = _.find(state.FCSFiles, w => w.id === ownProps.FCSFileId) || {}
    const newFCSFile = _.cloneDeep(FCSFile)

    // Find the workspace that this FCS File is inside
    let workspace = _.find(state.workspaces, w => w.FCSFileIds.includes(ownProps.FCSFileId))
    
    if (ownProps.sampleId) {
        // Find the selected sample
        const sample = _.find(state.samples, w => w.id === ownProps.sampleId) || {}
        const newSample = _.clone(sample)
        newSample.subSamples = []
        // If the workspace contains samples, find them and add them as complete objects
        if (newSample.subSampleIds) {
            for (let subSampleId of newSample.subSampleIds) {
                const subSample = _.find(state.samples, s => s.id === subSampleId)
                if (sample) { newSample.subSamples.push(sample) }
            }
            
            newSample.subSampleIds = null
        }

        // Find the parent sample if there is one
        const parent = _.find(state.samples, s => s.subSampleIds.includes(ownProps.sampleId))
        if (parent) {
            newSample.parentTitle = parent.title
        }

        if (ownProps.gates) {
            return {
                api: state.api,
                workspace,
                sample: newSample,
                gates: ownProps.gates,
                FCSFile,
                testagain: '1234',
                plotWidth: state.plotWidth,
                plotHeight: state.plotHeight,
                plotDisplayWidth: ownProps.plotDisplayWidth || state.plotDisplayWidth,
                plotDisplayHeight: ownProps.plotDisplayHeight || state.plotDisplayHeight,
                machineType: FCSFile.machineType,
                backgroundJobsEnabled: state.backgroundJobsEnabled 
            }
        } else {
            // Find any gates on this plot
            const gates = []
            for (let gate of state.gates) {
                let selectedXParameterIndex = ownProps.selectedXParameterIndex
                let selectedYParameterIndex = ownProps.selectedYParameterIndex
                if (gate.parentSampleId === ownProps.sampleId
                    && gate.selectedXParameterIndex === selectedXParameterIndex
                    && gate.selectedYParameterIndex === selectedYParameterIndex) {
                    gates.push(gate)
                }
            }

            // Find gate templates that gates refer to
            const gateTemplates = gates.map(g => _.find(state.gateTemplates, gt => g.gateTemplateId === gt.id))
            // Find gate template groups that templates are in
            const gateTemplateGroups = gateTemplates.map(gt => _.find(state.gateTemplateGroups, g => g.childGateTemplateIds.includes(gt.id)))

            return {
                api: state.api,
                workspace,
                sample: newSample,
                gates,
                gateTemplates,
                gateTemplateGroups,
                FCSFile,
                plotWidth: state.plotWidth,
                plotHeight: state.plotHeight,
                plotDisplayWidth: ownProps.plotDisplayWidth || state.plotDisplayWidth,
                plotDisplayHeight: ownProps.plotDisplayHeight || state.plotDisplayHeight,
                machineType: FCSFile.machineType,
                backgroundJobsEnabled: state.backgroundJobsEnabled 
            }
        }
    } else {
        return { api: state.api, gates: [], gateTemplates: [], workspace, FCSFile, plotWidth: state.plotWidth, plotHeight: state.plotHeight, backgroundJobsEnabled: state.backgroundJobsEnabled }
    }
}

const mapDispatchToProps = dispatch => {
    return {
        updateGateTemplate: (gateTemplateId, parameters) => {
            dispatch(updateGateTemplate(gateTemplateId, parameters))
        }
    }
}

const BivariatePlotWrapped = connect(
    mapStateToProps,
    mapDispatchToProps
)(BivariatePlot)

export default BivariatePlotWrapped