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
import polygonsIntersect from 'polygon-overlap'
import pointInsidePolygon from 'point-in-polygon'
import { distanceToPolygon, distanceBetweenPoints } from 'distance-to-polygon'
import constants from '../../lib/constants.js'
import area from 'area-polygon'
import { heatMapHSLStringForValue, getPlotImageKey, getScales, getPolygonCenter } from '../../lib/utilities.js'
import PersistantHomology from '../../lib/persistent-homology'
import '../../../scss/bivariate-plot-component.scss'

export default class BivariatePlot extends Component {
    
    constructor(props) {
        super(props)
        this.state = {
            graphMargin: {top: 20, right: 0, bottom: 20, left: 50},
            gateSelection: null,
            truePeaks: [],
            homologyPeaks: [],
            iterations: 0,
            homologyHeight: 100,
            visibleGateTooltipId: null,
            selectedXScale: this.props.selectedXScale || this.props.workspace.selectedXScale,
            selectedYScale: this.props.selectedYScale || this.props.workspace.selectedYScale,
            machineType: this.props.FCSFile.machineType || this.props.workspace.machineType
        }

        this.cacheImageKey = null
        this.cacheImage = null
    }

    // -------------------------------------------------------------------------
    // Uses the Persistent Homology technique to discover peaks / populations in
    // 2d data. Each iteration is calculated on a different iteration of the
    // event loop to prevent blocking for large datasets.
    // -------------------------------------------------------------------------

    // This function takes a two dimensional array (e.g foo[][]) and returns an array of polygons
    // representing discovered peaks. e.g:
    // [[2, 1], [2, 2], [1, 2]]
    initHomologyIteration () {
        // Offset the entire graph and add histograms if we're looking at cytof data
        let xOffset = this.props.FCSFile.machineType === constants.MACHINE_CYTOF ? Math.round(Math.min(this.props.plotWidth, this.props.plotHeight) * 0.07) : 0
        let yOffset = this.props.FCSFile.machineType === constants.MACHINE_CYTOF ? Math.round(Math.min(this.props.plotWidth, this.props.plotHeight) * 0.07) : 0
        const population = this.props.api.getPopulationDataForSample(this.props.sample.id, this.props).then((population) => {
            const scales = getScales({
                selectedXScale: this.props.selectedXScale,
                selectedYScale: this.props.selectedYScale,
                xRange: [ this.props.FCSFile.FCSParameters[this.props.selectedXParameterIndex].statistics.min, this.props.FCSFile.FCSParameters[this.props.selectedXParameterIndex].statistics.max ],
                yRange: [ this.props.FCSFile.FCSParameters[this.props.selectedYParameterIndex].statistics.min, this.props.FCSFile.FCSParameters[this.props.selectedYParameterIndex].statistics.max ],
                width: this.props.plotWidth - xOffset,
                height: this.props.plotHeight - yOffset
            })

            const homology = new PersistantHomology({
                sample: this.props.sample,
                population,
                options: this.props
            })

            this.setState({
                densityMap: population.densityMap,
                homology
            })
        })
    }

    performHomologyIteration (edgeDistance = 20, minPeakHeight = 4) {
        if (!this.state.homology) {
            this.initHomologyIteration()
        } else {
            this.state.homology.performHomologyIteration(this.state.homologyHeight)
            this.state.homologyPeaks = this.state.homology.homologyPeaks
            this.setState({ homologyHeight: this.state.homologyHeight - 1 }, this.createGraphLayout)
        }
    }

