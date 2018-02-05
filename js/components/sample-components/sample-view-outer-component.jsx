import React from 'react'
import { Component } from 'react'
import _ from 'lodash'
import path from 'path'
import * as d3 from "d3"
import Dropdown from '../../lib/dropdown-inline.jsx'
import '../../../scss/sample-view.scss'
import fs from 'fs'
import logicleScale from '../../scales/logicle.js'
import uuidv4 from 'uuid/v4'
import GrahamScan from '../../lib/graham-scan.js'
import polygonsIntersect from 'polygon-overlap'
import pointInsidePolygon from 'point-in-polygon'
import { distanceToPolygon, distanceBetweenPoints } from 'distance-to-polygon'
import area from 'area-polygon'
import Density from '../../lib/2d-density.js'
import persistentHomology from '../../lib/persistent-homology.js'
import Gates from './sample-gates-component.jsx'
import constants from '../../lib/constants.js'
import { heatMapColorforValue } from '../../lib/utilities.js'

export default class SampleView extends Component {
    
    constructor(props) {
        super(props)
        this.state = {
            pointCache: [], // All samples arranged in 2d array by currently selected parameters
            graphWidth: 600,
            graphHeight: 460,
            graphMargin: {top: 20, right: 20, bottom: 20, left: 20},
            gateSelection: null,
            subSamples: this.props.subSamples || []
        }
        this.homologyPeaks = []
    }

    // Creates a 2d map of the samples according to the currently selected parameters
    createPointCache () {
        if (!this.props.FCSFile.ready) { return Promise.reject('Point cache can\'t be created until FCS file is ready') }
        this.state.pointCache = []
        const state = this.state
        const densityPoints = []
        for (let point of this.props.FCSFile.dataAsNumbers) {
            densityPoints.push([this.xScale(point[this.props.selectedXParameterIndex]), this.yScale(point[this.props.selectedYParameterIndex])])

            // console.log(d)
            const yVal = Math.floor(this.yScale(point[this.props.selectedYParameterIndex]))
            const xVal = Math.floor(this.xScale(point[this.props.selectedXParameterIndex]))
            if (!state.pointCache[yVal]) {
                state.pointCache[yVal] = []
            }
            if (!state.pointCache[yVal][xVal]) {
                state.pointCache[yVal][xVal] = []
            }
            state.pointCache[yVal][xVal].push({
                x: this.xScale(point[this.props.selectedXParameterIndex]),
                y: this.yScale(point[this.props.selectedYParameterIndex]),
                data: point
            })
        };

        this.state.densityMap = new Density(densityPoints)
        this.setState({
            densityMap: this.state.densityMap
        })
        return this.state.densityMap.calculateDensity()
    }

