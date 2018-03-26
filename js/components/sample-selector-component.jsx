import React from 'react'
import { Component } from 'react'
import _ from 'lodash'
import Dropdown from '../lib/dropdown-inline.jsx'
import constants from '../lib/constants'
import MultipleSampleView from '../containers/multiple-sample-view-container.jsx'

export default class SampleSelector extends Component {
    
    constructor(props) {
        super(props)
        this.state = {}
    }

    selectSample (sampleId) {
        this.refs['sampleDropdown'].getInstance().hideDropdown()
        this.props.api.selectSample(sampleId, this.props.workspaceId)   
    }

    render () {
        let inner

        if (this.props.samples.length > 0) {
            let multipleSampleView
            if (this.props.selectedSample) {
                multipleSampleView = <MultipleSampleView sampleId={this.props.selectedSample.id} />
            }

            const samples = _.filter(this.props.samples, s => !_.find(this.props.samples, parent => parent.subSampleIds.includes(s.id))).map((sample) => {
                return {
                    value: sample.title,
                    component: <div className='item' onClick={this.selectSample.bind(this, sample.id, this.props.workspaceId)} key={sample.id}>{sample.title}</div>
                }
            })

            inner = (
                <div className='sample-selector-inner'>
                    <div className='header'>
                        <div className='sample-selector-dropdown'><Dropdown items={samples} textLabel={this.props.selectedSample ? this.props.selectedSample.title : 'Select Sample'} ref='sampleDropdown' /></div>
                    </div>
                    {multipleSampleView}
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