    createGraphLayout () {
        d3.select(this.refs.graph).selectAll(':scope > *').remove();

        // Need to offset the whole graph if we're including cytof 0 histograms
        const xOffset = this.props.FCSFile.machineType === constants.MACHINE_CYTOF ? Math.round(Math.min(this.props.plotWidth, this.props.plotHeight) * 0.07) * (this.props.plotDisplayWidth / this.props.plotWidth) : 0
        const yOffset = this.props.FCSFile.machineType === constants.MACHINE_CYTOF ? Math.round(Math.min(this.props.plotWidth, this.props.plotHeight) * 0.07) * (this.props.plotDisplayHeight / this.props.plotHeight) : 0

        const xStats = this.props.FCSFile.FCSParameters[this.props.selectedXParameterIndex].statistics
        const yStats = this.props.FCSFile.FCSParameters[this.props.selectedYParameterIndex].statistics
        const scales = getScales({
            selectedXScale: this.props.selectedXScale,
            selectedYScale: this.props.selectedYScale,
            xRange: [ this.props.selectedXScale === constants.SCALE_LOG ? xStats.positiveMin : xStats.min, xStats.max ],
            yRange: [ this.props.selectedYScale === constants.SCALE_LOG ? yStats.positiveMin : yStats.min, yStats.max ],
            width: this.props.plotDisplayWidth - xOffset,
            height: this.props.plotDisplayHeight - yOffset
        })

        // let xScale
        // let yScale
        // // If we should invert axis for this plot
        // if (this.props.workspace.invertedAxisPlots[this.props.selectedXParameterIndex + '_' + this.props.selectedYParameterIndex]) {
        //     const 
        // }

        const xAxis = d3.axisBottom().scale(scales.xScale).tickFormat(d3.format(".2s"))
        const yAxis = d3.axisLeft().scale(scales.yScale).tickFormat(d3.format(".2s"))

        const columnWidth = 1
        const rowWidth = 10

        const color = d3.scaleOrdinal(d3.schemeCategory10)
        const svg = d3.select(this.refs.graph)
        const custom = d3.select(document.createElement('custom'))
        this.svgElement = custom
        // const tooltip = d3.select("#tooltip")
        // x-axis
        svg.append("g")
          .attr("class", "x axis")
          .attr("transform", "translate(" + xOffset + "," + this.props.plotDisplayHeight + ")")
          .call(xAxis)
        .append("text")
          .attr("class", "label")
          .attr("x", this.props.plotDisplayWidth)
          .attr("y", -6)
          .style("text-anchor", "end")

        // y-axis
        svg.append("g")
          .attr("class", "y axis")
          // .attr('transform', 'translate(0, -' + yOffset + ')')
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
                w = Math.min(w, this.props.plotDisplayWidth - x)
            } else {
                // If the width is negative, cap at leftmost boundary
                w = Math.max(w, -x)
            }

