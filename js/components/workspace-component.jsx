// -------------------------------------------------------------
// A react.js component that renders the currently open
// workspace, including the side bar of samples and the main sample
// view.
// -------------------------------------------------------------

import React from 'react'
import { Component } from 'react'
import _ from 'lodash'
import '../../scss/workspace-view.scss'
import SampleSelector from '../containers/sample-selector-container.jsx'

export default class WorkspaceView extends Component {

    removeGateTemplate (gateTemplateId, workspaceId, event) {
        event.stopPropagation()
        this.props.api.removeGateTemplate(gateTemplateId, workspaceId)
    }

    renderSubGateTemplates (gateTemplate) {
        if (gateTemplate.childGateTemplateIds) {
            return gateTemplate.childGateTemplateIds.map((childGateTemplateId) => {
                const childGateTemplate = _.find(this.props.workspace.gateTemplates, gt => gt.id === childGateTemplateId)
                return (
                    <div className={'sidebar-gate-template' + (childGateTemplate.id === this.props.workspace.selectedGateTemplateId ? ' selected' : '') + (childGateTemplate.id === this.props.highlightedGate.childGateTemplateId ? ' highlighted' : '')}
                    onMouseEnter={this.props.updateGate.bind(null, childGateTemplate.gate.id, { highlighted: true })}
                    onMouseLeave={this.props.updateGate.bind(null, childGateTemplate.gate.id, { highlighted: false })}
                    key={childGateTemplate.id}>
                        <div className='body' onClick={this.props.api.selectGateTemplate.bind(null, childGateTemplate.id, this.props.workspace.id)}>
                            <div className='title'>{childGateTemplate.title}</div>
                            <div className='number'>{childGateTemplate.populationCount}</div>
                            <div className='remove-gate-template' onClick={this.removeGateTemplate.bind(this, childGateTemplate.id, this.props.workspace.id)}><i className='lnr lnr-cross'></i></div>
                        </div>
                        <div className='child-gate-templates'>{this.renderSubGateTemplates(childGateTemplate)}</div>
                    </div>
                )
            })
        }
    }

    render () {
        const workspacesGateTemplatesRendered = []

        for (let gateTemplate of this.props.workspace.gateTemplates) {
            // Don't render a gateTemplate here if it has a parent
            const found = _.find(this.props.workspace.gateTemplates, gt => gt.childGateTemplateIds.includes(gateTemplate.id))
            if (!found) {
                workspacesGateTemplatesRendered.push((
                    <div className={'sidebar-gate-template' + (gateTemplate.id === this.props.workspace.selectedGateTemplateId ? ' selected' : '') + (gateTemplate.id === this.props.highlightedGate.childGateTemplateId ? ' highlighted' : '')} key={gateTemplate.id}>
                        <div className='body' onClick={this.props.api.selectGateTemplate.bind(null, gateTemplate.id, this.props.workspace.id)}>
                            <div className='title'>{gateTemplate.title}</div>
                            <div className='number'>{gateTemplate.populationCount}</div>
                            <div className='remove-gate-template' onClick={this.removeGateTemplate.bind(this, gateTemplate.id, this.props.workspace.id)}><i className='lnr lnr-cross'></i></div>
                        </div>
                        <div className='child-gate-templates'>{this.renderSubGateTemplates(gateTemplate)}</div>
                    </div>
                ))
            }
        }

        const panel = <SampleSelector selectedSample={this.props.workspace.selectedSample} workspaceId={this.props.workspace.id} />

        return (
            <div className='workspace'>
                <div className='sidebar'>
                    {workspacesGateTemplatesRendered}
                </div>
                {panel}
            </div>
        )
    }
}