    createGraphLayout () {
        if (!this.props.FCSFile) { return }

        let xMin = 263000
        let xMax = 0

        let yMin = 263000
        let yMax = 0

        // Calculate minimum and maximum parameter values for the selected channels
        for (let i = 0; i < this.props.FCSFile.dataAsNumbers.length; i++) {
            const xValue = this.props.FCSFile.dataAsNumbers[i][this.props.selectedXParameterIndex]
            const yValue = this.props.FCSFile.dataAsNumbers[i][this.props.selectedYParameterIndex]

            if (xValue > xMax) { xMax = xValue }
            if (xValue < xMin) { xMin = xValue }
            if (yValue > yMax) { yMax = yValue }
            if (yValue < yMin) { yMin = yValue }
        }

        d3.selectAll("svg > *").remove();

        /* 
         * value accessor - returns the value to encode for a given data object.
         * scale - maps value to a visual display encoding, such as a pixel position.
         * map function - maps from data value to display value
         * axis - sets up axis
         */ 

        // setup x 
        // let xValue = (d) => { return d[this.props.selectedXParameterIndex] } // data -> value
        // Linear Scale
        if (this.props.selectedXScaleId === constants.SCALE_LINEAR) {
            this.xScale = d3.scaleLinear().range([0, this.state.graphWidth]) // value -> display
            // don't want dots overlapping axis, so add in buffer to data domain
            this.xScale.domain(d3.extent(this.props.FCSFile.dataAsNumbers, d => d[this.props.selectedXParameterIndex]));
        // Log Scale
        } else if (this.props.selectedXScaleId === constants.SCALE_LOG) {
            // Log scale will break for values <= 0
            // xValue = (d) => { return Math.max(0.1, d[this.props.selectedXParameterIndex]) }
            this.xScale = d3.scaleLog()
                .range([0, this.state.graphWidth])
                .base(Math.E)
                .domain([Math.exp(Math.log(Math.max(0.1, xMin))), Math.exp(Math.log(xMax))])
        // Biexponential Scale
        } else if (this.props.selectedXScaleId === constants.SCALE_BIEXP) {
            this.xScale = logicleScale().range([0, this.state.graphWidth])
        }
        window.xScale = this.xScale
        const xAxis = d3.axisBottom().scale(this.xScale).tickFormat(d3.format(".2s"))

        // setup y
        // let yValue = (d) => { return d[this.props.selectedYParameterIndex] }
        if (this.props.selectedYScaleId === constants.SCALE_LINEAR) {
            this.yScale = d3.scaleLinear().range([this.state.graphHeight, 0]) // value -> display
            this.yScale.domain(d3.extent(this.props.FCSFile.dataAsNumbers, d => d[this.props.selectedYParameterIndex]));
        // Log Scale
        } else if (this.props.selectedYScaleId === constants.SCALE_LOG) {
            // yValue = (d) => { return Math.max(0.1, d[this.props.selectedYParameterIndex]) } // data -> value
            this.yScale = d3.scaleLog()
                .range([this.state.graphHeight, 0])
                .base(Math.E)
                .domain([Math.exp(Math.log(Math.max(0.1, yMin))), Math.exp(Math.log(yMax))])
        // Biexponential Scale
        } else if (this.props.selectedYScaleId === constants.SCALE_BIEXP) {
            this.yScale = logicleScale().range([this.state.graphHeight, 0])
        }
        const yAxis = d3.axisLeft().scale(this.yScale).tickFormat(d3.format(".2s"))

        const columnWidth = 1
        const rowWidth = 10

        const color = d3.scaleOrdinal(d3.schemeCategory10)
        const svg = d3.select("svg")
        const custom = d3.select(document.createElement('custom'))
        this.svgElement = custom
        // const tooltip = d3.select("#tooltip")
        // x-axis
        svg.append("g")
          .attr("class", "x axis")
          .attr("transform", "translate(0," + this.state.graphHeight + ")")
          .call(xAxis)
        .append("text")
          .attr("class", "label")
          .attr("x", this.state.graphWidth)
          .attr("y", -6)
          .style("text-anchor", "end")
          .text("Calories");

        // y-axis
        svg.append("g")
          .attr("class", "y axis")
          .call(yAxis)
        .append("text")
          .attr("class", "label")
          .attr("transform", "rotate(-90)")
          .attr("y", 6)
          .attr("dy", ".71em")
          .style("text-anchor", "end")

        // Create bindings for drawing rectangle gates
        const rect = (x, y, w, h) => {
            // Limit to the area of the scatter plot
            if (w > 0) {
                // If the width is positive, cap at rightmost boundary
                w = Math.min(w, this.state.graphWidth - x)
            } else {
                // If the width is negative, cap at leftmost boundary
                w = Math.max(w, -x)
            }

            if (h > 0) {
                // If the height is positive, cap at lower boundary (coords start from top left and y increases downwards)
                h = Math.min(h, this.state.graphHeight - y)
            } else {
                // If the height is negative, cap at upper boundary (0)
                h = Math.max(h, -y)
            }
            return "M" + [x, y] + " l" + [w, 0] + " l" + [0, h] + " l" + [-w, 0] + "z";
        }

        var selection = svg.append("path")
          .attr("class", "selection")
          .attr("visibility", "hidden");

        var startSelection = (start) => {
            selection.attr("d", rect(start[0], start[0], 0, 0))
              .attr("visibility", "visible");
            this.redrawGraph()
        };

        var moveSelection = function(start, moved) {
            selection.attr("d", rect(start[0], start[1], moved[0]-start[0], moved[1]-start[1]));
        };

        var endSelection = (start, end) => {
            selection.attr("visibility", "hidden");
            const FCSFile = {
                dataAsNumbers: [],
                text: this.props.FCSFile.text
            }
            // Limit the rectangle to the boundaries of the graph
            const startXFixed = Math.min(Math.max(0, start[0]), this.state.graphWidth)
            const endXFixed = Math.min(Math.max(0, end[0]), this.state.graphWidth)
            const startYFixed = Math.min(Math.max(0, start[1]), this.state.graphHeight)
            const endYFixed = Math.min(Math.max(0, end[1]), this.state.graphHeight)
            const gate = {
                type: constants.GATE_POLYGON,
                polygon: [
                    [startXFixed, startYFixed],
                    [endXFixed, startYFixed],
                    [endXFixed, endYFixed],
                    [startXFixed, endYFixed]
                ],
                xParameterIndex: this.props.selectedXParameterIndex,
                yParameterIndex: this.props.selectedYParameterIndex
            }

            // Calculate all the samples that are matched inside the gate
            for (let y = 0; y < this.state.pointCache.length; y++) {
                const column = this.state.pointCache[y]
                if (!column || column.length === 0) { continue }

                for (let x = 0; x < column.length; x++) {
                    const row = column[x]
                    if (!row || row.length === 0) { continue }

                    if (pointInsidePolygon([x, y], gate.polygon)) {
                        FCSFile.dataAsNumbers.push(this.state.pointCache[y][x].data)
                    }
                }
            }

            this.state.subSamples.push({
                id: uuidv4(),
                title: 'Subsample',
                description: 'Subsample',
                type: 'gate',
                gate: gate,
                FCSFile: FCSFile,
                selectedXParameterIndex: this.selectedXParameterIndex,
                selectedYParameterIndex: this.selectedYParameterIndex,
                selectedXScaleId: this.selectedXScaleId,
                selectedYScaleId: this.selectedYScaleId
            })

            this.redrawGraph()
        };

        svg.on("mousedown", function (event) {
          var subject = d3.select(window), parent = this.parentNode,
              start = d3.mouse(parent);
            startSelection(start);
            subject
              .on("mousemove.selection", function() {
                moveSelection(start, d3.mouse(parent));
              }).on("mouseup.selection", function() {
                endSelection(start, d3.mouse(parent));
                subject.on("mousemove.selection", null).on("mouseup.selection", null);
              });

            d3.event.preventDefault()
        });
    }

