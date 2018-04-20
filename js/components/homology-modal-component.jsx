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
    
    constructor(props) {
        super(props)
        this.state = {
            edgeDistance: this.props.plotWidth * 0.05,
            minPeakHeight: this.props.plotWidth * 0.04,
            minPeakSize: 5000
        }
    }

    modalOuterClicked(event) {
        this.props.updateModalParameters('homology', { visible: false })
    }

    modalInnerClicked(event) {
        event.stopPropagation()
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
            minPeakSize: this.state.minPeakSize
        })
        this.props.updateModalParameters('homology', { visible: false })
    }

    selectFCSFile (FCSFileId) {
        this.refs['FCSFileDropdown'].getInstance().hideDropdown()
        this.props.api.selectFCSFile(FCSFileId, this.props.workspaceId)   
    }

    render () {
        // let inner

        // if (this.props.FCSFiles.length > 0) {
        //     let multipleSampleView
        //     if (this.props.selectedFCSFile && this.props.selectedSample) {
        //         multipleSampleView = <MultipleSampleView FCSFileId={this.props.selectedFCSFile.id} sampleId={this.props.selectedSample.id} />
        //     }

        //     const FCSFiles = this.props.FCSFiles.map((FCSFile) => {
        //         return {
        //             value: FCSFile.title,
        //             component: <div className='item' onClick={this.selectFCSFile.bind(this, FCSFile.id, this.props.workspaceId)} key={FCSFile.id}>{FCSFile.title}</div>
        //         }
        //     })

        //     inner = (
        //         <div className='fcs-file-selector-inner'>
        //             <div className='header'>
        //                 <div className='fcs-file-selector-dropdown'><Dropdown items={FCSFiles} textLabel={this.props.selectedFCSFile ? this.props.selectedFCSFile.title : 'Select FCSFile'} ref='FCSFileDropdown' /></div>
        //                 <div className='button'><i className='lnr lnr-cross-circle' onClick={this.props.api.removeFCSFile.bind(null, this.props.selectedFCSFile.id)}></i>Remove File From Workspace</div>
        //             </div>
        //             {multipleSampleView}
        //         </div>
        //     )
        // } else {
        //     inner = (
        //         <div className='fcs-file-selector-inner empty'>
        //             <div>Use File -> Add FCS Files to workspace to add an FCSFile.</div>
        //         </div>
        //     )
        // }

        if (!this.props.selectedSample.id) {
            return <div></div>
        }

        return (
            <div className={'homology-modal-outer' + (this.props.modalVisible === true ? ' active' : '')} onClick={this.modalOuterClicked.bind(this)}>
                <div className='homology-modal-inner' onClick={this.modalInnerClicked} style={{ height: this.props.plotHeight + 100 }}>
                    <div className='upper'>
                        <div className='title'>Automated gating using Persistent Homology</div>
                    </div>
                    <div className='lower'>
                        <div className='graph'>
                            <BivariatePlot sampleId={this.props.selectedSample.id} FCSFileId={this.props.selectedFCSFile.id} selectedXParameterIndex={this.props.modalOptions.selectedXParameterIndex} selectedYParameterIndex={this.props.modalOptions.selectedYParameterIndex} selectedXScale={this.props.selectedWorkspace.selectedXScale} selectedYScale={this.props.selectedWorkspace.selectedYScale} />
                        </div>
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
                            <div className='divider'></div>
                            <div className='actions'>
                                <div className='calculate-homology' onClick={this.createGatesClicked.bind(this)}>Create Gates</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )
    }
}