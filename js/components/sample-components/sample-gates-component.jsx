// -------------------------------------------------------------------------
// React component for rendering gates that create subsamples.
// -------------------------------------------------------------------------

import React from 'react'
import ReactDOM from 'react-dom'
import { Component } from 'react'
import _ from 'lodash'
import constants from '../../lib/constants'
import pointInsidePolygon from 'point-in-polygon'
import { heatMapHSLStringForValue, getScalesForSample, getPlotImageKey } from '../../lib/utilities.js'
import '../../../scss/sample-view/sample-gates.scss'

const GATE_WIDTH = 200
const GATE_HEIGHT = 140
const GATE_RATIO = GATE_WIDTH / GATE_HEIGHT
const INVERSE_GATE_RATIO = GATE_HEIGHT / GATE_WIDTH

export default class SampleGates extends Component {

    renderGatePreview () {
        for (let gate of this.props.gates) {
            const scaleSample = {
                FCSParameters: _.cloneDeep(this.props.sample.FCSParameters),
                selectedXParameterIndex: gate.selectedXParameterIndex,
                selectedYParameterIndex: gate.selectedYParameterIndex,
                selectedXScale: gate.selectedXScale,
                selectedYScale: gate.selectedYScale
            }
            const scales = getScalesForSample(scaleSample, this.props.graphWidth, this.props.graphHeight)
            // Get the center point of where the gate is targeted
            let x1Boundary, x2Boundary, y1Boundary, y2Boundary
            if (gate.type === constants.GATE_TYPE_POLYGON) {
                // Iterate through the polygon vertices and get the min / max values for drawing squares
                for (let i = 0; i < gate.gateData.length; i++) {
                    const xValue = scales.xScale(gate.gateData[i][0])
                    const yValue = scales.yScale(gate.gateData[i][1])
                    if (xValue < x1Boundary || typeof x1Boundary === 'undefined') { x1Boundary = xValue }
                    if (xValue > x2Boundary || typeof x2Boundary === 'undefined') { x2Boundary = xValue }
                    if (yValue < y1Boundary || typeof y1Boundary === 'undefined') { y1Boundary = yValue }
                    if (yValue > y2Boundary || typeof y2Boundary === 'undefined') { y2Boundary = yValue }
                }
            }

            // Expand the boundaries around the polygon
            x1Boundary = Math.max(0, x1Boundary - 10)
            x2Boundary = x2Boundary + 10
            y1Boundary = Math.max(0, y1Boundary - 10)
            y2Boundary = y2Boundary + 10

            // Convert the polygon to GATE_WIDTH x GATE_HEIGHT size
            const xRatio = (x2Boundary - x1Boundary) / (y2Boundary - y1Boundary)

            if (xRatio < GATE_RATIO) {
                const centerX = x1Boundary + (x2Boundary - x1Boundary) / 2
                let newX1Boundary = Math.floor(centerX - (GATE_RATIO * (y2Boundary - y1Boundary) / 2))
                let newX2Boundary = Math.floor(centerX + (GATE_RATIO * (y2Boundary - y1Boundary) / 2))

                if (newX1Boundary < 0) {
                    newX2Boundary += Math.abs(newX1Boundary)
                    newX1Boundary = 0
                } else if (newX2Boundary > this.props.graphWidth) {
                    newX1Boundary -= newX2Boundary - this.props.graphWidth
                    newX2Boundary = this.props.graphWidth
                }

                x1Boundary = newX1Boundary
                x2Boundary = newX2Boundary
            } else {
                const centerY = y1Boundary + (y2Boundary - y1Boundary) / 2
                let newY1Boundary = Math.floor(centerY - (INVERSE_GATE_RATIO * (x2Boundary - x1Boundary) / 2))
                let newY2Boundary = Math.floor(centerY + (INVERSE_GATE_RATIO * (x2Boundary - x1Boundary) / 2))

                if (newY1Boundary < 0) {
                    newY2Boundary += Math.abs(newY1Boundary)
                    newY1Boundary = 0
                } else if (newY2Boundary > this.props.graphHeight) {
                    newY1Boundary -= newY2Boundary - this.props.graphHeight
                    newY2Boundary = this.props.graphHeight
                }

                y1Boundary = newY1Boundary
                y2Boundary = newY2Boundary
            }

            const scalingFactorX = GATE_WIDTH / (x2Boundary - x1Boundary)
            const scalingFactorY = GATE_HEIGHT / (y2Boundary - y1Boundary)

            const context = ReactDOM.findDOMNode(this.refs['canvas-' + gate.id]).getContext('2d')

            // Render the pixels from the cache image that fall inside the preview square
            const image = new Image()
            image.src = this.props.sample.plotImages[getPlotImageKey(scaleSample)]
            image.onload = () => {
                // First paint a white background
                context.rect(0, 0, GATE_WIDTH, GATE_HEIGHT)
                context.fillStyle = '#FFF'
                context.fill()

                context.drawImage(
                    image,
                    x1Boundary, // sx sub image top left corner x
                    y1Boundary, // sy sub image top left corner y
                    x2Boundary - x1Boundary, // width of sub image rectangle
                    y2Boundary - y1Boundary, // height of sub image rectangle
                    0, // Where to draw the image on the canvas
                    0,
                    GATE_WIDTH, // What size to scale the image to
                    GATE_HEIGHT
                )

                // Redraw the image and greyscale any points that are outside the gate
                const imageData = context.getImageData(0, 0, GATE_WIDTH, GATE_HEIGHT);
                const data = imageData.data;

                for (let i = 0; i < data.length; i += 4) {
                    // Get the position of the pixel as X and Y
                    const position = [
                        scales.xScale.invert(((i % (GATE_WIDTH * 4)) / 4) * (1 / scalingFactorX) + x1Boundary),
                        scales.yScale.invert(Math.floor(i / (GATE_WIDTH * 4)) * (1 / scalingFactorY) + y1Boundary)
                    ]
                    if (!pointInsidePolygon(position, gate.gateData)) {
                        // Inside the gate, render as greyscale
                        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                        data[i]     = avg; // red
                        data[i + 1] = avg; // green
                        data[i + 2] = avg; // blue
                    }
                }
                context.putImageData(imageData, 0, 0);

                context.fillStyle = '#999'
                // Render the gate outlines over the top
                context.beginPath();
                context.moveTo((scales.xScale(gate.gateData[0][0]) - x1Boundary) * scalingFactorX, (scales.yScale(gate.gateData[0][1]) - y1Boundary) * scalingFactorY)
                for (let point of gate.gateData) {
                    context.lineTo((scales.xScale(point[0]) - x1Boundary) * scalingFactorX, (scales.yScale(point[1]) - y1Boundary) * scalingFactorY)
                }
                context.closePath()
                context.stroke()
            }
        }
    }

