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

export default class SampleView extends Component {
    
    constructor(props) {
        super(props)
        this.state = {
            selectedXParameterIndex: this.props.selectedXParameterIndex || 0,
            selectedYParameterIndex: this.props.selectedYParameterIndex || 1,
            selectedXScaleId: this.props.selectedXScaleId || 0,
            selectedYScaleId: this.props.selectedYScaleId || 0,
            compressedPoints: []
        }
    }

    redrawGraph () {
        if (!this.state.FCSFile) { return }

        this.state.compressedPoints = []


        let xMin = 263000
        let xMax = 0

        let yMin = 263000
        let yMax = 0

        // Put the data into square bins to calculate 2d density
        for (let i = 0; i < this.state.FCSFile.dataAsNumbers.length; i++) {
            const xValue = this.state.FCSFile.dataAsNumbers[i][this.state.selectedXParameterIndex]
            const yValue = this.state.FCSFile.dataAsNumbers[i][this.state.selectedYParameterIndex]

            if (xValue > xMax) { xMax = xValue }
            if (xValue < xMin) { xMin = xValue }
            if (yValue > yMax) { yMax = yValue }
            if (yValue < yMin) { yMin = yValue }
        }

        d3.selectAll("svg > *").remove();

        const margin = {top: 20, right: 20, bottom: 30, left: 40},
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

        // Put the data into square bins to calculate 2d density
        for (let i = 0; i < this.state.FCSFile.dataAsNumbers.length; i++) {
            let xValue
            if (this.state.selectedXScaleId === SCALE_BIEXP) {
                xValue = Math.floor(xScale(this.state.FCSFile.dataAsNumbers[i][this.state.selectedXParameterIndex]))
            } else {
                xValue = this.state.FCSFile.dataAsNumbers[i][this.state.selectedXParameterIndex]
            }

            let yValue
            if (this.state.selectedYScaleId === SCALE_BIEXP) {
                yValue = Math.floor(yScale(this.state.FCSFile.dataAsNumbers[i][this.state.selectedYParameterIndex]))
            } else {
                yValue = this.state.FCSFile.dataAsNumbers[i][this.state.selectedYParameterIndex]
            }

            const row = (yValue - (yValue % rowWidth))
            const column = (xValue - (xValue % columnWidth))
            
            if (!this.state.compressedPoints[row]) {
                this.state.compressedPoints[row] = []
            }

            if (!this.state.compressedPoints[row][column]) {
                this.state.compressedPoints[row][column] = {
                    xbin: column,
                    ybin: row,
                    value: 1
                }
            } else {
                this.state.compressedPoints[row][column].value++
            }
        }

        const color = d3.scaleOrdinal(d3.schemeCategory10)
        const svg = d3.select("svg")
        const custom = d3.select(document.createElement('custom'))
        const tooltip = d3.select("#tooltip")
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

        // window.densX = kernelDensityEstimator(kernelEpanechnikov(7), this.state.FCSFile.dataAsNumbers.map(d => d => d[this.state.selectedXParameterIndex]))(this.state.FCSFile.dataAsNumbers.map(d => d => d[this.state.selectedXParameterIndex]))
        // window.densY = kernelDensityEstimator(kernelEpanechnikov(7), this.state.FCSFile.dataAsNumbers.map(d => d => d[this.state.selectedYParameterIndex]))(this.state.FCSFile.dataAsNumbers.map(d => d => d[this.state.selectedYParameterIndex]))

        // Draw each individual custom element with their properties.
        var canvas = d3.select('#graph .canvas')
          .attr('width', width)
          .attr('height', height);
        var context = canvas.node().getContext('2d');
        var elements = custom.selectAll('rect');
        // Grab all elements you bound data to in the databind() function.
        const state = this.state
        elements.each(function (d,i) { // For each virtual/custom element...
            // console.log(d)
            var node = d3.select(this); 
            // This is each individual element in the loop. 
            // console.log(xScale(d[xIndex]))
            let binYValue
            if (state.selectedYScaleId === SCALE_BIEXP) {
                binYValue = Math.floor(yScale(d[state.selectedYParameterIndex])) - (Math.floor(yScale(d[state.selectedYParameterIndex])) % rowWidth)
            } else {
                binYValue = d[state.selectedYParameterIndex] - (d[state.selectedYParameterIndex] % rowWidth)
            }

            let binXValue
            if (state.selectedXScaleId === SCALE_BIEXP) {
                binXValue = Math.floor(xScale(d[state.selectedXParameterIndex])) - (Math.floor(xScale(d[state.selectedXParameterIndex])) % columnWidth)
            } else {
                binXValue = d[state.selectedXParameterIndex] - (d[state.selectedXParameterIndex] % columnWidth)
            }

            const binValue = state.compressedPoints[binYValue][binXValue]

            // const binValue = compressedPoints[(d[yIndex] - (d[yIndex] % rowWidth))][(Math.floor(xScale(d[xIndex])) - (Math.floor(xScale(d[xIndex])) % columnWidth))]
            context.fillStyle = heatMapColorforValue(Math.min(binValue.value / 10, 1))
            // console.log(node.style('fill'))
            // Here you retrieve the colour from the individual in-memory node and set the fillStyle for the canvas paint
            context.fillRect(node.attr('x'), node.attr('y'), node.attr('width'), node.attr('height'));
        }); // Loop through each element.
    }

