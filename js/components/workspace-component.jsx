// -------------------------------------------------------------
// A react.js component that renders the currently open
// workspace, including the side bar of samples and the main sample
// view.
// -------------------------------------------------------------

import React from 'react'
import ReactDOM from 'react-dom'
import { Component } from 'react'
import _ from 'lodash'
import '../../scss/workspace-view.scss'
import SampleView from '../containers/sample-view-container.jsx'

export default class WorkspaceView extends Component {

    removeSample (sampleId, workspaceId, event) {
        event.stopPropagation()
        this.props.removeSample(sampleId, workspaceId)
    }

    renderSubSamples (sample) {
        if (sample.subSamples) {
            return sample.subSamples.map((subSample) => {
                return (
                    <div className={'sidebar-sample' + (subSample.id === this.props.selectedSampleId ? ' selected' : '')} key={subSample.id}>
                        <div className='body' onClick={this.props.selectSample.bind(null, subSample.id, this.props.id)}>
                            <div className='title'>{subSample.title}</div>
                            <div className='remove-sample' onClick={this.removeSample.bind(this, subSample.id, this.props.id)}><i className='lnr lnr-cross'></i></div>
                        </div>
                        <div className='sub-samples'>{this.renderSubSamples(subSample)}</div>
                    </div>
                )
            })
        }
    }

    render () {
        const workspacesSamplesRendered = this.props.samples.map((sample) => {
            return (
                <div className={'sidebar-sample' + (sample.id === this.props.selectedSampleId ? ' selected' : '')} key={sample.id}>
                    <div className='body' onClick={this.props.selectSample.bind(null, sample.id, this.props.id)}>
                        <div className='title'>{sample.title}</div>
                        <div className='remove-sample' onClick={this.removeSample.bind(this, sample.id, this.props.id)}><i className='lnr lnr-cross'></i></div>
                    </div>
                    <div className='sub-samples'>{this.renderSubSamples(sample)}</div>
                </div>
            )
        })

        let panel = <div className='panel'></div>

        if (this.props.selectedSample) {
            panel = <SampleView sampleId={this.props.selectedSample.id} />
        }
        return (
            <div className='workspace'>
                <div className='sidebar'>
                    {workspacesSamplesRendered}
                </div>
                {panel}
            </div>
        )
    }
}