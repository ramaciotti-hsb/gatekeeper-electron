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
import '../../../scss/sample-view/sample-gates.scss'
import BivariatePlot from '../../containers/bivariate-plot-container.jsx'
import '../../../scss/sample-view/sample-gates.scss'
import List from 'react-virtualized/dist/commonjs/List'
import Dropdown from '../../lib/dropdown.jsx'
import AutoSizer from 'react-virtualized/dist/commonjs/AutoSizer'
import Masonry from 'react-virtualized/dist/commonjs/Masonry';
import { CellMeasurer, CellMeasurerCache } from 'react-virtualized/dist/commonjs/CellMeasurer';
import createCellPositioner from 'react-virtualized/dist/commonjs/Masonry/createCellPositioner';

export default class MultipleSampleView extends Component {

    constructor (props) {
        super(props)

        this._columnCount = 0;

        this._cache = new CellMeasurerCache({
          defaultHeight: constants.PLOT_HEIGHT + 100,
          defaultWidth: constants.PLOT_WIDTH + 100,
          fixedWidth: true,
          fixedHeight: true
        });

        this._columnHeights = {};

        this.state = {
          columnWidth: constants.PLOT_WIDTH + 100,
          height: 1000,
          gutterSize: 15,
          overscanByPixels: 500,
          filterPlotString: '',
          combinations: [],
          flippedCombinations: []
        };

        this._cellRenderer = this._cellRenderer.bind(this);
        this._onResize = this._onResize.bind(this);
        this._renderAutoSizer = this._renderAutoSizer.bind(this);
        this._renderMasonry = this._renderMasonry.bind(this);
        this._setMasonryRef = this._setMasonryRef.bind(this);

        this.state.combinations = this.filterPlots()
    }

