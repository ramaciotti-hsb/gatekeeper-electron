// -------------------------------------------------------------
// A react component that renders the popup modal for selecting
// homology options when performing automated gating.
// -------------------------------------------------------------

import React from 'react'
import { Component } from 'react'
import _ from 'lodash'
import Dropdown from '../lib/dropdown-inline.jsx'
import constants from '../lib/constants'
import '../../scss/homology-modal.scss'
import BivariatePlot from '../containers/bivariate-plot-container.jsx'

export default class FCSFileSelector extends Component {
    
    constructor (props) {
        super(props)
        this.state = {
            edgeDistance: this.props.plotWidth * 0.05,
            minPeakHeight: this.props.plotWidth * 0.04,
            minPeakSize: props.selectedFCSFile.machineType === constants.MACHINE_CYTOF ? 5000 : 1000,
            createNegativeGate: false,
        }
    }

    modalOuterClicked (event) {
        this.props.updateModalParameters('homology', { visible: false })
        this.props.api.clearUnsavedGates()
    }

    modalInnerClicked (event) {
        event.stopPropagation()
    }

    componentDidUpdate (prevProps) {
        if (prevProps.selectedFCSFile.machineType !== this.props.selectedFCSFile.machineType) {
            this.setState({
                minPeakSize: this.props.selectedFCSFile.machineType === constants.MACHINE_CYTOF ? 5000 : 1000
            })
        }
    }

    updateState(key, event) {
        this.state[key] = event.target.value
        this.setState(this.state)
    }

    createGatesClicked () {
        this.props.api.calculateHomology(this.props.selectedSample.id, {
            selectedXParameterIndex: this.props.modalOptions.selectedXParameterIndex,
            selectedYParameterIndex: this.props.modalOptions.selectedYParameterIndex,
            selectedXScale: this.props.selectedWorkspace.selectedXScale,
            selectedYScale: this.props.selectedWorkspace.selectedYScale,
            machineType: this.props.selectedFCSFile.machineType,
            edgeDistance: this.state.edgeDistance,
            minPeakHeight: this.state.minPeakHeight,
            minPeakSize: this.state.minPeakSize,
            createNegativeGate: this.state.createNegativeGate,
            removeExistingGates: true
        })
        // this.props.updateModalParameters('homology', { visible: false })
    }

