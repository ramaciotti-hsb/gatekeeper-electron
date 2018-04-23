// -------------------------------------------------------------------------
// React component for rendering gates that create subsamples.
// -------------------------------------------------------------------------

import React from 'react'
import ReactDOM from 'react-dom'
import { Component } from 'react'
import _ from 'lodash'
import constants from '../../lib/constants'
import pointInsidePolygon from 'point-in-polygon'
import { heatMapHSLStringForValue, getScales, getPlotImageKey } from '../../lib/utilities.js'
import BivariatePlot from '../../containers/bivariate-plot-container.jsx'
import Dropdown from '../../lib/dropdown.jsx'
import '../../../scss/sample-view/sample-gates.scss'

export default class MultipleSampleView extends Component {

    constructor (props) {
        super(props)

        this.state = {
            plotWidthString: props.plotDisplayWidth,
            plotHeightString: props.plotDisplayHeight,
            filterPlotString: '',
            combinations: [],
            flippedCombinations: [],
            scrollTop: 0,
            containerWidth: 1000
        };

        this.state.combinations = this.filterPlots()
    }

    updateContainerSize () {
        this.setState({ containerWidth: this.refs.panel.offsetWidth })
    }

    componentDidMount () {
        this.updateContainerSize()
        this.resizeFunction = _.debounce(this.updateContainerSize.bind(this), 100)
        window.addEventListener('resize', this.resizeFunction)
    }

    componentWillUnmount () {
        window.removeEventListener('resize', this.resizeFunction)
    }

    updatePlotDisplayWidth (event) {
        this.setState({
            plotWidthString: event.target.value
        })
    }

    updatePlotDisplayHeight (event) {
        this.setState({
            plotHeightString: event.target.value
        })
    }

    setPlotDimensions () {
        const plotWidth = Math.max(Math.min(parseInt(this.state.plotWidthString, 10), 1000), 0)
        const plotHeight = Math.max(Math.min(parseInt(this.state.plotHeightString, 10), 1000), 0)
        if (!_.isNaN(plotWidth) && !_.isNaN(plotHeight)) {
            this.props.api.setPlotDisplayDimensions(plotWidth, plotHeight).then(() => {
                this.setState({
                    plotWidthString: this.props.plotDisplayWidth,
                    plotHeightString: this.props.plotDisplayHeight
                })
            })
        }
    }

    calculateHomology (selectedXParameterIndex, selectedYParameterIndex) {
        this.props.updateModalParameters('homology', { visible: true, selectedXParameterIndex, selectedYParameterIndex })
        // this.refs['homologyDropdown-' + selectedXParameterIndex + '-' + selectedYParameterIndex].getInstance().hideDropdown()
    }

    matchLabels(xLabel, yLabel, matchString) {
        let matched = true

        // If the match string has no spaces, match both labels
        if (!matchString.match(' ')) {
            matched = xLabel.toLowerCase().match(matchString.toLowerCase()) || yLabel.toLowerCase().match(matchString.toLowerCase())
        } else {
            // Otherwise match all tokens against the combined string
            for (let token of matchString.split(' ')) {
                const combined = xLabel.toLowerCase() + yLabel.toLowerCase()
                if (!combined.match(token.toLowerCase())) {
                    matched = false
                }
            }
        }

        return matched
    }

    updateFilterPlotString (event) {
        const filterString = event.target.value

        this.setState({
            filterPlotString: filterString
        }, () => {
            this.setState({
                combinations: this.filterPlots()
            })
        })
    }

