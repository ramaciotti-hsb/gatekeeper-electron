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
import Density from '../../lib/2d-density.js'
import Gates from './sample-gates-component.jsx'
import constants from '../../lib/constants.js'
import area from 'area-polygon'
import { heatMapHSLStringForValue, getPlotImageKey, getScales, getPolygonCenter } from '../../lib/utilities.js'
import PersistantHomology from '../../lib/persistent-homology'

export default class BivariatePlot extends Component {
    
    constructor(props) {
        super(props)
        this.state = {
            graphWidth: 500,
            graphHeight: 500,
            graphMargin: {top: 20, right: 20, bottom: 20, left: 50},
            gateSelection: null,
            truePeaks: [],
            homologyPeaks: [],
            iterations: 0,
            homologyHeight: 100,
            visibleGateTooltipId: null,
            selectedXParameterIndex: !_.isUndefined(this.props.selectedXParameterIndex) ? this.props.selectedXParameterIndex : this.props.workspace.selectedXParameterIndex,
            selectedYParameterIndex: !_.isUndefined(this.props.selectedYParameterIndex) ? this.props.selectedYParameterIndex : this.props.workspace.selectedYParameterIndex,
            selectedXScale: this.props.selectedXScale || this.props.workspace.selectedXScale,
            selectedYScale: this.props.selectedYScale || this.props.workspace.selectedYScale,
            selectedMachineType: this.props.selectedMachineType || this.props.workspace.selectedMachineType
        }
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
        let xOffset = this.props.selectedMachineType === constants.MACHINE_CYTOF ? constants.CYTOF_HISTOGRAM_WIDTH : 0
        let yOffset = this.props.selectedMachineType === constants.MACHINE_CYTOF ? constants.CYTOF_HISTOGRAM_HEIGHT : 0
        const population = this.props.api.getPopulationDataForSample(this.props.sample.id, this.props).then((population) => {
            const scales = getScales({
                selectedXScale: this.props.selectedXScale,
                selectedYScale: this.props.selectedYScale,
                xRange: [ this.props.sample.FCSParameters[this.props.selectedXParameterIndex].statistics.min, this.props.sample.FCSParameters[this.props.selectedXParameterIndex].statistics.max ],
                yRange: [ this.props.sample.FCSParameters[this.props.selectedYParameterIndex].statistics.min, this.props.sample.FCSParameters[this.props.selectedYParameterIndex].statistics.max ],
                width: constants.PLOT_WIDTH - xOffset,
                height: constants.PLOT_HEIGHT - yOffset
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
        const xOffset = this.props.selectedMachineType === constants.MACHINE_CYTOF ? constants.CYTOF_HISTOGRAM_WIDTH * (this.state.graphWidth / constants.PLOT_WIDTH) : 0
        const yOffset = this.props.selectedMachineType === constants.MACHINE_CYTOF ? constants.CYTOF_HISTOGRAM_HEIGHT * (this.state.graphHeight / constants.PLOT_HEIGHT) : 0

        const scales = getScales({
            selectedXScale: this.props.selectedXScale,
            selectedYScale: this.props.selectedYScale,
            xRange: [ this.props.sample.FCSParameters[this.props.selectedXParameterIndex].statistics.min, this.props.sample.FCSParameters[this.props.selectedXParameterIndex].statistics.max ],
            yRange: [ this.props.sample.FCSParameters[this.props.selectedYParameterIndex].statistics.min, this.props.sample.FCSParameters[this.props.selectedYParameterIndex].statistics.max ],
            width: this.state.graphWidth - xOffset,
            height: this.state.graphHeight - yOffset
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
          .attr("transform", "translate(" + xOffset + "," + this.state.graphHeight + ")")
          .call(xAxis)
        .append("text")
          .attr("class", "label")
          .attr("x", this.state.graphWidth)
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
            const startX = Math.min(Math.max(0, start[0] - margin.left), this.state.graphWidth)
            const endX = Math.min(Math.max(0, end[0] - margin.left), this.state.graphWidth)
            const startY = Math.min(Math.max(0, start[1] - margin.top), this.state.graphHeight)
            const endY = Math.min(Math.max(0, end[1] - margin.top), this.state.graphHeight)
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
                    FCSParameters: this.props.sample.FCSParameters,
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
          .attr('width', this.state.graphWidth)
          .attr('height', this.state.graphHeight);


        if (!this.props.sample.plotImages[getPlotImageKey(this.props)]) { return }
        
        var context = canvas.node().getContext('2d')
        const image = new Image()
        image.src = this.props.sample.plotImages[getPlotImageKey(this.props)]

        const redrawGraph = () => {
            // if (this.props.workspace.invertedAxisPlots[this.props.selectedXParameterIndex + '_' + this.props.selectedYParameterIndex]) {
            //     context.translate(this.state.graphWidth / 2, this.state.graphHeight / 2)
            //     context.rotate(Math.PI / 2)
            //     context.scale(-1, 1);
            //     context.drawImage(image, -this.state.graphWidth / 2, -this.state.graphHeight / 2, this.state.graphWidth, this.state.graphHeight)
            // } else {
                context.drawImage(image, 0, 0, this.state.graphWidth, this.state.graphHeight)
            // }

            // Determine if there are any 2d gates in the subsamples that match these parameters
            let gatesExist = false
            for (let gate of this.props.gates) {
                if (gate.selectedXParameterIndex === this.props.selectedXParameterIndex && 
                    gate.selectedYParameterIndex === this.props.selectedYParameterIndex) {
                    gatesExist = true
                }
            }
            gatesExist = this.state.homologyPeaks.length === 0 && gatesExist

            if (gatesExist) {
                // Redraw the image and greyscale any points that are outside the gate
                const imageData = context.getImageData(0, 0, this.state.graphWidth, this.state.graphHeight);
                const data = imageData.data;
                let gatesToRender = this.props.gates

                const gateData = gatesToRender.map((gate) => {
                    const toReturn = {
                        gateData: gate.gateData.map(p => [ Math.floor(scales.xScale(p[0])) + xOffset, Math.floor(scales.yScale(p[1])) ])
                    }
                    if (gate.xCutoffs) {
                        toReturn.xCutoffs = gate.xCutoffs.map(p => Math.floor(scales.yScale(p)))                        
                    }
                    if (gate.yCutoffs) {
                        toReturn.yCutoffs = gate.yCutoffs.map(p => Math.floor(scales.xScale(p)))                        
                    }
                    return toReturn
                })

                for (let i = 0; i < data.length; i += 4) {
                    // Get the position of the pixel as X and Y in real space
                    const position = [
                        i % (this.state.graphWidth * 4) / 4,
                        Math.floor(i / (this.state.graphWidth * 4))
                    ]

                    let shouldGreyscale = true
                    for (let gate of gateData) {
                        if (pointInsidePolygon(position, gate.gateData)) {
                            shouldGreyscale = false
                        } else if ((position[0] < xOffset && gate.xCutoffs && position[1] >= gate.xCutoffs[0] && position[1] <= gate.xCutoffs[1])
                            || (position[1] > this.state.graphHeight - yOffset && gate.yCutoffs && position[0] >= gate.yCutoffs[0] + xOffset && position[0] <= gate.yCutoffs[1] + xOffset)) {
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
            } else if (this.state.homologyHeight < 100) {
                // Redraw the image and greyscale any points that are outside the gate
                const imageData = context.getImageData(0, 0, this.state.graphWidth, this.state.graphHeight);
                const data = imageData.data;
                let gatesToRender = []

                for (let i = 0; i < data.length; i += 4) {
                    // Get the position of the pixel as X and Y
                    const position = [
                        (i % (this.state.graphWidth * 4)) / 4,
                        Math.floor(i / (this.state.graphWidth * 4))
                    ]

                    if (position[0] < xOffset || position[1] > this.state.graphHeight - yOffset) {
                        continue
                    }

                    // console.log(this.state.densityMap.densityMap[Math.floor(i / (this.state.graphWidth * 4))])
                    let shouldGreyscale = !this.state.densityMap.densityMap[position[1]]
                        || !this.state.densityMap.densityMap[position[1]][position[0] - xOffset]
                        || this.state.densityMap.densityMap[position[1]][position[0] - xOffset] < (this.state.homologyHeight / this.state.densityMap.maxDensity) * 100

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
            }


            let selectionMinX, selectionMaxX, selectionMinY, selectionMaxY
        }

        image.onload = () => {
            redrawGraph()
        }
    }

    updateBonusIterations (gateTemplate, iterations) {
        this.props.api.updateGateTemplateAndRecalculate(gateTemplate.id, { typeSpecificData: _.merge(gateTemplate.typeSpecificData, { bonusIterations: iterations }) })
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
        const prevPropGates = _.filter(prevProps.gates, g => g.selectedXParameterIndex === prevProps.workspace.selectedXParameterIndex && g.selectedYParameterIndex === prevProps.workspace.selectedYParameterIndex)
        const propGates = _.filter(this.props.gates, g => g.selectedXParameterIndex === this.props.workspace.selectedXParameterIndex && g.selectedYParameterIndex === this.props.workspace.selectedYParameterIndex)

        if (prevPropGates.length !== propGates.length) {
            this.createGraphLayout()
            return
        }

        for (let i = 0; i < prevPropGates.length; i++) {
            if (prevPropGates[i].polygon.length !== this.props.gates[i].polygon.length) {
                this.createGraphLayout()
                return
            }
        }

        // Update the graph if images are now available
        if (prevProps.sample.plotImages[getPlotImageKey(prevProps)] !== this.props.sample.plotImages[getPlotImageKey(this.props)]) {
            this.createGraphLayout()
            return
        }

        if (prevProps.sampleId !== this.props.sampleId) {
            this.createGraphLayout()
            return
        }

        // If the plot has been inverted
        if (prevProps.workspace.invertedAxisPlots[this.props.selectedXParameterIndex + '_' + this.props.selectedYParameterIndex] !== this.props.workspace.invertedAxisPlots[this.props.selectedXParameterIndex + '_' + this.props.selectedYParameterIndex]) {
            this.createGraphLayout()
            return
        }
    }

    render () {
        // FCS File not ready yet
        if (this.props.sample.FCSParameters.length === 0) {
            return (
                <div className='svg-outer'><svg className='axis'></svg><canvas className="canvas"/></div>
            )
        }

        const gateCreators = {}
        gateCreators[constants.GATE_CREATOR_PERSISTENT_HOMOLOGY] = 'Calculated with Persistent Homology'
        gateCreators[constants.GATE_CREATOR_MANUAL] = 'Created Manually'

        // Need to offset the whole graph if we're including cytof 0 histograms
        const xOffset = this.props.selectedMachineType === constants.MACHINE_CYTOF ? constants.CYTOF_HISTOGRAM_WIDTH : 0
        const yOffset = this.props.selectedMachineType === constants.MACHINE_CYTOF ? constants.CYTOF_HISTOGRAM_HEIGHT : 0
        const scales = getScales({
            selectedXScale: this.props.selectedXScale,
            selectedYScale: this.props.selectedYScale,
            xRange: [ this.props.sample.FCSParameters[this.props.selectedXParameterIndex].statistics.min, this.props.sample.FCSParameters[this.props.selectedXParameterIndex].statistics.max ],
            yRange: [ this.props.sample.FCSParameters[this.props.selectedYParameterIndex].statistics.min, this.props.sample.FCSParameters[this.props.selectedYParameterIndex].statistics.max ],
            width: this.state.graphWidth - xOffset,
            height:  this.state.graphHeight - yOffset
        })

        let tooltip
        const gates = this.props.gates.map((gate) => {
            const gateTemplate = _.find(this.props.gateTemplates, gt => gt.id === gate.gateTemplateId)
            const gateTemplateGroup = _.find(this.props.gateTemplateGroups, g => g.childGateTemplateIds.includes(gateTemplate.id))
            const scaledPoints = gate.gateData.map(p => [ Math.floor(scales.xScale(p[0])) + xOffset, Math.floor(scales.yScale(p[1])) ])
            const points = scaledPoints.reduce((string, point) => {
                return string + point[0] + " " + point[1] + " "
            }, "")
            if (this.state.visibleGateTooltipId === gate.id) {
                const polygonCenter = getPolygonCenter(scaledPoints)
                const tooltipWidth = 250
                const tooltipHeight = 100
                tooltip = (
                    <div className="tooltip" style={{width: tooltipWidth, height: tooltipHeight, left: (polygonCenter[0] - tooltipWidth / 2) + this.state.graphMargin.left, top: (polygonCenter[1] - tooltipHeight * 1.5) + this.state.graphMargin.top}}
                        onClick={(event) => { event.stopPropagation() }}>
                        <div className='tooltip-inner'>
                            <div className='title'>Gate Template {gateTemplate.id.substring(0, 5)}</div>
                            <div className='creator'>{gateCreators[gateTemplateGroup.creator]}</div>
                            <div className='divider'></div>
                            <div className='parameter width'>
                                <div className='text'>Additional Width:</div>
                                <div className='value'>{gateTemplate.typeSpecificData.bonusIterations}</div>
                                <i className='lnr lnr-plus-circle' onClick={this.updateBonusIterations.bind(this, gateTemplate, gateTemplate.typeSpecificData.bonusIterations + 10)} />
                                <i className='lnr lnr-circle-minus' onClick={this.updateBonusIterations.bind(this, gateTemplate, gateTemplate.typeSpecificData.bonusIterations - 10)} />
                            </div>
                        </div>
                    </div>
                )
            }
            return (
                <svg onMouseEnter={this.props.updateGateTemplate.bind(null, gateTemplate.id, { highlighted: true })}
                    onMouseLeave={this.props.updateGateTemplate.bind(null, gateTemplate.id, { highlighted: false })}
                    onContextMenu={this.showGateTooltip.bind(this, gate.id)}
                    onClick={this.selectGateTemplate.bind(this, gate.gateTemplateId)}
                    key={gate.id}>
                    <polygon points={points} className={'gate' + (gateTemplate.highlighted ? ' highlighted' : '')} />
                </svg>
            )
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
            loadingMessage = 'Generating image for plot...'
        }

        return (
            <div className='svg-outer' onClick={this.showGateTooltip.bind(this, null)}>
                <div className={`loader-outer${!this.props.sample.plotImages[getPlotImageKey(this.state)] || isLoading ? ' active' : ''}`}><div className='loader'></div><div className="text">{loadingMessage}</div></div>
                {/* D3 Axis */}
                <svg width={this.state.graphWidth + this.state.graphMargin.left + this.state.graphMargin.right} height={this.state.graphHeight + this.state.graphMargin.bottom + this.state.graphMargin.top} ref="graph" className='axis'></svg>
                {/* Gate Paths */}
                <svg width={this.state.graphWidth + this.state.graphMargin.left + this.state.graphMargin.right} height={this.state.graphHeight + this.state.graphMargin.bottom + this.state.graphMargin.top} ref="gates" className='gates'>
                    {gates}
                </svg>
                {tooltip}
                <canvas className="canvas" ref="canvas"/>
                {/*<div className='step' onClick={this.performHomologyIteration.bind(this, 15, 4)}>Step</div>*/}
            </div>
        )
    }
}