    readFCSFileData (filePath) {
        if (!filePath) { console.log("Error: undefined FCS file passed to readFCSFileData"); return }
        // Read in the data from the FCS file
        fs.readFile(filePath, (error, buffer) => {
            if (error) {
                console.log('Error reading FCS file: ', error)
            } else {
                this.setState({
                    FCSFile: new FCS({ dataFormat: 'asNumber', eventsToRead: -1 }, buffer),
                    compressedPoints: []
                }, () => {
                    this.redrawGraph()
                })
            }
        })
    }

    componentDidMount() {
        this.readFCSFileData(this.props.filePath)
    }

    componentWillReceiveProps(newProps) {
        // If it's a new sample, re render the graph
        if (newProps.id !== this.props.id) {
            this.setState({
                selectedXParameterIndex: newProps.selectedXParameterIndex || 0,
                selectedYParameterIndex: newProps.selectedYParameterIndex || 1
            }, () => { this.readFCSFileData(newProps.filePath) })
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
        return {
            id: this.props.id,
            title: this.props.title,
            description: this.props.description,
            type: this.props.type,
            filePath: this.props.filePath,
            selectedXParameterIndex: this.state.selectedXParameterIndex,
            selectedYParameterIndex: this.state.selectedYParameterIndex,
            selectedXScaleId: this.state.selectedXScaleId,
            selectedYScaleId: this.state.selectedYScaleId
        }
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
                        <svg width={600} height={460} ref="graph"></svg>
                        <div id="graph"><canvas className="canvas"/></div>
                        <div id="tooltip"></div>
                    </div>
                    <div className='axis-selection'>
                        <Dropdown items={parametersXRendered} textLabel={parametersX[this.state.selectedXParameterIndex]} ref={'xParameterDropdown'} />
                        <Dropdown items={scalesXRendered} textLabel={scalesX[this.state.selectedXScaleId].label} outerClasses={'scale'} ref={'xScaleDropdown'} />
                        <div className='versus'>vs</div>
                        <Dropdown items={parametersYRendered} textLabel={parametersY[this.state.selectedYParameterIndex]} ref={'yParameterDropdown'} />
                        <Dropdown items={scalesYRendered} textLabel={scalesY[this.state.selectedYScaleId].label} outerClasses={'scale'} ref={'yScaleDropdown'} />
                    </div>
                    <div className='command-actions'>
                        <div className='delete' onClick={this.props.deleteSample}>
                            <span className="lnr lnr-cross-circle"></span>
                            Delete Sample
                        </div>
                    </div>
                </div>
            </div>
        )
    }
}