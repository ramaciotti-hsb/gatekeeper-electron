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
import persistentHomology from '../../lib/persistent-homology.js'
import Gates from './sample-gates-component.jsx'
import constants from '../../lib/constants.js'
import BivariatePlot from '../../containers/bivariate-plot-container.jsx'
import { getFCSFileFromPath } from '../../data-access/electron/data-access.js'
import { getImageForPlot, initializeSampleData } from '../../data-access/electron/data-access.js'
import { getPlotImageKey } from '../../lib/utilities'

export default class SampleView extends Component {
    
    constructor(props) {
        super(props)
        this.homologyPeaks = []
        this.state = {}
    }

    calculateHomology () {
        persistentHomology(this.state.densityMap).then((truePeaks) => {
            for (let peak of truePeaks) {
                const includeEventIds = []
                for (let i = 0; i < FCSFile.dataAsNumbers.length; i++) {
                    if (pointInsidePolygon([FCSFile.dataAsNumbers[i][this.props.sample.selectedXParameterIndex], FCSFile.dataAsNumbers[i][this.props.sample.selectedYParameterIndex]], peak.polygon)) {
                        includeEventIds.push(point.data)
                    }
                }

                this.state.subSamples.push({
                    id: uuidv4(),
                    title: 'Subsample',
                    description: 'Subsample',
                    type: 'gate',
                    gate: {
                        type: constants.GATE_POLYGON,
                        polygon: peak.polygon,
                        selectedXParameterIndex: this.props.sample.selectedXParameterIndex,
                        selectedYParameterIndex: this.props.sample.selectedYParameterIndex
                    },
                    includeEventIds,
                    selectedXParameterIndex: this.selectedXParameterIndex,
                    selectedYParameterIndex: this.selectedYParameterIndex,
                    selectedXScale: this.selectedXScale,
                    selectedYScale: this.selectedYScale
                })
            }

            this.redrawGraph()
        })
    }

    handleDropdownSelection (dropdown, newState) {
        this.refs[dropdown].getInstance().hideDropdown()
        this.props.api.updateSample(this.props.sample.id, newState)
    }

    showGate (gateId) {
        const gate = _.find(this.props.gates, g => g.id === gateId)
        if (this.props.sample.selectedXParameterIndex !== gate.selectedXParameterIndex
            || this.props.sample.selectedYParameterIndex !== gate.selectedYParameterIndex) {
            this.props.api.updateSample(this.props.sample.id, {
                selectedXParameterIndex: gate.selectedXParameterIndex,
                selectedYParameterIndex: gate.selectedYParameterIndex,
                selectedXScale: gate.selectedXScale,
                selectedYScale: gate.selectedYScale
            })
        }
    }

    render () {
        let parametersXRendered = this.props.sample.FCSParameters.map((param, index) => {
            return {
                value: param.key,
                component: <div className='item' onClick={this.handleDropdownSelection.bind(this, 'xParameterDropdown', { selectedXParameterIndex: index })} key={param.key}>{param.key}</div>
            }
        })
        let parametersYRendered = this.props.sample.FCSParameters.map((param, index) => {
            return {
                value: param.key,
                component: <div className='item' onClick={this.handleDropdownSelection.bind(this, 'yParameterDropdown', { selectedYParameterIndex: index })} key={param.key}>{param.key}</div>
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
                component: <div className='item' onClick={this.calculateHomology.bind(this)} key={'persistent-homology'}>Persistent Homology</div>
            }
        ]

        let upperTitle
        if (this.props.sample.parentId) {
            upperTitle = <div className='upper'>Subsample of<a onClick={this.props.api.selectSample.bind(null, this.props.sample.parentId, this.props.workspaceId)}>{this.props.sample.parentTitle}</a></div>
        } else {
            upperTitle = <div className='upper'>Root Sample</div>
        }

        return (
            <div className='panel sample'>
                <div className='panel-inner'>
                    <div className='header'>
                        <div className='upper'>{upperTitle}</div>
                        <div className='lower'>{this.props.sample.title}</div>
                    </div>
                    <div className='graph'>
                        <div className='graph-upper'>
                            <div className='axis-selection y'>
                                <Dropdown items={parametersYRendered} textLabel={this.props.sample.FCSParameters[this.props.sample.selectedYParameterIndex].key} ref={'yParameterDropdown'} />
                                <Dropdown items={scalesYRendered} textLabel={scales[_.findIndex(scales, s => s.id === this.props.sample.selectedYScale)].label} outerClasses={'scale'} ref={'yScaleDropdown'} />
                            </div>
                            <BivariatePlot sampleId={this.props.sample.id} />
                        </div>
                        <div className='axis-selection x'>
                            <Dropdown items={parametersXRendered} textLabel={this.props.sample.FCSParameters[this.props.sample.selectedXParameterIndex].key} ref={'xParameterDropdown'} />
                            <Dropdown items={scalesXRendered} textLabel={scales[_.findIndex(scales, s => s.id === this.props.sample.selectedXScale)].label} outerClasses={'scale'} ref={'xScaleDropdown'} />
                        </div>
                    </div>
                    <div className='header gates'>
                        <div className='lower'>Gates <Dropdown items={autoGates} textLabel={'Auto Gate...'} /></div>
                    </div>
                    <Gates gates={this.props.gates} subSamples={this.props.sample.subSamples} sample={this.props.sample} updateGate={this.props.updateGate} showGate={this.showGate.bind(this)} graphWidth={600} graphHeight={460} />
                </div>
            </div>
        )
    }
}