    redrawGraph () {
        let selectionMinX, selectionMaxX, selectionMinY, selectionMaxY
        const svg = d3.select("svg")

        // Draw each individual custom element with their properties.
        const maxDensity = this.state.densityMap.getMaxDensity()
        var canvas = d3.select('.canvas')
          .attr('width', this.state.graphWidth)
          .attr('height', this.state.graphHeight);

        var context = canvas.node().getContext('2d');
        var elements = this.svgElement.selectAll('rect');

        context.fillStyle = '#999'
        // Determine if there are any 2d gates in the subsamples that match these parameters
        let gatesExist = false
        for (let subSample of this.state.subSamples) {
            if (subSample.type === 'gate' &&
                subSample.gate.xParameterIndex === this.props.selectedXParameterIndex && 
                subSample.gate.yParameterIndex === this.props.selectedYParameterIndex) {
                gatesExist = true
            }
        }

        if (gatesExist) {
            // First, render all points in grey
            for (let y = 0; y < this.state.pointCache.length; y++) {
                const column = this.state.pointCache[y]
                if (!column || column.length === 0) { continue }
                for (let x = 0; x < column.length; x++) {
                    const row = column[x]
                    if (!row || row.length === 0) { continue }

                    for (let p = 0; p < row.length; p++) {
                        const point = row[p]
                        context.fillRect(point.x, point.y, 1, 1)
                    }
                }
            }

            let gatesToRender = []

            // If there is a selected subSample 
            if (this.state.highlightSubsampleId) {
                gatesToRender = [_.find(this.state.subSamples, s => s.id === this.state.highlightSubsampleId)]
            } else {
                gatesToRender = this.state.subSamples
            }

            // Then go through all gates and render points inside them as blue
            let shouldDisplay = false
            for (let i = 0; i < gatesToRender.length; i++) {
                const subSample = gatesToRender[i]
                if (subSample.type !== 'gate' ||
                subSample.gate.xParameterIndex !== this.props.selectedXParameterIndex || 
                subSample.gate.yParameterIndex !== this.props.selectedYParameterIndex) { continue }

                if (subSample.gate.type === constants.GATE_POLYGON) {
                    for (let y = 0; y < this.state.pointCache.length; y++) {
                        const column = this.state.pointCache[y]
                        if (!column || column.length === 0) { continue }

                        for (let x = 0; x < column.length; x++) {
                            const row = column[x]
                            if (!row || row.length === 0) { continue }

                            if (pointInsidePolygon([x, y], subSample.gate.polygon)) {
                                context.fillStyle = heatMapColorforValue(Math.min((this.state.densityMap.getDensityMap()[y][x] / maxDensity * 1.5), 1))
                                context.fillRect(x, y, 1, 1)
                            }
                        }
                    }
                }
            }

            // Render the gate outlines over the top
            for (let i = 0; i < gatesToRender.length; i++) {
                const subSample = gatesToRender[i]
                context.beginPath();
                context.moveTo(subSample.gate.polygon[0][0], subSample.gate.polygon[0][1])
                for (let point of subSample.gate.polygon) {
                    context.lineTo(point[0], point[1])
                }
                context.closePath()
                context.stroke()
            }
        } else {
            // If there are no gates drawn
            // Render all points based on density
            for (let y = 0; y < this.state.pointCache.length; y++) {
                const column = this.state.pointCache[y]
                if (!column || column.length === 0) { continue }

                for (let x = 0; x < column.length; x++) {
                    const row = column[x]
                    if (!row || row.length === 0) { continue }

                    context.fillStyle = heatMapColorforValue(Math.min((this.state.densityMap.getDensityMap()[y][x] / maxDensity * 1.5), 1))
                    context.fillRect(x, y, 1, 1)
                }
            }
        }
    }

