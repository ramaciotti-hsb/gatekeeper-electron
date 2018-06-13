// -------------------------------------------------------------
// A react.js component that renders the currently open
// workspace, including the side bar of samples and the main sample
// view.
// -------------------------------------------------------------

import React from 'react'
import { Component } from 'react'
import _ from 'lodash'
import '../../scss/workspace-view.scss'
import constants from '../lib/constants'
import FCSFileSelector from '../containers/fcs-file-selector-container.jsx'

export default class WorkspaceView extends Component {

    removeGateTemplateGroup (gateTemplateId, event) {
        event.stopPropagation()
        this.props.api.removeGateTemplateGroup(gateTemplateId)
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
                            <div className='title'><div className='text'>{childGateTemplate.title}</div></div>
                            <div className='number' style={!childGateTemplate.populationCount ? { display: 'none'} : null}>{childGateTemplate.populationCount} ({(childGateTemplate.populationCount / gateTemplate.populationCount * 100).toFixed(1)}%)</div>
                        </div>
                        <div className='child-gate-templates'>{this.renderSubGateTemplates(childGateTemplate)}</div>
                    </div>
                )
            })


            const totalEvents = childGateTemplates.reduce((accumulator, current) => {
                if (current.type === constants.GATE_TYPE_POLYGON || current.type === constants.GATE_TYPE_NEGATIVE) {
                    return accumulator + current.populationCount                    
                } else {
                    return accumulator
                }
            }, 0)
            return (
                <div className='sidebar-gate-template-group' key={childGateTemplateGroup.id}>
                    <div className='title'>
                        <div className='text'>{childGateTemplateGroup.title}</div>
                        <div className='remove-gate-template-group' onClick={this.removeGateTemplateGroup.bind(this, childGateTemplateGroup.id)}>
                            <i className='lnr lnr-cross'></i>
                        </div>
                        <div className='number' style={_.isNaN(totalEvents) ? { display: 'none'} : null}>{totalEvents} ({(totalEvents / gateTemplate.populationCount * 100).toFixed(1)}%)</div>
                    </div>
                    <div className='gate-templates'>
                        <div className={`loader-outer${childGateTemplateGroup.loading && this.props.workspace.selectedFCSFile ? ' active' : ''}`}><div className='loader small'></div></div>
                        {childrenRendered}
                    </div>
                </div>
            )
        })
    }

    render () {
        if (!this.props.workspace) {
            return (
                <div className='workspace'>
                    <div className='sidebar'>
                    </div>
                    <div className='fcs-file-selector-outer'>
                        <div className='fcs-file-selector-inner empty'>
                            <div>Use File -> New Workspace to get started.</div>
                        </div>
                    </div>
                </div>
            )
        }
        const workspacesGateTemplatesRendered = []

        for (let gateTemplate of this.props.workspace.gateTemplates) {
            // Start with the root sample (i.e. doesn't have a creator)
            if (!gateTemplate.creator) {
                workspacesGateTemplatesRendered.push((
                    <div className={'sidebar-gate-template' + (gateTemplate.id === this.props.workspace.selectedGateTemplateId ? ' selected' : '') + (gateTemplate.id === this.props.highlightedGate.childGateTemplateId ? ' highlighted' : '')} key={gateTemplate.id}>
                        <div className='body' onClick={this.props.api.selectGateTemplate.bind(null, gateTemplate.id, this.props.workspace.id)}>
                            <div className='title'>{gateTemplate.title}</div>
                            <div className='number'>{gateTemplate.populationCount} (100%)</div>
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