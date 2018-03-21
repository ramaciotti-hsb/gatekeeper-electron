import React from 'react'
import { Component } from 'react'
import _ from 'lodash'
import path from 'path'
import * as d3 from "d3"
import Dropdown from '../../lib/dropdown-inline.jsx'
import '../../../scss/sample-view.scss'
import fs from 'fs'
import uuidv4 from 'uuid/v4'
import GrahamScan from '../../lib/graham-scan.js'
import polygonsIntersect from 'polygon-overlap'
import pointInsidePolygon from 'point-in-polygon'
import { distanceToPolygon, distanceBetweenPoints } from 'distance-to-polygon'
import area from 'area-polygon'
import Gates from './sample-gates-component.jsx'
import constants from '../../lib/constants.js'
import BivariatePlot from '../../containers/bivariate-plot-container.jsx'
import { getPlotImageKey } from '../../lib/utilities'

export default class SampleView extends Component {
    
    constructor(props) {
        super(props)
        this.homologyPeaks = []
        this.state = {
            selectedXParameterIndex: this.props.selectedXParameterIndex || this.props.workspace.selectedXParameterIndex,
            selectedYParameterIndex: this.props.selectedYParameterIndex || this.props.workspace.selectedYParameterIndex,
            selectedXScale: this.props.selectedXScale || this.props.workspace.selectedXScale,
            selectedYScale: this.props.selectedYScale || this.props.workspace.selectedYScale
        }
    }

    handleDropdownSelection (dropdown, newState) {
        this.refs[dropdown].getInstance().hideDropdown()
        this.props.api.updateWorkspace(this.props.workspace.id, newState)
    }

    calculateHomology () {
        this.props.api.calculateHomology(this.props.sample.id, {
            selectedXParameterIndex: this.state.selectedXParameterIndex,
            selectedYParameterIndex: this.state.selectedYParameterIndex,
            selectedXScale: this.state.selectedXScale,
            selectedYScale: this.state.selectedYScale,
            selectedMachineType: this.props.workspace.selectedMachineType
        })
        this.refs['homologyDropdown'].getInstance().hideDropdown()
    }

    recursiveHomology () {
        this.props.api.recursiveHomology(this.props.sample.id)
        this.refs['homologyDropdown'].getInstance().hideDropdown()
    }

    showGate (gateId) {
        const gate = _.find(this.props.gates, g => g.id === gateId)
        if (this.state.selectedXParameterIndex !== gate.selectedXParameterIndex
            || this.state.selectedYParameterIndex !== gate.selectedYParameterIndex) {
            this.props.api.updateWorkspace(this.props.workspace.id, {
                selectedXParameterIndex: gate.selectedXParameterIndex,
                selectedYParameterIndex: gate.selectedYParameterIndex,
                selectedXScale: gate.selectedXScale,
                selectedYScale: gate.selectedYScale
            })
        }
    }

