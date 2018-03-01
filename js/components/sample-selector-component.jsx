import React from 'react'
import { Component } from 'react'
import _ from 'lodash'
import Dropdown from '../lib/dropdown-inline.jsx'
import constants from '../lib/constants'
import SampleView from '../containers/sample-view-container.jsx'

export default class SampleSelector extends Component {
    
    constructor(props) {
        super(props)
        this.state = {}
    }

    handleDropdownSelection (dropdown, newState) {
        this.refs[dropdown].getInstance().hideDropdown()
        this.props.api.updateSample(this.props.sample.id, newState)
    }

    selectSample (sampleId) {
        this.refs['sampleDropdown'].getInstance().hideDropdown()
        this.props.api.selectSample(sampleId, this.props.workspaceId)   
    }

    render () {
        let inner

        const machineTypes = [
            {
                id: constants.MACHINE_CYTOF,
                label: 'Mass Cytometry'
            },
            {
                id: constants.MACHINE_FLORESCENT,
                label: 'Florescent'
            },
        ]
        let machineTypesRendered = machineTypes.map((param, index) => {
            return {
                value: param.label,
                component: <div className='item' onClick={this.handleDropdownSelection.bind(this, 'machineTypeDropdown', { selectedMachineType: param.id })} key={param.label}>{param.label}</div>
            }
        })

        if (this.props.samples.length > 0) {
            let sampleView
            if (this.props.selectedSample) {
                sampleView = <SampleView sampleId={this.props.selectedSample.id} />
            }

            const samples = this.props.samples.map((sample) => {
                return {
                    value: sample.title,
                    component: <div className='item' onClick={this.selectSample.bind(this, sample.id, this.props.workspaceId)} key={sample.id}>{sample.title}</div>
                }
            })

            inner = (
                <div className='sample-selector-inner'>
                    <div className='header'>
                        <div className='sample-selector-dropdown'><Dropdown items={samples} textLabel={this.props.selectedSample ? this.props.selectedSample.title : 'Select Sample'} ref='sampleDropdown' /></div>
                        <Dropdown items={machineTypesRendered} textLabel={_.find(machineTypes, m => m.id === this.props.selectedSample.selectedMachineType).label} ref={'machineTypeDropdown'} />
                    </div>
                    {sampleView}
                </div>
            )
        } else {
            inner = (
                <div className='sample-selector-inner empty'>
                    <div>Use File -> Add FCS Files to workspace to add a sample.</div>
                </div>
            )
        }

        return (
            <div className='sample-selector-outer'>
                {inner}
            </div>
        )
    }
}