    render () {

        if (!this.props.selectedSample.id) {
            return <div></div>
        }

        let contents

        let unsavedGates = [{
            id: 1,
            title: '143Nd_CD45RA (HIGH) · 147Sm_CD20 (HIGH)',
            gateCreatorData: {
                widthIndex: 60
            }
        },{
            id: 2,
            title: '143Nd_CD45RA (HIGH) · 147Sm_CD20 (HIGH)',
            gateCreatorData: {
                widthIndex: 60
            }
        }]

        if (this.props.unsavedGates) {
            const gates = this.props.unsavedGates.map((gate) => {
                let cytofOptions
                if (this.props.selectedFCSFile.machineType === constants.MACHINE_CYTOF) {
                    cytofOptions = (
                        <div className='cytof-options'>
                            <div className='title'>Mass Cytometry Options</div>
                            <div className={'parameter checkbox include-x-zeroes' + (gate.gateCreatorData.includeXChannelZeroes ? ' active' : '')} onClick={this.props.api.updateUnsavedGate.bind(null, gate.id, { gateCreatorData: { includeXChannelZeroes: !gate.gateCreatorData.includeXChannelZeroes } })}>
                                <i className={'lnr ' + (gate.gateCreatorData.includeXChannelZeroes ? 'lnr-checkmark-circle' : 'lnr-circle-minus')} />
                                <div className='text'>Include events with 0 X value</div>
                            </div>
                            <div className={'parameter checkbox include-y-zeroes' + (gate.gateCreatorData.includeYChannelZeroes ? ' active' : '')} onClick={this.props.api.updateUnsavedGate.bind(null, gate.id, { gateCreatorData: { includeYChannelZeroes: !gate.gateCreatorData.includeYChannelZeroes } })}>
                                <i className={'lnr ' + (gate.gateCreatorData.includeYChannelZeroes ? 'lnr-checkmark-circle' : 'lnr-circle-minus')} />
                                <div className='text'>Include events with 0 Y value</div>
                            </div>
                        </div>
                    )
                }
                return (
                    <div className='gate' key={gate.id}>
                        <div className='title'>
                            {gate.title}
                        </div>
                        <div className='parameter width'>
                            <div className='text'>Additional Width:</div>
                            <div className='value'>{gate.gateCreatorData.widthIndex}</div>
                            <i className='lnr lnr-plus-circle' onClick={this.props.api.updateUnsavedGate.bind(null, gate.id, { gateCreatorData: { widthIndex: gate.gateCreatorData.widthIndex + 1 } })} />
                            <i className='lnr lnr-circle-minus' onClick={this.props.api.updateUnsavedGate.bind(null, gate.id, { gateCreatorData: { widthIndex: gate.gateCreatorData.widthIndex - 1 } })} />
                        </div>
                        {cytofOptions}
                    </div>
                )
            })
            contents = (
                <div className='unsaved-gates'>
                    <div className='title'>
                        <div className='text'>Gates</div>
                        <i className='lnr lnr-cross' onClick={this.props.api.resetUnsavedGates.bind(null)}></i>
                    </div>
                    <div className='gates'>
                        {gates}
                    </div>
                </div>
            )
        } else {
            contents = (
                <div className='homology-options'>
                    <div className='title'>Homology Options</div>
                    <div className='row'>
                        <div className='text'>Edge Distance</div>
                        <input type='number' value={this.state.edgeDistance} onChange={this.updateState.bind(this, 'edgeDistance')} />
                    </div>
                    <div className='row'>
                        <div className='text'>Minimum Peak Height</div>
                        <input type='number' value={this.state.minPeakHeight} onChange={this.updateState.bind(this, 'minPeakHeight')} />
                    </div>
                    <div className='row'>
                        <div className='text'>Minimum Peak Size</div>
                        <input type='number' value={this.state.minPeakSize} onChange={this.updateState.bind(this, 'minPeakSize')} />
                    </div>
                    <div className='row'/>
                    <div className={'row clickable' + (this.state.createNegativeGate ? ' active' : ' disabled')} onClick={this.updateState.bind(this, 'createNegativeGate', { target: { value: !this.state.createNegativeGate } })}>
                        <i className={'lnr ' + (this.state.createNegativeGate ? 'lnr-checkmark-circle' : 'lnr-circle-minus')} />
                        <div className='text right'>Create Negative Gate (Includes All Uncaptured Events)</div>
                    </div>
                    <div className='divider'></div>
                    <div className={'warning-message' + (this.props.gateHasChildren ? ' active' : '')}>Warning: Current gates and any sub gates will be deleted upon recalculation.</div>
                    <div className='actions'>
                        <div className='calculate-homology' onClick={this.createGatesClicked.bind(this)}>Create Gates</div>
                    </div>
                </div>
            )
        }

        return (
            <div className={'homology-modal-outer' + (this.props.modalVisible === true ? ' active' : '')} onClick={this.modalOuterClicked.bind(this)}>
                <div className='homology-modal-inner' onClick={this.modalInnerClicked} style={{ height: this.props.plotHeight + 100 }}>
                    <div className='upper'>
                        <div className='title'>Automated gating using Persistent Homology</div>
                    </div>
                    <div className='lower'>
                        <div className='graph'>
                            <BivariatePlot gates={this.props.unsavedGates} sampleId={this.props.selectedSample.id} FCSFileId={this.props.selectedFCSFile.id} selectedXParameterIndex={this.props.modalOptions.selectedXParameterIndex} selectedYParameterIndex={this.props.modalOptions.selectedYParameterIndex} selectedXScale={this.props.selectedWorkspace.selectedXScale} selectedYScale={this.props.selectedWorkspace.selectedYScale} plotDisplayWidth={500} plotDisplayHeight={500} />
                        </div>
                        {contents}
                    </div>
                </div>
            </div>
        )
    }
}