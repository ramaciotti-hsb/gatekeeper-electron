import React from 'react'
import ReactDOM from 'react-dom'
import { Component } from 'react'
import { shell } from 'electron'
import _ from 'lodash'
import path from 'path'
import * as d3 from "d3"
import Dropdown from './dropdown-inline.jsx'
import '../scss/sample-view.scss'

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

export default class SampleView extends Component {
    
    constructor(props) {
        super(props)
        this.state = {
            selectedXParameterIndex: 0,
            selectedYParameterIndex: 1,
            compressedPoints: []
        }
    }

    scrollOutputToBottom () {
        const outputContainer = ReactDOM.findDOMNode(this.refs.commandOutput)
        outputContainer.scrollTop = outputContainer.scrollHeight
    }

    redrawGraph (props) {
        if (!props.FCSFile) { return }

        const columnWidth = 50
        const rowWidth = 50

        for (let i = 0; i < props.FCSFile.dataAsNumbers.length; i++) {
            const xValue = props.FCSFile.dataAsNumbers[i][this.state.selectedXParameterIndex]
            const yValue = props.FCSFile.dataAsNumbers[i][this.state.selectedYParameterIndex]
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
        const xValue = (d) => { return d[this.state.selectedXParameterIndex] }, // data -> value
            xScale = d3.scaleLinear().range([0, width]), // value -> display
            xMap = function(d) { return xScale(xValue(d));}, // data -> display
            xAxis = d3.axisBottom().scale(xScale);

        // setup y
        const yValue = (d) => { return d[this.state.selectedYParameterIndex] }, // data -> value
            yScale = d3.scaleLinear().range([height, 0]), // value -> display
            yMap = function(d) { return yScale(yValue(d));}, // data -> display
            yAxis = d3.axisLeft().scale(yScale);

        // don't want dots overlapping axis, so add in buffer to data domain
        xScale.domain(d3.extent(props.FCSFile.dataAsNumbers, d => d[this.state.selectedXParameterIndex]));
        yScale.domain(d3.extent(props.FCSFile.dataAsNumbers, d => d[this.state.selectedYParameterIndex]));

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
          .text("Protein (g)");

        // draw dots
        custom.selectAll(".rect")
            .data(props.FCSFile.dataAsNumbers)
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

        // window.densX = kernelDensityEstimator(kernelEpanechnikov(7), props.FCSFile.dataAsNumbers.map(d => d => d[this.state.selectedXParameterIndex]))(props.FCSFile.dataAsNumbers.map(d => d => d[this.state.selectedXParameterIndex]))
        // window.densY = kernelDensityEstimator(kernelEpanechnikov(7), props.FCSFile.dataAsNumbers.map(d => d => d[this.state.selectedYParameterIndex]))(props.FCSFile.dataAsNumbers.map(d => d => d[this.state.selectedYParameterIndex]))

        // Draw each individual custom element with their properties.
        var canvas = d3.select('#graph .canvas')
          .attr('width', width)
          .attr('height', height);
        var context = canvas.node().getContext('2d');
        var elements = custom.selectAll('rect');
        // Grab all elements you bound data to in the databind() function.
        const compressedPoints = this.state.compressedPoints
        const xIndex = this.state.selectedXParameterIndex
        const yIndex = this.state.selectedYParameterIndex
        elements.each(function (d,i) { // For each virtual/custom element...
          var node = d3.select(this); 
          // This is each individual element in the loop. 
          
          const binValue = compressedPoints[(d[yIndex] - (d[yIndex] % rowWidth))][(d[xIndex] - (d[xIndex] % columnWidth))]
          context.fillStyle = heatMapColorforValue(binValue.value / 10)
          // console.log(node.style('fill'))
          // Here you retrieve the colour from the individual in-memory node and set the fillStyle for the canvas paint
          context.fillRect(node.attr('x'), node.attr('y'), node.attr('width'), node.attr('height'));
          // Here you retrieve the position of the node and apply it to the fillRect context function which will fill and paint the square.
        }); // Loop through each element.
    }

    componentDidMount() {
        this.redrawGraph(this.props)
    }

    componentWillReceiveProps(newProps) {
        // If it's a new sample or the FCS file finished loading, re render the graph
        if (newProps.id !== this.props.id || (!this.props.FCSFile && newProps.FCSFile)) {
            this.redrawGraph(newProps)
        }
    }

    handleSelectXParameter (value) {
        this.refs.xParameterDropdown.getInstance().hideDropdown()
        this.setState({
            selectedXParameterIndex: value
        }, () => {
            this.redrawGraph(this.props)
        })
    }

    handleSelectYParameter (value) {
        this.refs.yParameterDropdown.getInstance().hideDropdown()
        this.setState({
            selectedYParameterIndex: value
        }, () => {
            this.redrawGraph(this.props)
        })
    }

    render () {
        let parametersX = []
        let parametersXRendered = []

        let parametersY = []
        let parametersYRendered = []

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
                        <Dropdown items={parametersYRendered} textLabel={parametersY[this.state.selectedYParameterIndex]} ref={'yParameterDropdown'} />
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