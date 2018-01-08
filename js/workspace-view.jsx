// -------------------------------------------------------------
// A react.js component that renders the currently open
// workspace, including the side bar of samples and the main sample
// view.
// -------------------------------------------------------------

import React from 'react'
import ReactDOM from 'react-dom'
import { Component } from 'react'
import _ from 'lodash'
import '../scss/workspace-view.scss'
import SampleView from './sample-view.jsx'
import sessionHelper from './session-helper.js'

export default class WorkspaceView extends Component {

    constructor (props) {
        super(props)
        this.state = {
            selectedSampleId: this.props.selectedSampleId, // Can be undefined
            samples: this.props.samples
        }
    }

    selectSample (sampleId) {
        this.setState({
            selectedSampleId: sampleId
        }, () => { sessionHelper.saveSessionStateToDisk() })
    }

    removeSample (sampleId) {
        let sampleIndex = _.findIndex(this.state.samples, (sample) => {
            return sample.id === sampleId
        })

        if (sampleIndex === -1) { return }
        this.state.samples.splice(sampleIndex, 1)
        if (sampleIndex === this.state.samples.length) {
            sampleIndex--
        }
        // If there are still any samples left in the workspace, select the next one
        if (sampleIndex >= 0) {
            this.setState({
                samples: this.state.samples,
                selectedSampleId: this.state.samples[sampleIndex].id
            })
        }
    }

    // Roll up the data that needs to be saved from this object and any children
    getDataRepresentation () {
        for (let i = 0; i < this.state.samples.length; i++) {
            let sample = this.state.samples[i]
            const sampleComponent = this.refs['sample-' + sample.id]
            if (sampleComponent) {
                this.state.samples[i] = sampleComponent.getDataRepresentation()
            }
        }
        return {
            id: this.props.id,
            title: this.props.title,
            samples: this.state.samples,
            selectedSampleId: this.state.selectedSampleId
        }
    }

    render () {
        const workspacesSamplesRendered = this.state.samples.map((sample, index) => {
            return (
                <div className={'sidebar-sample' + (sample.id === this.state.selectedSampleId ? ' selected' : '')} key={index} onClick={this.selectSample.bind(this, sample.id)}>
                    <div className='body'>
                        <div className='title'>{sample.title}</div>
                        <div className='description'>{sample.description}</div>
                    </div>
                </div>
            )
        })

        const sample = _.find(this.state.samples, (sample) => {
            return sample.id === this.state.selectedSampleId
        })

        let panel = <div className='panel'></div>

        if (sample) {
            if (sample.type === 'sample') {
                panel = <SampleView ref={'sample-' + sample.id} {...sample} />
            }
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