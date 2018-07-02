// -------------------------------------------------------------
// A react component that renders the popup modal for selecting
// homology options when performing automated gating.
// -------------------------------------------------------------

import React from 'react'
import { Component } from 'react'
import _ from 'lodash'
import constants from '../lib/constants'
import '../../scss/homology-modal.scss'
import Dropdown from '../lib/dropdown.jsx'
import BivariatePlot from '../containers/bivariate-plot-container.jsx'
import uuidv4 from 'uuid/v4'
import { registerKeyListener, deregisterKeyListener } from '../lib/global-keyboard-listener'

export default class HomologyModal extends Component {
    
    constructor (props) {
        super(props)
        this.state = {
            edgeDistance: this.props.plotWidth * 0.05,
            minPeakHeight: Math.round(this.props.plotWidth * 0.01),
            minPeakSize: props.selectedFCSFile.machineType === constants.MACHINE_CYTOF ? 2000 : 1000,
            createNegativeGate: false,
            selectingComboGate: false,
            selectedComboGateIds: [],
            highlightedGateIds: []
        }
    }

    modalOuterClicked (event) {
        this.props.updateModalParameters('homology', { visible: false })
        this.props.api.resetUnsavedGates()
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

    toggleCreateNegativeGate () {
        const exists = _.find(this.props.unsavedGates, g => g.type === constants.GATE_TYPE_NEGATIVE)
        this.props.api.setUnsavedNegativeGateVisible(!exists)
    }

    toggleSelectingComboGate () {
        this.setState({
            selectingComboGate: !this.state.selectingComboGate,
            selectedComboGateIds: []
        })
    }

    toggleSelectComboGateWithId (gateId) {
        let found = false
        for (let i = 0; i < this.state.selectedComboGateIds.length; i++) {
            if (this.state.selectedComboGateIds[i] === gateId) {
                found = true
                this.state.selectedComboGateIds.splice(i, 1)
                break
            }
        }

        if (!found) {
            this.state.selectedComboGateIds.push(gateId)
        }

        this.setState({
            selectedComboGateIds: this.state.selectedComboGateIds.slice(0)
        })
    }

    createComboGate () {
        this.props.api.createUnsavedComboGate(this.state.selectedComboGateIds)
        this.setState({
            selectedComboGateIds: [],
            selectingComboGate: false
        })
    }

    removeComboGate (gateId) {
        this.props.api.removeUnsavedGate(gateId)
    }

    setGateHighlight (gateId, highlight) {
        for (let i = 0; i < this.state.highlightedGateIds.length; i++) {
            if (this.state.highlightedGateIds[i] === gateId) {
                this.state.highlightedGateIds.splice(i, 1)
                break
            }
        }

        if (highlight) {
            this.state.highlightedGateIds.push(gateId)
        }

        this.setState({
            highlightedGateIds: this.state.highlightedGateIds.slice(0)
        })
    }

    updateWidthIndex(gate, increment, event) {
        if (event.shiftKey) {
            increment *= 10
        }
        this.props.api.updateUnsavedGate(gate.id, { gateCreatorData: { widthIndex: gate.gateCreatorData.widthIndex + increment } })
    }

    createGatesClicked () {
        this.props.api.createUnsavedGatesUsingHomology(this.props.selectedSample.id, {
            selectedXParameterIndex: this.props.modalOptions.selectedXParameterIndex,
            selectedYParameterIndex: this.props.modalOptions.selectedYParameterIndex,
            selectedXScale: this.props.selectedWorkspace.selectedXScale,
            selectedYScale: this.props.selectedWorkspace.selectedYScale,
            machineType: this.props.selectedFCSFile.machineType,
            edgeDistance: this.state.edgeDistance,
            minPeakHeight: this.state.minPeakHeight,
            minPeakSize: this.state.minPeakSize,
            removeExistingGates: true
        })
        // this.props.updateModalParameters('homology', { visible: false })
    }

    applyGatesClicked () {
        this.props.api.applyUnsavedGatesToSample(this.props.selectedSample.id, {
            selectedXParameterIndex: this.props.modalOptions.selectedXParameterIndex,
            selectedYParameterIndex: this.props.modalOptions.selectedYParameterIndex,
            selectedXScale: this.props.selectedWorkspace.selectedXScale,
            selectedYScale: this.props.selectedWorkspace.selectedYScale,
            machineType: this.props.selectedFCSFile.machineType,
            edgeDistance: this.state.edgeDistance,
            minPeakHeight: this.state.minPeakHeight,
            minPeakSize: this.state.minPeakSize,
            removeExistingGates: true
        }).then(this.modalOuterClicked.bind(this))
    }

    componentDidMount () {
        this.keyboardListenerId = uuidv4()
        // Hide the modal when the escape key is pressed
        registerKeyListener(this.keyboardListenerId, constants.CHARACTER_CODE_ESCAPE, this.modalOuterClicked.bind(this))
    }

    componentWillUnmount () {
        deregisterKeyListener(this.keyboardListenerId)   
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
            },
            selectedXParameterIndex: 0,
            selectedYParameterIndex: 1
        },{
            id: 2,
            title: '143Nd_CD45RA (HIGH) · 147Sm_CD20 (HIGH)',
            gateCreatorData: {
                widthIndex: 60
            },
            selectedXParameterIndex: 0,
            selectedYParameterIndex: 1
        }]

        if (this.props.unsavedGates) {
            const gates = this.props.unsavedGates.map((gate) => {
                const highlightGate = this.setGateHighlight.bind(this, gate.id, true)
                const unHighlightGate = this.setGateHighlight.bind(this, gate.id, false)
                if (gate.type === constants.GATE_TYPE_POLYGON) {
                    let cytofOptions
                    if (this.props.selectedFCSFile.machineType === constants.MACHINE_CYTOF) {
                        cytofOptions = (
                            <div className='cytof-options'>
                                <div className='title'>Mass Cytometry Options</div>
                                <div className={'parameter checkbox include-x-zeroes' + (gate.gateCreatorData.includeXChannelZeroes ? ' active' : '')} onClick={this.props.api.updateUnsavedGate.bind(null, gate.id, { gateCreatorData: { includeXChannelZeroes: !gate.gateCreatorData.includeXChannelZeroes } })}>
                                    <i className={'lnr ' + (gate.gateCreatorData.includeXChannelZeroes ? 'lnr-checkmark-circle' : 'lnr-circle-minus')} />
                                    <div className='text'>Include events where {this.props.selectedFCSFile.FCSParameters[gate.selectedXParameterIndex].label} is zero</div>
                                </div>
                                <div className={'parameter checkbox include-y-zeroes' + (gate.gateCreatorData.includeYChannelZeroes ? ' active' : '')} onClick={this.props.api.updateUnsavedGate.bind(null, gate.id, { gateCreatorData: { includeYChannelZeroes: !gate.gateCreatorData.includeYChannelZeroes } })}>
                                    <i className={'lnr ' + (gate.gateCreatorData.includeYChannelZeroes ? 'lnr-checkmark-circle' : 'lnr-circle-minus')} />
                                    <div className='text'>Include events where {this.props.selectedFCSFile.FCSParameters[gate.selectedYParameterIndex].label} is zero</div>
                                </div>
                            </div>
                        )
                    }

                    return (
                        <div className={'gate' + (this.state.selectingComboGate ? ' combo-selection' : '') + (this.state.selectedComboGateIds.includes(gate.id) ? ' active' : '')} key={gate.id} onClick={this.state.selectingComboGate ? this.toggleSelectComboGateWithId.bind(this, gate.id) : () => {}}
                        onMouseOver={highlightGate} onMouseOut={unHighlightGate}>
                            <div className='left'>
                                <div className='title'>
                                    {gate.title}
                                </div>
                                <div className='population-count'>
                                    <div className='highlight'>{gate.includeEventIds.length}</div> events (<div className='highlight'>{(gate.includeEventIds.length / this.props.selectedSample.populationCount * 100).toFixed(1)}%</div> of parent)
                                </div>
                                <div className='additional-options'>
                                    <div className='parameter width'>
                                        <div className='text'>Additional Width:</div>
                                        <div className='value'>{gate.gateCreatorData.widthIndex}</div>
                                        <i className='lnr lnr-plus-circle' onClick={this.updateWidthIndex.bind(this, gate, 1)} />
                                        <i className='lnr lnr-circle-minus' onClick={this.updateWidthIndex.bind(this, gate, -1)} />
                                    </div>
                                    {cytofOptions}
                                </div>
                            </div>
                            <div className='right'>
                                <i className='lnr lnr-checkmark-circle' />
                            </div>
                        </div>
                    )
                } else if (gate.type === constants.GATE_TYPE_NEGATIVE) {
                    return (
                        <div className={'gate negative' + (this.state.selectingComboGate ? ' combo-selection' : '') + (this.state.selectedComboGateIds.includes(gate.id) ? ' active' : '')} key={gate.id} onClick={this.state.selectingComboGate ? this.toggleSelectComboGateWithId.bind(this, gate.id) : () => {}}
                        onMouseOver={highlightGate} onMouseOut={unHighlightGate}>
                            <div className='left'>
                                <div className='title'>
                                    {gate.title}
                                </div>
                                <div className='population-count'>
                                    <div className='highlight'>{gate.includeEventIds.length}</div> events (<div className='highlight'>{(gate.includeEventIds.length / this.props.selectedSample.populationCount * 100).toFixed(1)}%</div> of parent)
                                </div>
                            </div>
                            <div className='dismiss'>
                                <i className='lnr lnr-cross-circle' onClick={this.toggleCreateNegativeGate.bind(this)} />
                            </div>
                            <div className='right'>
                                <i className='lnr lnr-checkmark-circle' />
                            </div>
                        </div>
                    )
                } else if (gate.type === constants.GATE_TYPE_COMBO && !this.state.selectingComboGate) {
                    const includedGates = _.filter(this.props.unsavedGates, g => gate.gateCreatorData.gateIds.includes(g.id))
                    const comboList = includedGates.map((g) => {
                        return (
                            <div className='included-gate' key={g.id}>{g.title}</div>
                        )
                    })

                    const highlightGates = () => {
                        for (let g of includedGates) {
                            this.setGateHighlight(g.id, true)
                        }
                    }

                    const unHighlightGates = () => {
                        for (let g of includedGates) {
                            this.setGateHighlight(g.id, false)
                        }
                    }

                    return (
                        <div className='gate combo' key={gate.id} onMouseOver={highlightGates} onMouseOut={unHighlightGates}>
                            <div className='left'>
                                <div className='title'>
                                    {gate.title}
                                </div>
                                <div className='population-count'>
                                    <div className='highlight'>{gate.includeEventIds.length}</div> events (<div className='highlight'>{(gate.includeEventIds.length / this.props.selectedSample.populationCount * 100).toFixed(1)}%</div> of parent)
                                </div>
                                <div className='combo-list'>
                                    {comboList}
                                </div>
                            </div>
                            <div className='dismiss'>
                                <i className='lnr lnr-cross-circle' onClick={this.removeComboGate.bind(this, gate.id)} />
                            </div>
                            <div className='right'>
                                <i className='lnr lnr-checkmark-circle' />
                            </div>
                        </div>
                    )
                }
            })

            const negativeGateExists = _.find(this.props.unsavedGates, g => g.type === constants.GATE_TYPE_NEGATIVE)

            let panelTitle
            if (this.state.selectingComboGate) {
                panelTitle = (
                    <div className='title'>
                        <div className='text'>Select Gates for New Combo Gate</div>
                        <div className='close-button'>
                            <i className='lnr lnr-cross' onClick={this.toggleSelectingComboGate.bind(this)}></i>
                        </div>
                    </div>
                )
            } else {
                panelTitle = (
                    <div className='title'>
                        <div className='text'>Gates</div>
                        <Dropdown outerClasses='dark' ref={'optionsDropdown'}>
                            <div className='inner'>
                                <div className='icon'><i className='lnr lnr-cog'></i></div>
                                <div className='menu'>
                                    <div className='menu-header'>Gating Options</div>
                                    <div className='menu-inner'>
                                        <div className='item' onClick={this.toggleSelectingComboGate.bind(this)}>
                                            <i className={'lnr lnr-link'} />                                        
                                            <div>Create Combo Gate (Include Events From Multiple Gates)</div>
                                        </div>
                                        <div className={'item clickable' + (negativeGateExists ? ' active' : '')} onClick={this.toggleCreateNegativeGate.bind(this)}>
                                            <i className={'lnr ' + (negativeGateExists ? 'lnr-checkmark-circle' : 'lnr-circle-minus')} />                                        
                                            <div>Create Negative Gate (Includes All Uncaptured Events)</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Dropdown>
                        <div className='close-button'>
                            <i className='lnr lnr-cross' onClick={this.props.api.resetUnsavedGates.bind(null)}></i>
                        </div>
                    </div>
                )
            }

            let actions

            if (this.state.selectingComboGate) {
                actions = (
                    <div className='actions'>
                        <div className={'button apply-gates' + (this.state.selectedComboGateIds.length < 2 ? ' disabled' : '')} onClick={this.createComboGate.bind(this)}>Create Combo Gate</div>
                    </div>
                )
            } else {
                actions = (
                    <div className='actions'>
                        <div className='button apply-gates' onClick={this.applyGatesClicked.bind(this)}>Apply Gates To Sample</div>
                    </div>
                )
            }

            contents = (
                <div className='unsaved-gates'>
                    {panelTitle}
                    <div className='gates'>
                        {gates}
                    </div>
                    {actions}
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
                    <div className='divider'></div>
                    <div className={'warning-message' + (this.props.gateHasChildren ? ' active' : '')}>Warning: Current gates and any sub gates will be deleted upon recalculation.</div>
                    <div className='actions'>
                        <div className='button calculate-homology' onClick={this.createGatesClicked.bind(this)}>Create Gates</div>
                    </div>
                </div>
            )
        }

        return (
            <div className={'homology-modal-outer' + (this.props.modalVisible === true ? ' active' : '')} onClick={this.modalOuterClicked.bind(this)}>
                <div className='homology-modal-inner' onClick={this.modalInnerClicked} style={{ height: 597 }}>
                    <div className='upper'>
                        <div className='title'>{this.props.selectedFCSFile.FCSParameters[this.props.modalOptions.selectedXParameterIndex].label} · {this.props.selectedFCSFile.FCSParameters[this.props.modalOptions.selectedYParameterIndex].label} - Automated gating using Persistent Homology</div>
                    </div>
                    <div className='lower'>
                        <div className='graph'>
                            <BivariatePlot 
                                gates={this.props.unsavedGates}
                                highlightedGateIds={this.state.highlightedGateIds}
                                sampleId={this.props.selectedSample.id}
                                FCSFileId={this.props.selectedFCSFile.id}
                                showGateTemplatePositions={true}
                                selectedXParameterIndex={this.props.modalOptions.selectedXParameterIndex}
                                selectedYParameterIndex={this.props.modalOptions.selectedYParameterIndex}
                                selectedXScale={this.props.selectedWorkspace.selectedXScale}
                                selectedYScale={this.props.selectedWorkspace.selectedYScale}
                                plotDisplayWidth={500}
                                plotDisplayHeight={500}
                            />
                        </div>
                        {contents}
                    </div>
                </div>
            </div>
        )
    }
}