    calculateHomology (selectedXParameterIndex, selectedYParameterIndex) {
        this.props.api.calculateHomology(this.props.sample.id, {
            selectedXParameterIndex: selectedXParameterIndex,
            selectedYParameterIndex: selectedYParameterIndex,
            selectedXScale: this.props.workspace.selectedXScale,
            selectedYScale: this.props.workspace.selectedYScale,
            selectedMachineType: this.props.workspace.selectedMachineType
        })
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
        for (let x = 2; x < this.props.FCSFile.FCSParameters.length; x++) {
            for (let y = x + 1; y < this.props.FCSFile.FCSParameters.length; y++) {
                if (this.props.FCSFile.FCSParameters[x].label.match('_') && this.props.FCSFile.FCSParameters[y].label.match('_')
                    && this.matchLabels(this.props.FCSFile.FCSParameters[x].label, this.props.FCSFile.FCSParameters[y].label, this.state.filterPlotString)) {

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
                this.props.api.getImageForPlot(this.props.sample.id, { selectedXParameterIndex: c[0], selectedYParameterIndex: c[1], selectedXScale: this.props.workspace.selectedXScale, selectedYScale: this.props.workspace.selectedYScale, selectedMachineType: this.props.workspace.selectedMachineType })
            }
        }

        return combinations
    }

    _cellRenderer({ index, key, parent, style }) {
        const { list } = this.context;
        const { columnWidth } = this.state;

        if (!this.props.FCSFile.FCSParameters || this.props.FCSFile.FCSParameters.length === 0 || index >= this.state.combinations.length) {
            return null
        }

        const x = Math.min(this.state.combinations[index][0], this.state.combinations[index][1])
        const y = Math.max(this.state.combinations[index][0], this.state.combinations[index][1])

        return (
            <CellMeasurer cache={this._cache} index={index} key={key} parent={parent}>
                <div className='gate-group' key={key} style={style}>
                    <div className='upper'>
                        <div className='selected-parameters'>
                            {this.props.FCSFile.FCSParameters[this.state.combinations[index][0]].label + ' · ' + this.props.FCSFile.FCSParameters[this.state.combinations[index][1]].label}
                            <div className={'icon' + (this.props.workspace.invertedAxisPlots[x + '_' + y] ? ' active' : '')} onClick={this.props.api.invertPlotAxis.bind(null, this.props.workspace.id, this.state.combinations[index][0], this.state.combinations[index][1])}><i className='lnr lnr-sync'></i></div>
                        </div>
                        <Dropdown outerClasses='dark' ref={'homologyDropdown-' + this.state.combinations[index][0] + '-' + this.state.combinations[index][1]}>
                            <div className='inner'>
                                <div className='icon'><i className='lnr lnr-cog'></i></div>
                                <div className='menu'>
                                    <div className='menu-header'>Auto Gating</div>
                                    <div className='menu-inner'>
                                        <div className='item' onClick={this.calculateHomology.bind(this, this.state.combinations[index][0], this.state.combinations[index][1])}><div>Persistent Homology</div></div>
                                        <div className='item' onClick={this.calculateHomology.bind(this, this.state.combinations[index][0], this.state.combinations[index][1])}><div>Persistent Homology (Recursive)</div></div>
                                    </div>
                                </div>
                            </div>
                        </Dropdown>
                    </div>
                    <div className='graph'>
                        <BivariatePlot sampleId={this.props.sample.id} FCSFileId={this.props.FCSFile.id} selectedXParameterIndex={this.state.combinations[index][0]} selectedYParameterIndex={this.state.combinations[index][1]} selectedXScale={this.props.workspace.selectedXScale} selectedYScale={this.props.workspace.selectedYScale} />
                    </div>
                </div>
            </CellMeasurer>
        )
    }

    _onResize({ width }) {
        this._width = width;

        this._columnHeights = {};
        this._calculateColumnCount();
        this._resetCellPositioner();
        this._masonry.recomputeCellPositions();
    }

    _renderAutoSizer({height, scrollTop}) {
        this._height = height;
        this._scrollTop = scrollTop;

        const { overscanByPixels } = this.state;

        return (
            <AutoSizer
                style={{ flex: '1 1 auto' }}
                onResize={this._onResize}
                overscanByPixels={overscanByPixels}
                scrollTop={this._scrollTop}>
                {this._renderMasonry}
            </AutoSizer>
        );
    }

    _renderMasonry({width, height}) {
        this._width = width;

        this._calculateColumnCount();
        this._initCellPositioner();

        const { overscanByPixels } = this.state;

        return (
            <Masonry
                cellCount={this.state.combinations.length}
                cellMeasurerCache={this._cache}
                cellPositioner={this._cellPositioner}
                cellRenderer={this._cellRenderer}
                height={height}
                overscanByPixels={overscanByPixels}
                ref={this._setMasonryRef}
                scrollTop={this._scrollTop}
                width={width}
            />
        );
    }

    _resetCellPositioner() {
        const { columnWidth, gutterSize } = this.state;

        this._cellPositioner.reset({
            columnCount: this._columnCount,
            columnWidth,
            spacer: gutterSize,
        });
    }

    _initCellPositioner() {
        if (typeof this._cellPositioner === 'undefined') {
            const { columnWidth, gutterSize } = this.state;

            this._cellPositioner = createCellPositioner({
                cellMeasurerCache: this._cache,
                columnCount: this._columnCount,
                columnWidth,
                spacer: gutterSize,
            });
        }
    }

    _calculateColumnCount() {
        const {columnWidth, gutterSize} = this.state;

        this._columnCount = Math.floor(this._width / (columnWidth + gutterSize));
    }

    _setMasonryRef(ref) {
        this._masonry = ref;
    }

    componentDidMount () {
        // this.refs.panel.addEventListener('scroll', () => {
        //     console.log(this.refs.panel.scrollTop, this.refs.panel.scrollHeight)
        //     if (this.refs.panel.scrollTop + 2000 > this.refs.panel.scrollHeight) {
        //         this.setState({
        //             page: this.state.page + 1
        //         }, () => {
        //             this.refs.panel.scrollTop = 0
        //         })
        //     }
        // })
        // this.renderGatePreview()
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
        }

        if (shouldReset) {
            this._cache.clearAll();
            this._resetCellPositioner();
            this._masonry.clearCellPositions();
            this.setState({
                combinations: this.filterPlots()
            })
        }
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
        if (!this.props.sample) {
            return null
        }

        const {
            columnWidth,
            height,
            gutterSize,
            overscanByPixels,
            windowScrollerEnabled,
        } = this.state;
        // Group gates into the 2d parameters that they use
        const gateGroups = {}
        let plots = []

        // console.log(plots)
        // console.log(this.state.page * this.state.pageSize, (this.state.page * this.state.pageSize) + this.state.pageSize)
        // plots = plots.slice(Math.max((this.state.page * this.state.pageSize * 2) - this.state.pageSize, 0), (this.state.page * this.state.pageSize * 2) + this.state.pageSize * 2)
        // console.log(plots)

        for (let gate of this.props.gates) {
            const key = `${gate.selectedXParameterIndex}_${gate.selectedYParameterIndex}`
            // if (!gateGroups[key]) {
            //     gateGroups[key] = {
            //         label: this.props.FCSFile.FCSParameters[gate.selectedXParameterIndex].label + ' · ' + this.props.FCSFile.FCSParameters[gate.selectedYParameterIndex].label,
            //         gates: []
            //     }
            // }
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

            // const gates = gateGroup.gates.map((gate) => {
            //     const subSample = _.find(this.props.subSamples, s => s.id === gate.childSampleId)
            //     const gateTemplate = _.find(this.props.gateTemplates, gt => gt.id === gate.gateTemplateId)
            //     return (
            //         <div className='gate' key={gate.id}
            //             onMouseEnter={this.props.updateGateTemplate.bind(null, subSample.gateTemplateId, { highlighted: true })}
            //             onMouseLeave={this.props.updateGateTemplate.bind(null, subSample.gateTemplateId, { highlighted: false })}
            //             >
            //             <div className='subsample-name'>{gateTemplate.title}</div>
            //             <canvas ref={'canvas-' + gate.id} width={200} height={140} />
            //         </div>
            //     )
            // })

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
                    </div>
                    <div className='gates'>
                        {this._renderAutoSizer({height})}
                    </div>
                </div>
            </div>
        )
    }
}