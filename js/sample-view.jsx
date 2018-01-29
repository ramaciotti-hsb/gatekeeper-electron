import React from 'react'
import ReactDOM from 'react-dom'
import { Component } from 'react'
import _ from 'lodash'
import path from 'path'
import * as d3 from "d3"
import Dropdown from './dropdown-inline.jsx'
import '../scss/sample-view.scss'
import sessionHelper from './session-helper.js'
import fs from 'fs'
import FCS from 'fcs'
import logicleScale from './logicle.js'
import uuidv4 from 'uuid/v4'
import GrahamScan from './lib/graham-scan.js'
import polygonsIntersect from 'polygon-overlap'
import pointInsidePolygon from 'point-in-polygon'
import { distanceToPolygon, distanceBetweenPoints } from 'distance-to-polygon'
import area from 'area-polygon'

// function kernelDensityEstimator(kernel, X) {
//   return function(V) {
//     return X.map(function(x) {
//       return [x, d3.mean(V, function(v) { return kernel(x - v); })];
//     });
//   };
// }
// function kernelEpanechnikov(k) {
//   return function(v) {
//     return Math.abs(v /= k) <= 1 ? 0.75 * (1 - v * v) / k : 0;
//   };
// }

function heatMapColorforValue (value) {
    var h = (1.0 - value) * 240
    return "hsl(" + h + ", 100%, 50%)";
}

const SCALE_LINEAR = 0
const SCALE_LOG = 1
const SCALE_BIEXP = 2

const GATE_RECTANGLE = 'GATE_RECTANGLE'
const GATE_POLYGON = 'GATE_POLYGON'

export default class SampleView extends Component {
    
    constructor(props) {
        super(props)
        this.state = {
            selectedXParameterIndex: _.isUndefined(this.props.selectedXParameterIndex) ? 0 : this.props.selectedXParameterIndex,
            selectedYParameterIndex: _.isUndefined(this.props.selectedYParameterIndex) ? 1 : this.props.selectedYParameterIndex,
            selectedXScaleId: this.props.selectedXScaleId || 0,
            selectedYScaleId: this.props.selectedYScaleId || 0,
            pointCache: [], // All samples arranged in 2d array by currently selected parameters
            gateSelection: null,
            FCSFile: this.props.FCSFile || null,
            subSamples: this.props.subSamples || []
        }
        this.homologyPeaks = []
    }

    // Creates a 2d map of the samples according to the currently selected parameters
    createPointCache (d3OuterElement) {
        this.state.pointCache = []
        const state = this.state
        const points = d3OuterElement.selectAll('rect');
        points.each(function (data, index) { // For each virtual/custom element...
            const node = d3.select(this)            
            // console.log(d)
            const yVal = Math.floor(node.attr('y'))
            const xVal = Math.floor(node.attr('x'))
            if (!state.pointCache[yVal]) {
                state.pointCache[yVal] = []
            }
            if (!state.pointCache[yVal][xVal]) {
                state.pointCache[yVal][xVal] = []
            }
            state.pointCache[yVal][xVal].push({
                x: node.attr('x'),
                y: node.attr('y'),
                data: data
            })
        });
    }

