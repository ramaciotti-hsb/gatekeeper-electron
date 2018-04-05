// -------------------------------------------------------------
// A react.js component that renders the currently open
// workspace, including the side bar of samples and the main sample
// view.
// -------------------------------------------------------------

import React from 'react'
import { Component } from 'react'
import _ from 'lodash'
import '../../scss/workspace-view.scss'
import FCSFileSelector from '../containers/fcs-file-selector-container.jsx'

export default class WorkspaceView extends Component {

    removeGateTemplate (gateTemplateId, workspaceId, event) {
        event.stopPropagation()
        this.props.api.removeGateTemplate(gateTemplateId, workspaceId)
    }

    renderSubGateTemplates (gateTemplate) {
        // Find any gate groups that refer to this gating template
        const childGroups = _.filter(this.props.workspace.gateTemplateGroups, g => g.parentGateTemplateId === gateTemplate.id)
        if (childGroups.length === 0) { return }
        return childGroups.map((childGateTemplateGroup) => {
            const childGateTemplates = _.filter(this.props.workspace.gateTemplates, gt => childGateTemplateGroup.childGateTemplateIds.includes(gt.id))
            const childrenRendered = childGateTemplates.map((childGateTemplate) => {
                return (
                    <div className={'sidebar-gate-template' + (childGateTemplate.id === this.props.workspace.selectedGateTemplateId ? ' selected' : '') + (childGateTemplate.highlighted ? ' highlighted' : '')}
                    onMouseEnter={this.props.updateGateTemplate.bind(null, childGateTemplate.id, { highlighted: true })}
                    onMouseLeave={this.props.updateGateTemplate.bind(null, childGateTemplate.id, { highlighted: false })}
                    key={childGateTemplate.id}>
                        <div className='body' onClick={this.props.api.selectGateTemplate.bind(null, childGateTemplate.id, this.props.workspace.id)}>
                            <div className='title'>{childGateTemplate.title}</div>
                            <div className='number'>{childGateTemplate.populationCount}</div>
                            <div className='remove-gate-template' onClick={this.removeGateTemplate.bind(this, childGateTemplate.id, this.props.workspace.id)}>
                                <div className={`loader-outer${childGateTemplate.loading ? ' active' : ''}`}><div className='loader'></div></div>
                                <i className='lnr lnr-cross'></i>
                            </div>
                        </div>
                        <div className='child-gate-templates'>{this.renderSubGateTemplates(childGateTemplate)}</div>
                    </div>
                )
            })

            return (
                <div className='sidebar-gate-template-group' key={childGateTemplateGroup.id}>
                    <div className='title'>
                        {childGateTemplateGroup.title}
                        <div className='show-plot' onClick={this.props.api.updateWorkspace.bind(null, this.props.workspace.id, {
                            selectedXParameterIndex: childGateTemplateGroup.selectedXParameterIndex,
                            selectedYParameterIndex: childGateTemplateGroup.selectedYParameterIndex,
                            selectedXScale: childGateTemplateGroup.selectedXScale,
                            selectedYScale: childGateTemplateGroup.selectedYScale
                        }) }>Show Plot</div>
                    </div>
                    {childrenRendered}
                </div>
            )
        })
    }

    render () {
        const workspacesGateTemplatesRendered = []

        for (let gateTemplate of this.props.workspace.gateTemplates) {
            // Start with the root sample (i.e. doesn't have a creator)
            if (!gateTemplate.creator) {
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

        const panel = <FCSFileSelector selectedFCSFile={this.props.workspace.selectedFCSFile} workspaceId={this.props.workspace.id} selectedGateTemplate={this.props.selectedGateTemplate} />

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