    render () {
        let parametersXRendered = this.props.sample.FCSParameters.map((param, index) => {
            const label = param.label || param.key
            return {
                value: label,
                component: <div className='item' onClick={this.handleDropdownSelection.bind(this, 'xParameterDropdown', { selectedXParameterIndex: index })} key={label}>{label}</div>
            }
        })
        let parametersYRendered = this.props.sample.FCSParameters.map((param, index) => {
            const label = param.label || param.key
            return {
                value: label,
                component: <div className='item' onClick={this.handleDropdownSelection.bind(this, 'yParameterDropdown', { selectedYParameterIndex: index })} key={label}>{label}</div>
            }
        })
                        

        let scales = [
            {
                id: constants.SCALE_LINEAR,
                label: 'Linear'
            }, 
            {
                id: constants.SCALE_LOG,
                label: 'Log'
            },
            {
                id: constants.SCALE_BIEXP,
                label: 'Biexp'
            },
            {
                id: constants.SCALE_ARCSIN,
                label: 'Arcsin'
            }
        ]

        let scalesXRendered = scales.map((scale) => {
            return {
                value: scale.label,
                component: <div className='item' onClick={this.handleDropdownSelection.bind(this, 'xScaleDropdown', { selectedXScale: scale.id })} key={scale.id}>{scale.label}</div>
            }
        })

        let scalesYRendered = scales.map((scale) => {
            return {
                value: scale.label,
                component: <div className='item' onClick={this.handleDropdownSelection.bind(this, 'yScaleDropdown', { selectedYScale: scale.id })} key={scale.id}>{scale.label}</div>
            }
        })

        const autoGates = [
            {
                value: 'persistent-homology',
                component: <div className='item' onClick={this.calculateHomology.bind(this)} key={'persistent-homology'}>Persistent Homology - Current parameters</div>
            },
            {
                value: 'recursive-homology',
                component: <div className='item' onClick={this.recursiveHomology.bind(this)} key={'recursive-homology'}>Persistent Homology - All parameter combinations</div>
            }
        ]

        let upperTitle
        if (this.props.gateTemplate.parentId) {
            upperTitle = <div className='upper'>Subsample of<a onClick={this.props.api.selectSample.bind(null, this.props.sample.parentId, this.props.workspace.id)}>{this.props.sample.parentTitle}</a></div>
        } else {
            upperTitle = <div className='upper'>Root Gate</div>
        }

        const xParamLabel = this.props.sample.FCSParameters.length > 0 ? this.props.sample.FCSParameters[this.state.selectedXParameterIndex].label || this.props.sample.FCSParameters[this.state.selectedXParameterIndex].key : 'Parameter ' + this.state.selectedXParameterIndex
        const yParamLabel = this.props.sample.FCSParameters.length > 0 ? this.props.sample.FCSParameters[this.state.selectedYParameterIndex].label || this.props.sample.FCSParameters[this.state.selectedYParameterIndex].key : 'Parameter ' + this.state.selectedYParameterIndex

        return (
            <div className='panel sample'>
                <div className={`loader-outer${this.props.sample.loading ? ' active' : ''}`}><div className='loader'></div><div className='text'>{this.props.sample.loadingMessage}</div></div>
                <div className='panel-inner'>
                    <div className='header'>
                        {upperTitle}
                        <div className='lower'>
                            <div className='title'>{this.props.gateTemplate.title}</div>
                        </div>
                    </div>
                    <div className='graph'>
                        <div className='graph-upper'>
                            <div className='axis-selection y'>
                                <Dropdown items={parametersYRendered} textLabel={yParamLabel} ref={'yParameterDropdown'} />
                                <Dropdown items={scalesYRendered} textLabel={scales[_.findIndex(scales, s => s.id === this.state.selectedYScale)].label} outerClasses={'scale'} ref={'yScaleDropdown'} />
                            </div>
                            <BivariatePlot sampleId={this.props.sample.id} />
                        </div>
                        <div className='axis-selection x'>
                            <Dropdown items={parametersXRendered} textLabel={xParamLabel} ref={'xParameterDropdown'} />
                            <Dropdown items={scalesXRendered} textLabel={scales[_.findIndex(scales, s => s.id === this.state.selectedXScale)].label} outerClasses={'scale'} ref={'xScaleDropdown'} />
                        </div>
                    </div>
                    <div className='header gates'>
                        <div className='lower'>Gates <Dropdown items={autoGates} textLabel={'Auto Gate...'} ref='homologyDropdown' /></div>
                    </div>
                    <Gates gates={this.props.gates} subSamples={this.props.sample.subSamples} sample={this.props.sample} workspace={this.props.workspace} gateTemplates={this.props.gateTemplates} updateGateTemplate={this.props.updateGateTemplate} showGate={this.showGate.bind(this)} graphWidth={600} graphHeight={460} />
                </div>
            </div>
        )
    }
}