    redrawGraph () {
        if (!this.state.FCSFile) { return }

        let xMin = 263000
        let xMax = 0

        let yMin = 263000
        let yMax = 0

        // Calculate minimum and maximum parameter values for the selected channels
        for (let i = 0; i < this.state.FCSFile.dataAsNumbers.length; i++) {
            const xValue = this.state.FCSFile.dataAsNumbers[i][this.state.selectedXParameterIndex]
            const yValue = this.state.FCSFile.dataAsNumbers[i][this.state.selectedYParameterIndex]

            if (xValue > xMax) { xMax = xValue }
            if (xValue < xMin) { xMin = xValue }
            if (yValue > yMax) { yMax = yValue }
            if (yValue < yMin) { yMin = yValue }
        }

        d3.selectAll("svg > *").remove();

        const margin = {top: 20, right: 20, bottom: 20, left: 50},
            width = 600 - margin.left - margin.right,
            height = 460 - margin.top - margin.bottom;
        /* 
         * value accessor - returns the value to encode for a given data object.
         * scale - maps value to a visual display encoding, such as a pixel position.
         * map function - maps from data value to display value
         * axis - sets up axis
         */ 

        // setup x 
        let xValue = (d) => { return d[this.state.selectedXParameterIndex] } // data -> value
        let xScale
        // Linear Scale
        if (this.state.selectedXScaleId === SCALE_LINEAR) {
            xScale = d3.scaleLinear().range([0, width]) // value -> display
            // don't want dots overlapping axis, so add in buffer to data domain
            xScale.domain(d3.extent(this.state.FCSFile.dataAsNumbers, d => d[this.state.selectedXParameterIndex]));
        // Log Scale
        } else if (this.state.selectedXScaleId === SCALE_LOG) {
            // Log scale will break for values <= 0
            xValue = (d) => { return Math.max(0.1, d[this.state.selectedXParameterIndex]) }
            xScale = d3.scaleLog()
                .range([0, width])
                .base(Math.E)
                .domain([Math.exp(Math.log(Math.max(0.1, xMin))), Math.exp(Math.log(xMax))])
        // Biexponential Scale
        } else if (this.state.selectedXScaleId === SCALE_BIEXP) {
            xScale = logicleScale().range([0, width])
        }
        const xMap = function(d) { return xScale(xValue(d)) } // data -> display
        const xAxis = d3.axisBottom().scale(xScale).tickFormat(d3.format(".2s"))

        // setup y
        let yValue = (d) => { return d[this.state.selectedYParameterIndex] }
        let yScale
        if (this.state.selectedYScaleId === SCALE_LINEAR) {
            yScale = d3.scaleLinear().range([height, 0]) // value -> display
            yScale.domain(d3.extent(this.state.FCSFile.dataAsNumbers, d => d[this.state.selectedYParameterIndex]));
        // Log Scale
        } else if (this.state.selectedYScaleId === SCALE_LOG) {
            yValue = (d) => { return Math.max(0.1, d[this.state.selectedYParameterIndex]) } // data -> value
            yScale = d3.scaleLog()
                .range([height, 0])
                .base(Math.E)
                .domain([Math.exp(Math.log(Math.max(0.1, yMin))), Math.exp(Math.log(yMax))])
        // Biexponential Scale
        } else if (this.state.selectedYScaleId === SCALE_BIEXP) {
            yScale = logicleScale().range([height, 0])
        }
        const yMap = function(d) { return yScale(yValue(d)) } // data -> display
        const yAxis = d3.axisLeft().scale(yScale).tickFormat(d3.format(".2s"))

        const columnWidth = 1
        const rowWidth = 10

        const color = d3.scaleOrdinal(d3.schemeCategory10)
        const svg = d3.select("svg")
        const custom = d3.select(document.createElement('custom'))
        // const tooltip = d3.select("#tooltip")
        // x-axis
        svg.append("g")
          .attr("class", "x axis")
          .attr("transform", "translate(0," + height + ")")
          .call(xAxis)
        .append("text")
          .attr("class", "label")
          .attr("x", width)
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

        // draw dots
        custom.selectAll(".rect")
            .data(this.state.FCSFile.dataAsNumbers)
            .enter().append("rect")
            .attr("class", "rect")
            .attr("width", 1)
            .attr("height", 1)
            .attr("x", xMap)
            .attr("y", yMap)
            .style("fill", "blue")
            // .on("mouseover", function(d) {
            //     tooltip.transition()
            //        .duration(200)
            //        .style("opacity", .9);
            //     tooltip.html("(" + xValue(d) + ", " + yValue(d) + ")")
            //        .style("left", (d3.event.pageX + 5) + "px")
            //        .style("top", (d3.event.pageY - 28) + "px");
            // })
            // .on("mouseout", function(d) {
            //       tooltip.transition()
            //       .duration(500)
            //       .style("opacity", 0);
            // });

        this.createPointCache(custom)

        // window.densX = kernelDensityEstimator(kernelEpanechnikov(7), this.state.FCSFile.dataAsNumbers.map(d => d => d[this.state.selectedXParameterIndex]))(this.state.FCSFile.dataAsNumbers.map(d => d => d[this.state.selectedXParameterIndex]))
        // window.densY = kernelDensityEstimator(kernelEpanechnikov(7), this.state.FCSFile.dataAsNumbers.map(d => d => d[this.state.selectedYParameterIndex]))(this.state.FCSFile.dataAsNumbers.map(d => d => d[this.state.selectedYParameterIndex]))

        let selectionMinX, selectionMaxX, selectionMinY, selectionMaxY

        const redrawCanvasPoints = () => {
            // Draw each individual custom element with their properties.
            var canvas = d3.select('.canvas')
              .attr('width', width)
              .attr('height', height);
            var context = canvas.node().getContext('2d');
            var elements = custom.selectAll('rect');

            context.fillStyle = '#999'
            // Determine if there are any 2d gates in the subsamples that match these parameters
            let gatesExist = false
            for (let subSample of this.state.subSamples) {
                if (subSample.type === 'gate' &&
                    subSample.gate.xParameterIndex === this.state.selectedXParameterIndex && 
                    subSample.gate.yParameterIndex === this.state.selectedYParameterIndex) {
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

                // Then go through all gates and render points inside them as blue
                let shouldDisplay = false
                for (let i = 0; i < this.state.subSamples.length; i++) {
                    const subSample = this.state.subSamples[i]
                    if (subSample.type !== 'gate' ||
                    subSample.gate.xParameterIndex !== this.state.selectedXParameterIndex || 
                    subSample.gate.yParameterIndex !== this.state.selectedYParameterIndex) { continue }

                    if (subSample.gate.type === GATE_RECTANGLE) {
                        const gate = subSample.gate
                        const minX = Math.floor(Math.min(gate.x1, gate.x2) - 50)
                        const minY = Math.floor(Math.min(gate.y1, gate.y2) - 20)
                        const maxX = Math.floor(Math.max(gate.x1, gate.x2) - 50)
                        const maxY = Math.floor(Math.max(gate.y1, gate.y2) - 20)

                        for (let y = minY; y < maxY; y++) {
                            const column = this.state.pointCache[y]
                            if (!column) { continue }

                            for (let x = minX; x < maxX; x++) {
                                let row = column[x]
                                if (!row) { continue }

                                let density = 0
                                let densityWidth = 1

                                // Calculate the density of neighbouring points
                                for (let i = y - densityWidth; i < y + densityWidth; i++) {
                                    const columnDens = this.state.pointCache[i]
                                    if (!columnDens) { continue }

                                    for (let j = x - densityWidth; j < x + densityWidth; j++) {
                                        const rowDens = this.state.pointCache[i][j]
                                        if (!rowDens) { continue }

                                        density += rowDens.length
                                    }
                                }

                                for (let p = 0; p < row.length; p++) {
                                    const point = row[p]

                                    context.fillStyle = heatMapColorforValue(Math.min(density / 40, 1))
                                    context.fillRect(point.x, point.y, 1, 1)
                                }
                            }
                        }

                        gate.outline = svg.append("path")
                          .attr("class", "gate")
                          .attr("d", rect(minX + 50, minY + 20, maxX - minX, maxY - minY))
                    } else if (subSample.gate.type === GATE_POLYGON) {
                        for (let y = 0; y < this.state.pointCache.length; y++) {
                            const column = this.state.pointCache[y]
                            if (!column || column.length === 0) { continue }

                            for (let x = 0; x < column.length; x++) {
                                const row = column[x]
                                if (!row || row.length === 0) { continue }

                                let density = 0
                                let densityWidth = 1

                                // Calculate the density of neighbouring points
                                for (let i = y - densityWidth; i < y + densityWidth; i++) {
                                    const columnDens = this.state.pointCache[i]
                                    if (!columnDens) { continue }

                                    for (let j = x - densityWidth; j < x + densityWidth; j++) {
                                        const rowDens = this.state.pointCache[i][j]
                                        if (!rowDens) { continue }

                                        density += rowDens.length
                                    }
                                }

                                if (pointInsidePolygon([x, y], subSample.gate.polygon)) {
                                    context.fillStyle = heatMapColorforValue(Math.min(density / 40, 1))
                                    context.fillRect(x, y, 1, 1)
                                }
                            }
                        }

                        // Render polygons
                        svg.append("polygon")
                          .attr("class", "gate")
                          .attr("points", subSample.gate.polygon.join(' '))
                    }
                }
            } else if (this.state.homologyHeight) {
                // If there are no gates drawn
                // Render all points based on density
                for (let y = 0; y < this.state.pointCache.length; y++) {
                    const column = this.state.pointCache[y]
                    if (!column || column.length === 0) { continue }

                    for (let x = 0; x < column.length; x++) {
                        const row = column[x]
                        if (!row || row.length === 0) { continue }

                        let density = 0
                        let densityWidth = 2

                        // Calculate the density of neighbouring points
                        for (let i = y - densityWidth; i < y + densityWidth; i++) {
                            const columnDens = this.state.pointCache[i]
                            if (!columnDens) { continue }

                            for (let j = x - densityWidth; j < x + densityWidth; j++) {
                                const rowDens = this.state.pointCache[i][j]
                                if (!rowDens) { continue }

                                density += rowDens.length
                            }
                        }

                        if (density >= this.state.homologyHeight) {
                            let foundPeak = false
                            for (var i = 0; i < this.homologyPeaks.length; i++) {
                                const peak = this.homologyPeaks[i]
                                // If the new point is outside the peak polygon
                                if (!pointInsidePolygon([x, y], peak.polygon)) {
                                    // If the new point is close enough to the edge, expand the polygon to accomodate it
                                    const distance = peak.polygon.length === 1 ? distanceBetweenPoints([x, y], peak.polygon[0]) : distanceToPolygon([x, y], peak.polygon)
                                    if (distance < 12 && distance > 0) {
                                        peak.pointsToAdd.push([x, y])
                                        foundPeak = true
                                        break
                                    } else if (distance === 0) {
                                        foundPeak = true
                                        break
                                    }
                                } else {
                                    foundPeak = true
                                    break
                                }
                            }

                            if (!foundPeak || this.homologyPeaks.length === 0) {
                                this.homologyPeaks.push({
                                    polygon: [[x, y]],
                                    height: 0,
                                    pointsToAdd: []
                                })
                            }

                            context.fillStyle = heatMapColorforValue(Math.min(density / 40, 1))
                            context.fillRect(x, y, 1, 1)
                        }
                    }
                }

                // Add new points and recalculate polygons
                for (let peak of this.homologyPeaks) {
                    if (peak.pointsToAdd.length > 0) {
                        const polyCopy = peak.polygon.concat(peak.pointsToAdd)
                        // Recalculate the polygon boundary
                        const grahamScan = new GrahamScan();
                        polyCopy.map(p => grahamScan.addPoint(p[0], p[1]))
                        const newPolygon = grahamScan.getHull().map(p => [p.x, p.y])
                        // Only add to the polygon if it wouldn't expand the entire thing by more than 20%
                        peak.polygon = newPolygon
                        peak.pointsToAdd = []
                    }
                }

                // Merge overlapping polygons
                for (let i = 0; i < this.homologyPeaks.length; i++) {
                    for (let j = i + 1; j < this.homologyPeaks.length; j++) {
                        if (polygonsIntersect(this.homologyPeaks[i].polygon, this.homologyPeaks[j].polygon)) {
                            console.log('polygon height of', this.homologyPeaks[i], ' before merging:', this.homologyPeaks[i].height)
                            console.log('polygon height of', this.homologyPeaks[j], ' before merging:', this.homologyPeaks[j].height)
                            const newPolygon = this.homologyPeaks[i].polygon.concat(this.homologyPeaks[j].polygon)
                            this.homologyPeaks.splice(i, 1, { polygon: newPolygon })
                            this.homologyPeaks.splice(j, 1)
                            j--
                            // Rebuild polygons after combining
                            const grahamScan = new GrahamScan();
                            this.homologyPeaks[i].polygon.map(p => grahamScan.addPoint(p[0], p[1]))
                            this.homologyPeaks[i].polygon = grahamScan.getHull().map(p => [p.x, p.y])
                            this.homologyPeaks[i].height = 0
                            this.homologyPeaks[i].pointsToAdd = []
                        }
                    }
                }

                // Render polygons
                for (let peak of this.homologyPeaks) {
                    peak.height++
                    svg.append("polygon")
                      .attr("class", "gate")
                      .attr("points", peak.polygon.join(' '))
                }
            } else {
                // If there are no gates drawn
                // Render all points based on density
                let maxDensity = 0
                for (let y = 0; y < this.state.pointCache.length; y++) {
                    const column = this.state.pointCache[y]
                    if (!column || column.length === 0) { continue }

                    for (let x = 0; x < column.length; x++) {
                        const row = column[x]
                        if (!row || row.length === 0) { continue }

                        let density = 0
                        let densityWidth = 1

                        // Calculate the density of neighbouring points
                        for (let i = y - densityWidth; i < y + densityWidth; i++) {
                            const columnDens = this.state.pointCache[i]
                            if (!columnDens) { continue }

                            for (let j = x - densityWidth; j < x + densityWidth; j++) {
                                const rowDens = this.state.pointCache[i][j]
                                if (!rowDens) { continue }

                                density += rowDens.length
                            }
                        }

                        maxDensity = density > maxDensity ? density : maxDensity

                        for (let p = 0; p < row.length; p++) {
                            const point = row[p]

                            context.fillStyle = heatMapColorforValue(Math.min(density / 40, 1))
                            context.fillRect(point.x, point.y, 1, 1)
                        }
                    }
                }
            }
        }

        redrawCanvasPoints()

        // Create bindings for drawing rectangle gates
        function rect(x, y, w, h) {
            x -= 50
            y -= 20

            // Limit to the area of the scatter plot
            if (w > 0) {
                // If the width is positive, cap at rightmost boundary
                w = Math.min(w, width - x)
            } else {
                // If the width is negative, cap at leftmost boundary
                w = Math.max(w, -x)
            }

            if (h > 0) {
                // If the height is positive, cap at lower boundary (coords start from top left and y increases downwards)
                h = Math.min(h, height - y)
            } else {
                // If the height is negative, cap at upper boundary (0)
                h = Math.max(h, -y)
            }
            return "M" + [x, y] + " l" + [w, 0] + " l" + [0, h] + " l" + [-w, 0] + "z";
        }

        var selection = svg.append("path")
          .attr("class", "selection")
          .attr("visibility", "hidden");

        var startSelection = function(start) {
            selection.attr("d", rect(start[0], start[0], 0, 0))
              .attr("visibility", "visible");
            redrawCanvasPoints()
        };

        var moveSelection = function(start, moved) {
            selection.attr("d", rect(start[0], start[1], moved[0]-start[0], moved[1]-start[1]));
        };

        var endSelection = (start, end) => {
            selection.attr("visibility", "hidden");
            const FCSFile = {
                dataAsNumbers: [],
                text: this.state.FCSFile.text
            }
            const gate = {
                type: GATE_RECTANGLE,
                x1: start[0],
                y1: start[1],
                x2: Math.min(Math.max(50, end[0]), width + 50),
                y2: Math.min(Math.max(20, end[1]), height + 20),
                xParameterIndex: this.state.selectedXParameterIndex,
                yParameterIndex: this.state.selectedYParameterIndex
            }
            // Calculate all the samples that are matched inside the gate
            const minX = Math.floor(Math.min(gate.x1, gate.x2) - 50)
            const minY = Math.floor(Math.min(gate.y1, gate.y2) - 20)
            const maxX = Math.floor(Math.max(gate.x1, gate.x2) - 50)
            const maxY = Math.floor(Math.max(gate.y1, gate.y2) - 20)

            for (let y = minY; y < maxY; y++) {
                const column = this.state.pointCache[y]
                if (!column) { continue }

                for (let x = minX; x < maxX; x++) {
                    let row = column[x]
                    if (!row) { continue }

                    for (let p = 0; p < row.length; p++) {
                        const point = row[p]
                        FCSFile.dataAsNumbers.push(point.data)
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

            selectionMinX = null
            selectionMaxX = null
            selectionMinY = null
            selectionMaxY = null
            sessionHelper.saveSessionStateToDisk()
            this.props.reloadWorkspaceView()
            redrawCanvasPoints()
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

    stepHomology () {
        if (!this.state.homologyHeight) {
            this.setState({ homologyHeight: 150 }, () => { this.redrawGraph() })
        } else {
            console.log('Homology height:', this.state.homologyHeight - 1)
            this.setState({ homologyHeight: this.state.homologyHeight - 1}, () => { this.redrawGraph() })
        }
    }

    calculateHomology () {
        const truePeaks = []

        for (let hom = 150; hom >= 0; hom--) {
            console.log('calculating homology height', hom)
            for (let y = 0; y < this.state.pointCache.length; y++) {
                const column = this.state.pointCache[y]
                if (!column || column.length === 0) { continue }

                for (let x = 0; x < column.length; x++) {
                    const row = column[x]
                    if (!row || row.length === 0) { continue }

                    let density = 0
                    let densityWidth = 2

                    // Calculate the density of neighbouring points
                    for (let i = y - densityWidth; i < y + densityWidth; i++) {
                        const columnDens = this.state.pointCache[i]
                        if (!columnDens) { continue }

                        for (let j = x - densityWidth; j < x + densityWidth; j++) {
                            const rowDens = this.state.pointCache[i][j]
                            if (!rowDens) { continue }

                            density += rowDens.length
                        }
                    }

                    if (density >= hom) {
                        let foundPeak = false
                        for (var i = 0; i < this.homologyPeaks.length; i++) {
                            const peak = this.homologyPeaks[i]
                            // If the new point is outside the peak polygon
                            if (!pointInsidePolygon([x, y], peak.polygon)) {
                                // If the new point is close enough to the edge, expand the polygon to accomodate it
                                const distance = peak.polygon.length === 1 ? distanceBetweenPoints([x, y], peak.polygon[0]) : distanceToPolygon([x, y], peak.polygon)
                                if (distance < 15 && distance > 0) {
                                    peak.pointsToAdd.push([x, y])
                                    foundPeak = true
                                    break
                                } else if (distance === 0) {
                                    foundPeak = true
                                    break
                                }
                            } else {
                                foundPeak = true
                                break
                            }
                        }

                        if (!foundPeak || this.homologyPeaks.length === 0) {
                            this.homologyPeaks.push({
                                polygon: [[x, y]],
                                height: 0,
                                pointsToAdd: []
                            })
                        }
                    }
                }
            }

            // Add new points and recalculate polygons
            for (let peak of this.homologyPeaks) {
                if (peak.pointsToAdd.length > 0) {
                    const polyCopy = peak.polygon.concat(peak.pointsToAdd)
                    // Recalculate the polygon boundary
                    const grahamScan = new GrahamScan();
                    polyCopy.map(p => grahamScan.addPoint(p[0], p[1]))
                    const newPolygon = grahamScan.getHull().map(p => [p.x, p.y])
                    // Only add to the polygon if it wouldn't expand the entire thing by more than 20%
                    peak.polygon = newPolygon
                    peak.pointsToAdd = []
                }
            }

            // Merge overlapping polygons
            for (let i = 0; i < this.homologyPeaks.length; i++) {
                let intersected = false
                for (let j = i + 1; j < this.homologyPeaks.length; j++) {
                    if (polygonsIntersect(this.homologyPeaks[i].polygon, this.homologyPeaks[j].polygon)) {
                        console.log('polygon height of', this.homologyPeaks[i], ' before merging:', this.homologyPeaks[i].height)
                        console.log('polygon height of', this.homologyPeaks[j], ' before merging:', this.homologyPeaks[j].height)
                        if (this.homologyPeaks[i].height >= 5) {
                            truePeaks.push(this.homologyPeaks[i])
                        }
                        if (this.homologyPeaks[j].height >= 5) {
                            truePeaks.push(this.homologyPeaks[j])
                        }
                        const newPolygon = this.homologyPeaks[i].polygon.concat(this.homologyPeaks[j].polygon)
                        this.homologyPeaks.splice(i, 1, { polygon: newPolygon, height: 0 })
                        this.homologyPeaks.splice(j, 1)
                        j--
                        // Rebuild polygons after combining
                        const grahamScan = new GrahamScan();
                        this.homologyPeaks[i].polygon.map(p => grahamScan.addPoint(p[0], p[1]))
                        this.homologyPeaks[i].polygon = grahamScan.getHull().map(p => [p.x, p.y])
                        this.homologyPeaks[i].pointsToAdd = []
                        intersected = true
                    }
                }
                if (!intersected) {
                    this.homologyPeaks[i].height++
                }
            }
        }

        // Finally, remote any polygons that are completely inside other polygons
        for (let i = 0; i < truePeaks.length; i++) {
            for (let j = i + 1; j < truePeaks.length; j++) {
                let inside = true
                for (let point of truePeaks[j].polygon) {
                    if (!pointInsidePolygon(point, truePeaks[i].polygon)) {
                        inside = false
                    }
                }
                
                if (inside) {
                    truePeaks.splice(j, 1)
                    j--
                }

                inside = true
                for (let point of truePeaks[i].polygon) {
                    if (!pointInsidePolygon(point, truePeaks[j].polygon)) {
                        inside = false
                    }
                }
                
                if (inside) {
                    truePeaks.splice(i, 1)
                    i--
                    break
                }
            }   
        }

        for (let peak of truePeaks) {
            const FCSFile = {
                dataAsNumbers: [],
                text: this.state.FCSFile.text
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
                    type: GATE_POLYGON,
                    polygon: peak.polygon,
                    xParameterIndex: this.state.selectedXParameterIndex,
                    yParameterIndex: this.state.selectedYParameterIndex
                },
                FCSFile: FCSFile,
                selectedXParameterIndex: this.selectedXParameterIndex,
                selectedYParameterIndex: this.selectedYParameterIndex,
                selectedXScaleId: this.selectedXScaleId,
                selectedYScaleId: this.selectedYScaleId
            })
        }

        sessionHelper.saveSessionStateToDisk()
        this.props.reloadWorkspaceView()
        this.redrawGraph()
    }

    readFCSFileData (filePath) {
        if (!filePath) { console.log("Error: undefined FCS file passed to readFCSFileData"); return }
        // Read in the data from the FCS file
        fs.readFile(filePath, (error, buffer) => {
            if (error) {
                console.log('Error reading FCS file: ', error)
            } else {
                this.setState({
                    FCSFile: new FCS({ dataFormat: 'asNumber', eventsToRead: -1 }, buffer)
                }, () => {
                    this.redrawGraph()
                })
            }
        })
    }

    componentDidMount() {
        if (this.props.filePath) {
            this.readFCSFileData(this.props.filePath)
        } else {
            this.redrawGraph()
        }
    }

    componentWillReceiveProps(newProps) {
        // If it's a new sample, re render the graph
        if (newProps.id !== this.props.id) {
            this.setState({
                selectedXParameterIndex: _.isUndefined(newProps.selectedXParameterIndex) ? 0 : newProps.selectedXParameterIndex,
                selectedYParameterIndex: _.isUndefined(newProps.selectedYParameterIndex) ? 1 : newProps.selectedYParameterIndex,
                selectedXScaleId: newProps.selectedXScaleId || 0,
                selectedYScaleId: newProps.selectedYScaleId || 0,
                subSamples: newProps.subSamples || [],
                FCSFile: newProps.FCSFile || null
            }, () => {
                if (newProps.filePath) {
                    this.readFCSFileData(newProps.filePath)
                } else {
                    this.redrawGraph()
                }
            })
        }
    }

    handleSelectXParameter (value) {
        this.refs.xParameterDropdown.getInstance().hideDropdown()
        this.setState({
            selectedXParameterIndex: value
        }, () => {
            sessionHelper.saveSessionStateToDisk()
            this.redrawGraph()
        })
    }

    handleSelectYParameter (value) {
        this.refs.yParameterDropdown.getInstance().hideDropdown()
        this.setState({
            selectedYParameterIndex: value
        }, () => {
            sessionHelper.saveSessionStateToDisk()
            this.redrawGraph()
        })
    }

    handleSelectXScale (value) {
        this.refs.xScaleDropdown.getInstance().hideDropdown()
        this.setState({
            selectedXScaleId: value
        }, () => {
            sessionHelper.saveSessionStateToDisk()
            this.redrawGraph()
        })
    }

    handleSelectYScale (value) {
        this.refs.yScaleDropdown.getInstance().hideDropdown()
        this.setState({
            selectedYScaleId: value
        }, () => {
            sessionHelper.saveSessionStateToDisk()
            this.redrawGraph()
        })
    }

    // Roll up the data that needs to be saved from this object and any children
    getDataRepresentation () {
        const representation = {
            id: this.props.id,
            title: this.props.title,
            description: this.props.description,
            type: this.props.type,
            filePath: this.props.filePath,
            selectedXParameterIndex: this.state.selectedXParameterIndex,
            selectedYParameterIndex: this.state.selectedYParameterIndex,
            selectedXScaleId: this.state.selectedXScaleId,
            selectedYScaleId: this.state.selectedYScaleId,
            gates: this.state.gates,
            FCSFile: this.state.FCSFile,
            subSamples: this.state.subSamples
        }

        if (this.props.gate) {
            representation.gate = this.props.gate            
        }

        return representation
    }

    render () {
        let parametersX = []
        let parametersXRendered = []

        let parametersY = []
        let parametersYRendered = []

        let scalesX = [
            {
                id: SCALE_LINEAR,
                label: 'Linear'
            }, 
            {
                id: SCALE_LOG,
                label: 'Log'
            },
            {
                id: SCALE_BIEXP,
                label: 'Biexp'
            }
        ]
        let scalesXRendered = []

        let scalesY = [
            {
                id: SCALE_LINEAR,
                label: 'Linear'
            }, 
            {
                id: SCALE_LOG,
                label: 'Log'
            },
            {
                id: SCALE_BIEXP,
                label: 'Biexp'
            }
        ]
        let scalesYRendered = []

        if (this.state.FCSFile) {
            _.keys(this.state.FCSFile.text).map((param) => {
                if (param.match(/^\$P.+N$/)) { // Get parameter names
                    const parameterName = this.state.FCSFile.text[param]
                    parametersX.push(parameterName)
                    parametersXRendered.push({
                        value: parameterName,
                        component: <div className='item' onClick={this.handleSelectXParameter.bind(this, parametersX.length - 1)} key={parametersX.length - 1}>{parameterName}</div>
                    })
                }
            })

            _.keys(this.state.FCSFile.text).map((param) => {
                if (param.match(/^\$P.+N$/)) { // Get parameter names
                    const parameterName = this.state.FCSFile.text[param]
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

        return (
            <div className='panel sample'>
                <div className='header'>{this.props.title}</div>
                <div className='panel-inner'>
                    <div className='graph'>
                        <div className='graph-upper'>
                            <div className='axis-selection y'>
                                <Dropdown items={parametersYRendered} textLabel={parametersY[this.state.selectedYParameterIndex]} ref={'yParameterDropdown'} />
                                <Dropdown items={scalesYRendered} textLabel={scalesY[this.state.selectedYScaleId].label} outerClasses={'scale'} ref={'yScaleDropdown'} />
                            </div>
                            <div className='svg-outer'>
                                <svg width={600} height={460} ref="graph"></svg>
                                <canvas className="canvas"/>
                                <div className='axis-selection x'>
                                    <Dropdown items={parametersXRendered} textLabel={parametersX[this.state.selectedXParameterIndex]} ref={'xParameterDropdown'} />
                                    <Dropdown items={scalesXRendered} textLabel={scalesX[this.state.selectedXScaleId].label} outerClasses={'scale'} ref={'xScaleDropdown'} />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className='homology'>
                        Homology
                        <div className='step-forward' onClick={this.stepHomology.bind(this)}>Step Forward</div>
                        <div className='step-forward' onClick={this.calculateHomology.bind(this)}>Create gates</div>
                    </div>
                </div>
            </div>
        )
    }
}