            if (h > 0) {
                // If the height is positive, cap at lower boundary (coords start from top left and y increases downwards)
                h = Math.min(h, this.props.plotDisplayHeight - y)
            } else {
                // If the height is negative, cap at upper boundary (0)
                h = Math.max(h, -y)
            }
            return "M" + [x, y] + " l" + [w, 0] + " l" + [0, h] + " l" + [-w, 0] + "z";
        }


        const svgGates = d3.select("svg.gates")
        var selection = svgGates.append("path")
          .attr("class", "selection")
          .attr("visibility", "hidden");

        const margin = this.state.graphMargin
        var startSelection = (start) => {
            selection.attr("d", rect(start[0] - margin.left, start[1] - margin.top, 0, 0))
              .attr("visibility", "visible");
        };

        var moveSelection = function(start, moved) {
            selection.attr("d", rect(start[0] - margin.left, start[1] - margin.top, moved[0] - start[0], moved[1] - start[1]));
        };

        var endSelection = (start, end) => {
            selection.attr("visibility", "hidden");
            // Limit the rectangle to the boundaries of the graph
            const startX = Math.min(Math.max(0, start[0] - margin.left), this.props.plotDisplayWidth)
            const endX = Math.min(Math.max(0, end[0] - margin.left), this.props.plotDisplayWidth)
            const startY = Math.min(Math.max(0, start[1] - margin.top), this.props.plotDisplayHeight)
            const endY = Math.min(Math.max(0, end[1] - margin.top), this.props.plotDisplayHeight)
            const startXFixed = scales.xScale.invert(startX)
            const endXFixed = scales.xScale.invert(endX)
            const startYFixed = scales.yScale.invert(startY)
            const endYFixed = scales.yScale.invert(endY)

            // Only allow gates above a certain size
            if (Math.abs(endX - startX) * Math.abs(endY - startY) < 400) {
                return
            }

            const gate = {
                type: constants.GATE_TYPE_POLYGON,
                gateData: [
                    [startXFixed, startYFixed],
                    [endXFixed, startYFixed],
                    [endXFixed, endYFixed],
                    [startXFixed, endYFixed]
                ],
                selectedXParameterIndex: this.props.selectedXParameterIndex,
                selectedYParameterIndex: this.props.selectedYParameterIndex,
                selectedXScale: this.props.selectedXScale,
                selectedYScale: this.props.selectedYScale,
                gateCreator: constants.GATE_MANUAL
            }

            this.props.api.createSubSampleAndAddToWorkspace(
                this.props.workspace.id,
                this.props.sample.id,
                {
                    filePath: this.props.sample.filePath,
                    FCSParameters: this.props.FCSFile.FCSParameters,
                    plotImages: {},
                    subSampleIds: [],
                    selectedXParameterIndex: this.props.selectedXParameterIndex,
                    selectedYParameterIndex: this.props.selectedYParameterIndex,
                    selectedXScale: this.props.selectedXScale,
                    selectedYScale: this.props.selectedYScale,
                },
                gate,
            )
        };

        svgGates.on("mousedown", function (event) {
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
        var canvas = d3.select(this.refs.canvas)
          .attr('width', this.props.plotDisplayWidth)
          .attr('height', this.props.plotDisplayHeight);


        if (!this.props.sample.plotImages[getPlotImageKey(this.props)]) { return }
        
        var context = canvas.node().getContext('2d')

        const widthDisplayRatio = this.props.plotDisplayWidth / this.props.plotWidth
        const heightDisplayRatio = this.props.plotDisplayHeight / this.props.plotHeight

        const redrawGraph = (cacheImage) => {
            // Determine if there are any 2d gates in the subsamples that match these parameters
            let gatesExist = false
            let filteredGates = _.filter(this.props.gates, g => g.type === constants.GATE_TYPE_POLYGON)
            for (let gate of filteredGates) {
                if (gate.selectedXParameterIndex === this.props.selectedXParameterIndex && 
                    gate.selectedYParameterIndex === this.props.selectedYParameterIndex) {
                    gatesExist = true
                }
            }
            gatesExist = this.state.homologyPeaks.length === 0 && gatesExist

            context.drawImage(cacheImage, 0, 0, this.props.plotDisplayWidth, this.props.plotDisplayHeight)
            const imageData = context.getImageData(0, 0, this.props.plotDisplayWidth, this.props.plotDisplayHeight);
            const data = imageData.data;

            for (let i = 0; i < data.length; i += 4) {
                // Inside the gate, render as greyscale
                const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                data[i]     = avg; // red
                data[i + 1] = avg; // green
                data[i + 2] = avg; // blue
            }
            
            context.putImageData(imageData, 0, 0);

            if (gatesExist) {
                // Redraw the image and greyscale any points that are outside the gate
                context.beginPath();

                for (let gate of filteredGates) {
                    if (gate.type !== constants.GATE_TYPE_POLYGON) { return }

                    const polygon = gate.renderedPolygon.map(p => [ (p[0] * widthDisplayRatio) + xOffset, p[1] * heightDisplayRatio ])

                    context.moveTo(polygon[0][0], polygon[0][1])
                    for (let i = 1; i < polygon.length; i++) {
                        context.lineTo(polygon[i][0], polygon[i][1])
                    }
                    context.lineTo(polygon[0][0], polygon[0][1])

                    if (gate.gateData.xCutoffs && gate.gateCreatorData.includeXChannelZeroes !== false) {
                        const xCutoffs = gate.gateData.xCutoffs.map(cutoff => cutoff * widthDisplayRatio)
                        context.moveTo(0, xCutoffs[0])
                        context.lineTo(xOffset, xCutoffs[0])
                        context.lineTo(xOffset, xCutoffs[2])
                        context.lineTo(0, xCutoffs[2])
                        context.lineTo(0, xCutoffs[0])
                    }

                    if (gate.gateData.yCutoffs && gate.gateCreatorData.includeYChannelZeroes !== false) {
                        const yCutoffs = gate.gateData.yCutoffs.map(cutoff => cutoff * heightDisplayRatio)
                        context.moveTo(yCutoffs[0] + xOffset, this.props.plotDisplayWidth)
                        context.lineTo(yCutoffs[0] + xOffset, this.props.plotDisplayWidth - yOffset)
                        context.lineTo(yCutoffs[2] + xOffset, this.props.plotDisplayWidth - yOffset)
                        context.lineTo(yCutoffs[2] + xOffset, this.props.plotDisplayWidth)
                        context.lineTo(yCutoffs[0] + xOffset, this.props.plotDisplayWidth)
                    }
                }

                context.closePath();
                context.clip();

                context.drawImage(cacheImage, 0, 0, this.props.plotDisplayWidth, this.props.plotDisplayHeight)
            } else if (this.state.homologyHeight < 100) {
                // Redraw the image and greyscale any points that are outside the gate
                const imageData = context.getImageData(0, 0, this.props.plotDisplayWidth, this.props.plotDisplayHeight);
                const data = imageData.data;
                let gatesToRender = []

                for (let i = 0; i < data.length; i += 4) {
                    // Inside the gate, render as greyscale
                    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                    data[i]     = avg; // red
                    data[i + 1] = avg; // green
                    data[i + 2] = avg; // blue
                }
                
                context.putImageData(imageData, 0, 0);

                // Render the gate outlines over the top
                for (let i = 0; i < this.state.homologyPeaks.length; i++) {
                    const gate = this.state.homologyPeaks[i]
                    context.beginPath();
                    context.moveTo(gate.polygon[0][0] + xOffset, gate.polygon[0][1])
                    for (let point of gate.polygon) {
                        context.lineTo(point[0] + xOffset, point[1])
                    }
                    context.closePath()
                    context.stroke()
                }
            } else {
                context.drawImage(cacheImage, 0, 0, this.props.plotDisplayWidth, this.props.plotDisplayHeight)
            }

            let selectionMinX, selectionMaxX, selectionMinY, selectionMaxY
        }

        if (this.cacheImageKey !== this.props.sample.id + '_' + getPlotImageKey(this.props)) {
            this.cacheImageKey = this.props.sample.id + '_' + getPlotImageKey(this.props)
            this.cacheImage = new Image()
            this.cacheImage.src = this.props.sample.plotImages[getPlotImageKey(this.props)]            
        } else {
            redrawGraph(this.cacheImage)
        }

        this.cacheImage.onload = () => {
            redrawGraph(this.cacheImage)
        }
    }

    updateTypeSpecificData (gateTemplate, data) {
        this.props.api.updateGateTemplateAndRecalculate(gateTemplate.id, { typeSpecificData: _.merge(gateTemplate.typeSpecificData, data) })
    }

    showGateTooltip (gateId, event) {
        event.stopPropagation()

        this.setState({
            visibleGateTooltipId: gateId
        })
    }

    selectGateTemplate (gateTemplateId) {
        this.props.api.selectGateTemplate(gateTemplateId, this.props.workspace.id)
    }

    componentDidMount() {
        this.createGraphLayout()
        // this.initHomologyIteration()
    }

    componentDidUpdate(prevProps) {
        // Update the graph if visible gates have changed
        const prevPropGates = _.filter(prevProps.gates, g => g.selectedXParameterIndex === prevProps.selectedXParameterIndex && g.selectedYParameterIndex === prevProps.selectedYParameterIndex)
        const propGates = _.filter(this.props.gates, g => g.selectedXParameterIndex === this.props.selectedXParameterIndex && g.selectedYParameterIndex === this.props.selectedYParameterIndex)

        let shouldReset = false
        if (prevPropGates.length !== propGates.length) {
            shouldReset = true
        }

        for (let i = 0; i < prevPropGates.length; i++) {
            if (!this.props.gates[i]) {
                shouldReset = true;
            }
            // If there are more points in one of the new gates
            else if (prevPropGates[i].polygon && prevPropGates[i].length !== this.props.gates[i].polygon.length) {
                shouldReset = true
            }
            // If the gate's widthIndex has changed
            else if (prevPropGates[i].gateCreatorData.widthIndex !== this.props.gates[i].gateCreatorData.widthIndex) {
                shouldReset = true
            }
            // If the inclusion of zero value data has changed
            else if (prevPropGates[i].gateCreatorData.includeXChannelZeroes !== this.props.gates[i].gateCreatorData.includeXChannelZeroes || prevPropGates[i].gateCreatorData.includeYChannelZeroes !== this.props.gates[i].gateCreatorData.includeYChannelZeroes) {
                shouldReset = true
            }
        }

        // Update the graph if images are now available
        if (prevProps.sample.plotImages[getPlotImageKey(prevProps)] !== this.props.sample.plotImages[getPlotImageKey(this.props)]) {
            shouldReset = true
        }

        if (prevProps.sampleId !== this.props.sampleId) {
            shouldReset = true
        }

        // If the plot has been inverted
        if (prevProps.workspace.invertedAxisPlots[this.props.selectedXParameterIndex + '_' + this.props.selectedYParameterIndex] !== this.props.workspace.invertedAxisPlots[this.props.selectedXParameterIndex + '_' + this.props.selectedYParameterIndex]) {
            shouldReset = true
        }

        // If the size of the plots has changed
        if (prevProps.plotDisplayWidth !== this.props.plotDisplayWidth || prevProps.plotDisplayHeight !== this.props.plotDisplayHeight) {
            shouldReset = true
        }

        if (shouldReset) {
            this.createGraphLayout()
        }
    }

    render () {
        // FCS File not ready yet or no sample selected
        if (this.props.FCSFile.FCSParameters.length === 0 || !this.props.sample) {
            return (
                <div className='svg-outer'><svg className='axis'></svg><canvas className="canvas"/></div>
            )
        }

        const gateCreators = {}
        gateCreators[constants.GATE_CREATOR_PERSISTENT_HOMOLOGY] = 'Calculated with Persistent Homology'
        gateCreators[constants.GATE_CREATOR_MANUAL] = 'Created Manually'

        // Need to offset the whole graph if we're including cytof 0 histograms
        const xOffset = this.props.FCSFile.machineType === constants.MACHINE_CYTOF ? Math.round(Math.min(this.props.plotWidth, this.props.plotHeight) * 0.07) * (this.props.plotDisplayWidth / this.props.plotWidth) : 0
        const yOffset = this.props.FCSFile.machineType === constants.MACHINE_CYTOF ? Math.round(Math.min(this.props.plotWidth, this.props.plotHeight) * 0.07) * (this.props.plotDisplayHeight / this.props.plotHeight) : 0
        const xStats = this.props.FCSFile.FCSParameters[this.props.selectedXParameterIndex].statistics
        const yStats = this.props.FCSFile.FCSParameters[this.props.selectedYParameterIndex].statistics
        const scales = getScales({
            selectedXScale: this.props.selectedXScale,
            selectedYScale: this.props.selectedYScale,
            xRange: [ this.props.selectedXScale === constants.SCALE_LOG ? xStats.positiveMin : xStats.min, xStats.max ],
            yRange: [ this.props.selectedYScale === constants.SCALE_LOG ? yStats.positiveMin : yStats.min, yStats.max ],
            width: this.props.plotDisplayWidth - xOffset,
            height:  this.props.plotDisplayHeight - yOffset
        })

        let tooltip
        const widthDisplayRatio = this.props.plotDisplayWidth / this.props.plotWidth
        const heightDisplayRatio = this.props.plotDisplayHeight / this.props.plotHeight
        const gates = _.filter(this.props.gates, g => g.type === constants.GATE_TYPE_POLYGON).map((gate) => {
            const gateTemplate = _.find(this.props.gateTemplates, gt => gt.id === gate.gateTemplateId)
            const gateTemplateGroup = _.find(this.props.gateTemplateGroups, g => g.childGateTemplateIds.includes(gateTemplate.id))

            if (gate.type === constants.GATE_TYPE_POLYGON) {
                const scaledPoints = gate.renderedPolygon.map(p => [ (p[0] * widthDisplayRatio) + xOffset, p[1] * heightDisplayRatio ])
                const points = scaledPoints.reduce((string, point) => {
                    return string + point[0] + " " + point[1] + " "
                }, "")

                // If this is a real gate template, link mouse events to gate templates and sub samples
                if (gateTemplate) {
                    return (
                        <svg onMouseEnter={this.props.updateGateTemplate.bind(null, gateTemplate.id, { highlighted: true })}
                            onMouseLeave={this.props.updateGateTemplate.bind(null, gateTemplate.id, { highlighted: false })}
                            onContextMenu={this.showGateTooltip.bind(this, gate.id)}
                            onClick={this.selectGateTemplate.bind(this, gate.gateTemplateId)}
                            key={gate.id}>
                            <polygon points={points} className={'gate' + (gateTemplate.highlighted ? ' highlighted' : '')} />
                        </svg>
                    )
                // If these are unsaved, sample gates, link them to modal actions
                } else {
                    return (
                        <svg key={gate.id}>
                            <polygon points={points} className={'gate' + (this.props.highlightedGateIds && this.props.highlightedGateIds.includes(gate.id) ? ' highlighted' : '')} />
                        </svg>
                    )
                }
            }
        })

        // Show a loading indicator if the parameters are marked as loading or if there is no image for the requested parameter combination
        let isLoading
        let loadingMessage
        if (this.props.sample.parametersLoading[this.props.selectedXParameterIndex + '_' + this.props.selectedYParameterIndex]
            && this.props.sample.parametersLoading[this.props.selectedXParameterIndex + '_' + this.props.selectedYParameterIndex].loading) {
            isLoading = true
            loadingMessage = this.props.sample.parametersLoading[this.props.selectedXParameterIndex + '_' + this.props.selectedYParameterIndex] && this.props.sample.parametersLoading[this.props.selectedXParameterIndex + '_' + this.props.selectedYParameterIndex].loadingMessage
        } else if (!this.props.sample.plotImages[getPlotImageKey(this.props)]) {
            isLoading = true
            if (this.props.backgroundJobsEnabled) {
                loadingMessage = 'Generating image for plot...'                
            } else {
                loadingMessage = 'Background jobs are disabled.'
            }
        }

        // Show an error message if automated gates failed to apply
        let gatingError
        if (this.props.gatingError) {
            gatingError = (
                <div className='error-overlay' onClick={this.props.updateModalParameters.bind(null, 'gatingError', { visible: true, gatingErrorId: this.props.gatingError.id })}>
                    <div className='red-background' />
                    <i className='lnr lnr-cross-circle' />
                    <div className='text'>Error Applying Gating Template</div>
                </div>
            )
        }

        return (
            <div className='svg-outer' onClick={this.showGateTooltip.bind(this, null)}>
                <div className={`loader-outer${isLoading ? ' active' : ''}`}><div className='loader'></div><div className="text">{loadingMessage}</div></div>
                {gatingError}
                {/* D3 Axis */}
                <svg className={'axis' + (gatingError ? ' gating-error' : '')} width={this.props.plotDisplayWidth + this.state.graphMargin.left + this.state.graphMargin.right} height={this.props.plotDisplayHeight + this.state.graphMargin.bottom + this.state.graphMargin.top} ref="graph"></svg>
                {/* Gate Paths */}
                <svg className={'gates' + (gatingError ? ' gating-error' : '')} width={this.props.plotDisplayWidth + this.state.graphMargin.left + this.state.graphMargin.right} height={this.props.plotDisplayHeight + this.state.graphMargin.bottom + this.state.graphMargin.top} ref="gates">
                    {gates}
                </svg>
                {tooltip}
                <canvas className={'canvas' + (gatingError ? ' gating-error' : '')} ref="canvas"/>
                {/*<div className='step' onClick={this.performHomologyIteration.bind(this, 15, 4)}>Step</div>*/}
            </div>
        )
    }
}