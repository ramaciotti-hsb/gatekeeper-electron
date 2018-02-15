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
import { heatMapHSLStringForValue, getPlotImageKey, getScalesForSample } from '../../lib/utilities.js'

export default class BivariatePlot extends Component {
    
    constructor(props) {
        super(props)
        this.state = {
            graphWidth: 600,
            graphHeight: 460,
            graphMargin: {top: 20, right: 20, bottom: 20, left: 50},
            gateSelection: null
        }
    }

    createGraphLayout () {
        if (!this.props.sample.plotImages[getPlotImageKey(this.props.sample)]) { return }

        d3.selectAll("svg > *").remove();
        const dataBoundariesX = this.props.sample.FCSParameters[this.props.sample.selectedXParameterIndex].dataBoundaries
        const dataBoundariesY = this.props.sample.FCSParameters[this.props.sample.selectedYParameterIndex].dataBoundaries

        const scales = getScalesForSample(this.props.sample, this.state.graphWidth, this.state.graphHeight)

        const xAxis = d3.axisBottom().scale(scales.xScale).tickFormat(d3.format(".2s"))
        const yAxis = d3.axisLeft().scale(scales.yScale).tickFormat(d3.format(".2s"))

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

        const margin = this.state.graphMargin
        var startSelection = (start) => {
            selection.attr("d", rect(start[0] - margin.left, start[1] - margin.top, 0, 0))
              .attr("visibility", "visible");
            redrawGraph()
        };

        var moveSelection = function(start, moved) {
            selection.attr("d", rect(start[0] - margin.left, start[1] - margin.top, moved[0] - start[0], moved[1] - start[1]));
        };

        var endSelection = (start, end) => {
            selection.attr("visibility", "hidden");
            // Limit the rectangle to the boundaries of the graph
            // const startYFixed = scales.yScale.invert(Math.min(Math.max(0, this.state.graphHeight - start[1] + margin.bottom), this.state.graphHeight))
            // const endYFixed = scales.yScale.invert(Math.min(Math.max(0, this.state.graphHeight - end[1] + margin.bottom), this.state.graphHeight))
            const startXFixed = scales.xScale.invert(Math.min(Math.max(0, start[0] - margin.left), this.state.graphWidth))
            const endXFixed = scales.xScale.invert(Math.min(Math.max(0, end[0] - margin.left), this.state.graphWidth))
            const startYFixed = scales.yScale.invert(Math.min(Math.max(0, start[1] - margin.top), this.state.graphHeight))
            const endYFixed = scales.yScale.invert(Math.min(Math.max(0, end[1] - margin.top), this.state.graphHeight))
            const gate = {
                type: constants.GATE_POLYGON,
                gateData: [
                    [startXFixed, startYFixed],
                    [endXFixed, startYFixed],
                    [endXFixed, endYFixed],
                    [startXFixed, endYFixed]
                ],
                selectedXParameterIndex: this.props.sample.selectedXParameterIndex,
                selectedYParameterIndex: this.props.sample.selectedYParameterIndex,
                selectedXScale: this.props.sample.selectedXScale,
                selectedYScale: this.props.sample.selectedYScale
            }

            this.props.api.createSubSampleAndAddToWorkspace(
                this.props.workspaceId,
                this.props.sample.id,
                {
                    title: 'Subsample',
                    description: 'Subsample',
                    filePath: this.props.sample.filePath,
                    FCSParameters: this.props.sample.FCSParameters,
                    plotImages: {},
                    subSampleIds: [],
                    selectedXParameterIndex: this.props.sample.selectedXParameterIndex,
                    selectedYParameterIndex: this.props.sample.selectedYParameterIndex,
                    selectedXScale: this.props.sample.selectedXScale,
                    selectedYScale: this.props.sample.selectedYScale,
                },
                gate,
            )

            redrawGraph()
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

        // Draw each individual custom element with their properties.
        var canvas = d3.select('.canvas')
          .attr('width', this.state.graphWidth)
          .attr('height', this.state.graphHeight);

        var context = canvas.node().getContext('2d')
        const image = new Image()
        image.src = this.props.sample.plotImages[getPlotImageKey(this.props.sample)]

        const redrawGraph = () => {
            context.drawImage(image, 0, 0)

            // Determine if there are any 2d gates in the subsamples that match these parameters
            let gatesExist = false
            for (let gate of this.props.gates) {
                if (gate.selectedXParameterIndex === this.props.sample.selectedXParameterIndex && 
                    gate.selectedYParameterIndex === this.props.sample.selectedYParameterIndex) {
                    gatesExist = true
                }
            }

            if (gatesExist) {
                // Redraw the image and greyscale any points that are outside the gate
                const imageData = context.getImageData(0, 0, this.state.graphWidth, this.state.graphHeight);
                const data = imageData.data;
                let gatesToRender = []

                // If there is a selected subSample 
                if (this.state.highlightSubsampleId) {
                    gatesToRender = [_.find(this.props.subSamples, s => s.id === this.state.highlightSubsampleId)]
                } else {
                    gatesToRender = this.props.gates
                }

                for (let i = 0; i < data.length; i += 4) {
                    // Get the position of the pixel as X and Y
                    const position = [
                        scales.xScale.invert((i % (this.state.graphWidth * 4)) / 4),
                        scales.yScale.invert(Math.floor(i / (this.state.graphWidth * 4)))
                    ]

                    let shouldGreyscale = true
                    for (let gate of gatesToRender) {
                        if (pointInsidePolygon(position, gate.gateData)) {
                            shouldGreyscale = false
                        }
                    }

                    if (shouldGreyscale) {
                        // Inside the gate, render as greyscale
                        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                        data[i]     = avg; // red
                        data[i + 1] = avg; // green
                        data[i + 2] = avg; // blue
                    }
                }
                
                context.putImageData(imageData, 0, 0);

                // Render the gate outlines over the top
                for (let i = 0; i < gatesToRender.length; i++) {
                    const gate = gatesToRender[i]
                    context.beginPath();
                    context.moveTo(scales.xScale(gate.gateData[0][0]), scales.yScale(gate.gateData[0][1]))
                    for (let point of gate.gateData) {
                        context.lineTo(scales.xScale(point[0]), scales.yScale(point[1]))
                    }
                    context.closePath()
                    context.stroke()
                }
            }


            let selectionMinX, selectionMaxX, selectionMinY, selectionMaxY
            const svg = d3.select("svg")

            context.fillStyle = '#999'
        }

        image.onload = () => {
            redrawGraph()
        }
    }

    componentDidMount() {
        this.createGraphLayout()
    }

    componentDidUpdate(prevProps) {
        const sampleProps = [
            'id',
            'selectedXParameterIndex',
            'selectedYParameterIndex',
            'selectedXScale',
            'selectedYScale'
        ]

        for (let prop of sampleProps) {
            if (prevProps.sample[prop] !== this.props.sample[prop]) {
                this.createGraphLayout()
                return
            }
        }

        // Update the graph if visible gates have changed
        const prevPropGates = _.filter(prevProps.gates, g => g.selectedXParameterIndex === prevProps.sample.selectedXParameterIndex && g.selectedYParameterIndex === prevProps.sample.selectedYParameterIndex)
        const propGates = _.filter(this.props.gates, g => g.selectedXParameterIndex === this.props.sample.selectedXParameterIndex && g.selectedYParameterIndex === this.props.sample.selectedYParameterIndex)

        if (prevPropGates.length !== propGates.length) {
            this.createGraphLayout()
            return
        }

        // Update the graph if images are now available
        if (!prevProps.sample.plotImages[getPlotImageKey(prevProps.sample)] && this.props.sample.plotImages[getPlotImageKey(this.props.sample)]) {
            this.createGraphLayout()
            return
        }
    }

    render () {
        return (
            <div className='svg-outer'>
                <svg width={this.state.graphWidth + this.state.graphMargin.left + this.state.graphMargin.right} height={this.state.graphHeight + this.state.graphMargin.bottom + this.state.graphMargin.top} ref="graph"></svg>
                <canvas className="canvas"/>
            </div>
        )
    }
}