    calculateHomology () {
        persistentHomology(this.state.densityMap).then((truePeaks) => {
            for (let peak of truePeaks) {
                const FCSFile = {
                    dataAsNumbers: [],
                    text: this.props.FCSFile.text
                }
                for (let y = 0; y < this.state.pointCache.length; y++) {
                    const column = this.state.pointCache[y]
                    if (!column || column.length === 0) { continue }

                    for (let x = 0; x < column.length; x++) {
                        const row = column[x]
                        if (!row || row.length === 0) { continue }

                        for (let p = 0; p < row.length; p++) {
                            const point = row[p]
                            if (pointInsidePolygon([point.x, point.y], peak.polygon)) {
                                FCSFile.dataAsNumbers.push(point.data)
                            }
                        }
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
                        xParameterIndex: this.props.selectedXParameterIndex,
                        yParameterIndex: this.props.selectedYParameterIndex
                    },
                    FCSFile: FCSFile,
                    selectedXParameterIndex: this.selectedXParameterIndex,
                    selectedYParameterIndex: this.selectedYParameterIndex,
                    selectedXScaleId: this.selectedXScaleId,
                    selectedYScaleId: this.selectedYScaleId
                })
            }

            this.redrawGraph()
        })
    }

    componentDidMount() {
        if (this.props.FCSFile.ready) {
            this.createGraphLayout()
            this.createPointCache().then(() => {
                this.redrawGraph()
            })
        }
    }

    componentDidUpdate(prevProps) {
        // If it's a new sample, re render the graph
        if ((prevProps.subSamples.length !== this.state.subSamples.length
            || prevProps.id !== this.props.id || !prevProps.FCSFile.ready) && this.props.FCSFile.ready) {
            this.createGraphLayout()
            this.createPointCache().then(() => {
                this.redrawGraph()
            })
        }
    }

    handleSelectXParameter (value) {
        this.refs.xParameterDropdown.getInstance().hideDropdown()
        this.setState({
            selectedXParameterIndex: value
        }, () => {
            this.createGraphLayout()
            this.createPointCache().then(() => {
                this.redrawGraph()
            })
        })
    }

    handleSelectYParameter (value) {
        this.refs.yParameterDropdown.getInstance().hideDropdown()
        this.setState({
            selectedYParameterIndex: value
        }, () => {
            this.createGraphLayout()
            this.createPointCache().then(() => {
                this.redrawGraph()
            })
        })
    }

    handleSelectXScale (value) {
        this.refs.xScaleDropdown.getInstance().hideDropdown()
        this.setState({
            selectedXScaleId: value
        }, () => {
            this.createGraphLayout()
            this.createPointCache().then(() => {
                this.redrawGraph()
            })
        })
    }

    handleSelectYScale (value) {
        this.refs.yScaleDropdown.getInstance().hideDropdown()
        this.setState({
            selectedYScaleId: value
        }, () => {
            this.createGraphLayout()
            this.createPointCache().then(() => {
                this.redrawGraph()
            })
        })
    }

    highlightGate (subSampleId) {
        this.setState({
            highlightSubsampleId: subSampleId
        }, () => this.redrawGraph())
    }

    clearHighlightGate () {
        this.setState({
            highlightSubsampleId: null
        }, () => this.redrawGraph())
    }

    render () {
        let parametersX = []
        let parametersXRendered = []

        let parametersY = []
        let parametersYRendered = []

        let scalesX = [
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
        let scalesXRendered = []

        let scalesY = [
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
        let scalesYRendered = []

        if (this.props.FCSFile) {
            _.keys(this.props.FCSFile.text).map((param) => {
                if (param.match(/^\$P.+N$/)) { // Get parameter names
                    const parameterName = this.props.FCSFile.text[param]
                    parametersX.push(parameterName)
                    parametersXRendered.push({
                        value: parameterName,
                        component: <div className='item' onClick={this.handleSelectXParameter.bind(this, parametersX.length - 1)} key={parametersX.length - 1}>{parameterName}</div>
                    })
                }
            })

            _.keys(this.props.FCSFile.text).map((param) => {
                if (param.match(/^\$P.+N$/)) { // Get parameter names
                    const parameterName = this.props.FCSFile.text[param]
                    parametersY.push(parameterName)
                    parametersYRendered.push({
                        value: parameterName,
                        component: <div className='item' onClick={this.handleSelectYParameter.bind(this, parametersY.length - 1)} key={parametersY.length - 1}>{parameterName}</div>
                    })
                }
            })

            scalesXRendered = scalesX.map((scale) => {
                return {
                    value: scale.label,
                    component: <div className='item' onClick={this.handleSelectXScale.bind(this, scale.id)} key={scale.id}>{scale.label}</div>
                }
            })

            scalesYRendered = scalesY.map((scale) => {
                return {
                    value: scale.label,
                    component: <div className='item' onClick={this.handleSelectYScale.bind(this, scale.id)} key={scale.id}>{scale.label}</div>
                }
            })
        }

        const autoGates = [
            {
                value: 'persistent-homology',
                component: <div className='item' onClick={this.calculateHomology.bind(this)} key={'persistent-homology'}>Persistent Homology</div>
            }
        ]

        return (
            <div className='panel sample'>
                <div className='panel-inner'>
                    <div className='header'>
                        <div className='upper'>{this.props.type === 'sample' ? 'Root Sample' : 'Subsample of ' + this.props.parentTitle}</div>
                        <div className='lower'>{this.props.title}</div>
                    </div>
                    <div className='graph'>
                        <div className='graph-upper'>
                            <div className='axis-selection y'>
                                <Dropdown items={parametersYRendered} textLabel={parametersY[this.props.selectedYParameterIndex]} ref={'yParameterDropdown'} />
                                <Dropdown items={scalesYRendered} textLabel={scalesY[this.props.selectedYScaleId].label} outerClasses={'scale'} ref={'yScaleDropdown'} />
                            </div>
                            <div className='svg-outer'>
                                <svg width={this.state.graphWidth + this.state.graphMargin.left + this.state.graphMargin.right} height={this.state.graphHeight + this.state.graphMargin.bottom + this.state.graphMargin.top} ref="graph"></svg>
                                <canvas className="canvas"/>
                                <div className='axis-selection x'>
                                    <Dropdown items={parametersXRendered} textLabel={parametersX[this.props.selectedXParameterIndex]} ref={'xParameterDropdown'} />
                                    <Dropdown items={scalesXRendered} textLabel={scalesX[this.props.selectedXScaleId].label} outerClasses={'scale'} ref={'xScaleDropdown'} />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className='header gates'>
                        <div className='lower'>Gates <Dropdown items={autoGates} textLabel={'Auto Gate...'} /></div>
                    </div>
                    <Gates densityMap={this.state.densityMap} subSamples={this.state.subSamples}
                        clearHighlightGate={this.clearHighlightGate.bind(this)} highlightGate={this.highlightGate.bind(this)}
                        graphWidth={this.state.graphWidth} graphHeight={this.state.graphHeight} />
                </div>
            </div>
        )
    }
}