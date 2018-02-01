// -------------------------------------------------------------------------
// React component for rendering gates that create subsamples.
// -------------------------------------------------------------------------

import React from 'react'
import ReactDOM from 'react-dom'
import { Component } from 'react'
import _ from 'lodash'
import constants from '../lib/constants'
import pointInsidePolygon from 'point-in-polygon'
import { heatMapColorforValue } from '../lib/utilities.js'
import '../../scss/sample-view/sample-gates.scss'

const GATE_WIDTH = 200
const GATE_HEIGHT = 130
const GATE_RATIO = GATE_WIDTH / GATE_HEIGHT
const INVERSE_GATE_RATIO = GATE_HEIGHT / GATE_WIDTH

export default class SampleView extends Component {

    renderGatePreview () {
        if (!this.props.densityMap) { return }
        const densityMap = this.props.densityMap.getDensityMap()
        const maxDensity = this.props.densityMap.getMaxDensity()
        
        for (let subSample of this.props.subSamples) {
            // Get the center point of where the gate is targeted
            let x1Boundary, x2Boundary, y1Boundary, y2Boundary
            if (subSample.gate.type === constants.GATE_POLYGON) {
                // Iterate through the polygon vertices and get the min / max values for drawing squares
                for (let i = 0; i < subSample.gate.polygon.length; i++) {
                    const xValue = subSample.gate.polygon[i][0]
                    const yValue = subSample.gate.polygon[i][1]
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

            const scalingFactor = GATE_WIDTH / (x2Boundary - x1Boundary)

            // Render all the points in the square
            const context = ReactDOM.findDOMNode(this.refs['canvas-' + subSample.id]).getContext('2d')
            for (let y = y1Boundary; y < y2Boundary; y++) {
                if (!densityMap[y]) { continue }                    

                for (let x = x1Boundary; x < x2Boundary; x++) {
                    if (!densityMap[y][x]) { continue }

                    if (densityMap[y][x] > 0) {
                        if (pointInsidePolygon([x, y], subSample.gate.polygon)) {
                            context.fillStyle = heatMapColorforValue(Math.min((densityMap[y][x] / maxDensity * 1.5), 1))
                            context.fillRect((x - x1Boundary) * scalingFactor, (y - y1Boundary) * scalingFactor, 1, 1)
                        } else {
                            context.fillStyle = '#999'
                            context.fillRect((x - x1Boundary) * scalingFactor, (y - y1Boundary) * scalingFactor, 1, 1)
                        }
                    }
                }
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
        let parametersX = []
        let parametersY = []

        if (this.props.subSamples.length > 0 && this.props.subSamples[0].FCSFile) {
            _.keys(this.props.subSamples[0].FCSFile.text).map((param) => {
                if (param.match(/^\$P.+N$/)) { // Get parameter names
                    const parameterName = this.props.subSamples[0].FCSFile.text[param]
                    parametersX.push(parameterName)
                }
            })

            _.keys(this.props.subSamples[0].FCSFile.text).map((param) => {
                if (param.match(/^\$P.+N$/)) { // Get parameter names
                    const parameterName = this.props.subSamples[0].FCSFile.text[param]
                    parametersY.push(parameterName)
                }
            })
        }

        const gates = this.props.subSamples.map((subSample) => {
            return (
                <div className='gate' key={subSample.id} onMouseEnter={this.props.highlightGate.bind(null, subSample.id)} onMouseLeave={this.props.clearHighlightGate}>
                    <div className='selected-parameters'>{parametersX[subSample.gate.xParameterIndex]} · {parametersY[subSample.gate.yParameterIndex]}</div>
                    <canvas ref={'canvas-' + subSample.id} width={200} height={140} />
                </div>
            )
        })

        return (
            <div className='gates body'>{gates}</div>
        )
    }
}