    componentDidMount () {
        this.renderGatePreview()
    }

    componentDidUpdate () {
        this.renderGatePreview()
    }

    render () {
        // Group gates into the 2d parameters that they use
        const gateGroups = {}

        for (let gate of this.props.gates) {
            const key = `${gate.selectedXParameterIndex}_${gate.selectedYParameterIndex}`
            if (!gateGroups[key]) {
                gateGroups[key] = {
                    label: this.props.sample.FCSParameters[gate.selectedXParameterIndex].label + ' · ' + this.props.sample.FCSParameters[gate.selectedYParameterIndex].label,
                    gates: []
                }
            }

            gateGroups[key].gates.push(gate)
        }

        const gateGroupsRendered = _.keys(gateGroups).map((key) => {
            const gateGroup = gateGroups[key]

            const gates = gateGroup.gates.map((gate) => {
                const subSample = _.find(this.props.subSamples, s => s.id === gate.childSampleId)
                return (
                    <div className='gate' key={gate.id}
                        onMouseEnter={this.props.updateGate.bind(null, gate.id, { highlighted: true })}
                        onMouseLeave={this.props.updateGate.bind(null, gate.id, { highlighted: false })}
                        >
                        <div className='subsample-name'>{subSample.title}</div>
                        <canvas ref={'canvas-' + gate.id} width={200} height={140} />
                    </div>
                )
            })

            return (
                <div className='gate-group' key={key}>
                    <div className='upper'>
                        <div className='selected-parameters'>{gateGroup.label}</div>
                        <div className='show-gate' onClick={this.props.showGate.bind(null, gateGroup.gates[0].id)}><div>Show Plot</div></div>
                    </div>
                    <div className='gates-inner'>
                        {gates}
                    </div>
                </div>
            )
        })

        return (
            <div className='gates body'>{gateGroupsRendered}</div>
        )
    }
}