    filterPlots () {
        const combinations = []
        for (let x = 0; x < this.props.FCSFile.FCSParameters.length; x++) {
            // Don't bother displaying the plot if the parameter is disabled
            if (this.props.workspace.disabledParameters[this.props.FCSFile.FCSParameters[x].key]) { continue }
            for (let y = x + 1; y < this.props.FCSFile.FCSParameters.length; y++) {
                if (this.props.workspace.disabledParameters[this.props.FCSFile.FCSParameters[y].key]) { continue }

                if (this.matchLabels(this.props.FCSFile.FCSParameters[x].label, this.props.FCSFile.FCSParameters[y].label, this.state.filterPlotString)) {

                    let shouldAdd = true
                    if (this.props.workspace.hideUngatedPlots) {
                        if (!_.find(this.props.gates, g => g.selectedXParameterIndex === x && g.selectedYParameterIndex === y)) {
                            shouldAdd = false 
                        }
                    }

                    if (shouldAdd) {
                        const x2 = Math.min(x, y)
                        const y2 = Math.max(x, y)
                        if (this.props.workspace.invertedAxisPlots[x2 + '_' + y2]) {
                            combinations.push([y, x])
                        } else {
                            combinations.push([x, y])
                        }
                    }
                }
            }
        }

        // If the user has filtered down to less than 4 combinations, try and generate these images of interest first
        if (combinations.length < 4) {
            for (let c of combinations) {
                this.props.api.getImageForPlot(this.props.sample.id, { selectedXParameterIndex: c[0], selectedYParameterIndex: c[1], selectedXScale: this.props.workspace.selectedXScale, selectedYScale: this.props.workspace.selectedYScale, machineType: this.props.FCSFile.machineType }, true)
            }
        }

        return combinations
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

    componentDidUpdate (prevProps) {
        if (!this.props.sample) {
            return
        }

        let shouldReset = false
        if (!prevProps.sample) {
            shouldReset = true
        } else if (this.props.sample.id !== prevProps.sample.id) {
            shouldReset = true
        } else if (this.props.workspace.hideUngatedPlots !== prevProps.workspace.hideUngatedPlots) {
            shouldReset = true
        } else if (this.props.workspace.invertedAxisPlots !== prevProps.workspace.invertedAxisPlots) {
            shouldReset = true
        } else if (this.props.FCSFile.FCSParameters.length !== prevProps.FCSFile.FCSParameters.length) {
            shouldReset = true
        } else if (this.props.workspace.selectedXParameterIndex != prevProps.workspace.selectedXParameterIndex) {
            shouldReset = true
        } else if (this.props.workspace.selectedYParameterIndex != prevProps.workspace.selectedYParameterIndex) {
            shouldReset = true
        } else if (!_.isEqual(prevProps.workspace.disabledParameters, this.props.workspace.disabledParameters)) {
            shouldReset = true
        }

        if (shouldReset) {
            this.setState({
                combinations: this.filterPlots()
            })
        }
    }

    render () {
        if (!this.props.sample) {
            return <div className='panel sample' ref='panel'><div className='loader-outer active'><div className='loader'></div><div className='text'>Loading FCS File Metadata</div></div></div>
        }

        const plotsPerRow = Math.floor(this.state.containerWidth / (this.props.plotDisplayWidth + 130))

        // Group gates into the 2d parameters that they use
        const gateGroups = {}
        let plots = []

        for (let gate of this.props.gates) {
            const key = `${gate.selectedXParameterIndex}_${gate.selectedYParameterIndex}`

            if (!gateGroups[key]) {
                gateGroups[key] = {
                    label: this.props.FCSFile.FCSParameters[gate.selectedXParameterIndex].label + ' · ' + this.props.FCSFile.FCSParameters[gate.selectedYParameterIndex].label,
                    selectedXParameterIndex: gate.selectedXParameterIndex,
                    selectedYParameterIndex: gate.selectedYParameterIndex,
                    gates: []
                }
            }

            gateGroups[key].gates.push(gate)
        }

        const gateGroupsRendered = _.keys(gateGroups).map((key) => {
            const gateGroup = gateGroups[key]

            const autoGates = [
                {
                    value: 'persistent-homology',
                    component: <div className='item' onClick={this.calculateHomology.bind(this)} key={'persistent-homology'}>Persistent Homology</div>
                }
            ]

            return (
                <div className='gate-group' key={key}>
                    <div className='upper'>
                        <div className='selected-parameters'>{gateGroup.label}</div>
                        <Dropdown items={autoGates} textLabel={'Auto Gate...'} ref='homologyDropdown' />
                    </div>
                    <div className='graph'>
                        {/*gates*/}
                        <BivariatePlot sampleId={this.props.sample.id} selectedXParameterIndex={gateGroup.selectedXParameterIndex} selectedYParameterIndex={gateGroup.selectedYParameterIndex} />
                    </div>
                </div>
            )
        })

        let upperTitle
        if (this.props.gateTemplateGroup && this.props.gateTemplateGroup.parentGateTemplateId) {
            upperTitle = <div className='upper'>Subsample of<a onClick={this.props.api.selectGateTemplate.bind(null, this.props.gateTemplateGroup.parentGateTemplateId, this.props.workspace.id)}>{this.props.parentGateTitle}</a></div>
        } else {
            upperTitle = <div className='upper'>Root Gate</div>
        }

        const minIndex = Math.max(0, (Math.floor(this.state.scrollTop / (this.props.plotDisplayHeight + 115)) - 3) * plotsPerRow)
        const maxIndex = Math.min(this.state.combinations.length, (Math.floor(this.state.scrollTop / (this.props.plotDisplayHeight + 115)) + 4) * plotsPerRow)

        const gates = this.state.combinations.slice(minIndex, maxIndex).map((c, index) => {
            if (!this.props.FCSFile.FCSParameters || this.props.FCSFile.FCSParameters.length === 0 || index >= this.state.combinations.length) {
                return null
            }

            const realIndex = index + minIndex

            const x = Math.min(c[0], c[1])
            const y = Math.max(c[0], c[1])

            return (
                <div className='gate-group' key={x + '_' + y} style={{ position: 'absolute', top: (Math.floor(realIndex / plotsPerRow)) * (this.props.plotDisplayHeight + 115), left: (realIndex % plotsPerRow) * (this.props.plotDisplayWidth + 130) }}>
                    <div className='upper'>
                        <div className='selected-parameters'>
                            {this.props.FCSFile.FCSParameters[c[0]].label + ' · ' + this.props.FCSFile.FCSParameters[c[1]].label}
                            <div className={'icon' + (this.props.workspace.invertedAxisPlots[x + '_' + y] ? ' active' : '')} onClick={this.props.api.invertPlotAxis.bind(null, this.props.workspace.id, c[0], c[1])}><i className='lnr lnr-sync'></i></div>
                        </div>
                        <Dropdown outerClasses='dark' ref={'homologyDropdown-' + c[0] + '-' + c[1]}>
                            <div className='inner'>
                                <div className='icon'><i className='lnr lnr-cog'></i></div>
                                <div className='menu'>
                                    <div className='menu-header'>Auto Gating</div>
                                    <div className='menu-inner'>
                                        <div className='item' onClick={this.calculateHomology.bind(this, c[0], c[1])}><div>Persistent Homology</div></div>
                                        <div className='item' onClick={this.calculateHomology.bind(this, c[0], c[1])}><div>Persistent Homology (Recursive)</div></div>
                                    </div>
                                </div>
                            </div>
                        </Dropdown>
                    </div>
                    <div className='graph'>
                        <BivariatePlot sampleId={this.props.sample.id} FCSFileId={this.props.FCSFile.id} selectedXParameterIndex={c[0]} selectedYParameterIndex={c[1]} selectedXScale={this.props.workspace.selectedXScale} selectedYScale={this.props.workspace.selectedYScale} />
                    </div>
                </div>
            )
        })
        return (
            <div className='panel sample' ref='panel'>
                <div className={`loader-outer${this.props.sample.loading ? ' active' : ''}`}><div className='loader'></div><div className='text'>{this.props.sample.loadingMessage}</div></div>
                <div className='panel-inner' ref='panelInner'>
                    <div className='header'>
                        {upperTitle}
                        <div className='lower'>
                            <div className='title'>{this.props.gateTemplate.title}</div>
                            <div className='counts'><abbr className='highlight'>{this.props.sample.populationCount}</abbr> events {/*(<abbr className='highlight'>50%</abbr> of parent)*/}</div>
                        </div>
                    </div>
                    <div className='filters'>
                        <input type='text' placeholder='Filter Plots...' value={this.state.filterPlotString} onChange={this.updateFilterPlotString.bind(this)} />
                        <div className={'hide-ungated' + (this.props.workspace.hideUngatedPlots ? ' active' : '')} onClick={this.props.api.updateWorkspace.bind(null, this.props.workspace.id, { hideUngatedPlots: !this.props.workspace.hideUngatedPlots })}><i className={'lnr ' + (this.props.workspace.hideUngatedPlots ? 'lnr-checkmark-circle' : 'lnr-circle-minus')} />Hide Ungated Plots</div>
                        <div className='dimensions plot-width'>
                            <div className='text'>Plot Dimensions: </div>
                            <input type='text' value={this.state.plotWidthString || this.props.plotDisplayWidth} onChange={this.updatePlotDisplayWidth.bind(this)} onBlur={this.setPlotDimensions.bind(this)} onKeyPress={(event) => { event.key === 'Enter' && event.target.blur() }} />
                            <input type='text' value={this.state.plotHeightString || this.props.plotDisplayHeight} onChange={this.updatePlotDisplayHeight.bind(this)} onBlur={this.setPlotDimensions.bind(this)} onKeyPress={(event) => { event.key === 'Enter' && event.target.blur() }} />
                        </div>
                    </div>
                    <div className='gates' onScroll={(e) => { if (Math.abs(e.target.scrollTop - this.state.scrollTop) > (this.props.plotDisplayHeight + 115) * 2) { this.setState({ scrollTop: e.target.scrollTop }) } } } ref="gates">
                        <div className='gates-inner' style={{ position: 'relative', height: Math.floor((this.state.combinations.length / plotsPerRow) * (this.props.plotDisplayHeight + 115)) }}>
                            {gates}
                        </div>
                    </div>
                </div>
            </div>
        )
    }
}