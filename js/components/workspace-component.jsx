// -------------------------------------------------------------
// A react.js component that renders the currently open
// workspace, including the side bar of samples and the main sample
// view.
// -------------------------------------------------------------

import React from 'react'
import { Component } from 'react'
import _ from 'lodash'
import '../../scss/workspace-view.scss'
import SampleView from '../containers/sample-view-container.jsx'

export default class WorkspaceView extends Component {

    removeSample (sampleId, workspaceId, event) {
        event.stopPropagation()
        this.props.api.removeSample(sampleId, workspaceId)
    }

    renderSubSamples (sample) {
        if (sample.subSampleIds) {
            return sample.subSampleIds.map((subSampleId) => {
                const subSample = _.find(this.props.workspace.samples, s => s.id === subSampleId)
                return (
                    <div className={'sidebar-sample' + (subSample.id === this.props.workspace.selectedSampleId ? ' selected' : '') + (subSample.id === this.props.highlightedGate.childSampleId ? ' highlighted' : '')} key={subSample.id}>
                        <div className='body' onClick={this.props.api.selectSample.bind(null, subSample.id, this.props.workspace.id)}>
                            <div className='title'>{subSample.title}</div>
                            <div className='remove-sample' onClick={this.removeSample.bind(this, subSample.id, this.props.workspace.id)}><i className='lnr lnr-cross'></i></div>
                        </div>
                        <div className='sub-samples'>{this.renderSubSamples(subSample)}</div>
                    </div>
                )
            })
        }
    }

    render () {
        const workspacesSamplesRendered = []

        for (let sample of this.props.workspace.samples) {
            // Don't render a sample here if it has a parent
            const found = _.find(this.props.workspace.samples, s => s.subSampleIds.includes(sample.id))
            if (!found) {
                workspacesSamplesRendered.push((
                    <div className={'sidebar-sample' + (sample.id === this.props.workspace.selectedSampleId ? ' selected' : '') + (sample.id === this.props.highlightedGate.childSampleId ? ' highlighted' : '')} key={sample.id}>
                        <div className='body' onClick={this.props.api.selectSample.bind(null, sample.id, this.props.workspace.id)}>
                            <div className='title'>{sample.title}</div>
                            <div className='remove-sample' onClick={this.removeSample.bind(this, sample.id, this.props.workspace.id)}><i className='lnr lnr-cross'></i></div>
                        </div>
                        <div className='sub-samples'>{this.renderSubSamples(sample)}</div>
                    </div>
                ))
            }
        }

        let panel = <div className='panel'></div>

        if (this.props.workspace.selectedSample) {
            panel = <SampleView sampleId={this.props.workspace.selectedSample.id} />
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