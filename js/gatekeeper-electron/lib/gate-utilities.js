// -------------------------------------------------------------------------
// Utilities for interacting with created gates, including polygons and resultant
// sub populations
// -------------------------------------------------------------------------

import constants from '../../gatekeeper-utilities/constants'
import _ from 'lodash'
import hull from 'hull.js'
import pointInsidePolygon from 'point-in-polygon'
import { distanceBetweenPoints } from 'distance-to-polygon'
import { getPolygonCenter, getScales, getPolygonBoundaries } from '../../gatekeeper-utilities/utilities'
import { breakLongLinesIntoPoints } from '../../gatekeeper-utilities/polygon-utilities'

// Find postive events included inside a particular gate (i.e. both x and y above zero)
export const findIncludedEvents = (gates, population, FCSFile, options) => {
    const CYTOF_HISTOGRAM_WIDTH = Math.round(Math.min(options.plotWidth, options.plotHeight) * 0.07)

    // Offset the entire graph and add histograms if we're looking at cytof data
    let xOffset = FCSFile.machineType === constants.MACHINE_CYTOF ? CYTOF_HISTOGRAM_WIDTH : 0
    let yOffset = FCSFile.machineType === constants.MACHINE_CYTOF ? CYTOF_HISTOGRAM_WIDTH : 0
    
    const scales = getScales({
        selectedXScale: options.selectedXScale,
        selectedYScale: options.selectedYScale,
        xRange: [ FCSFile.FCSParameters[options.selectedXParameterIndex].statistics.positiveMin, FCSFile.FCSParameters[options.selectedXParameterIndex].statistics.max ],
        yRange: [ FCSFile.FCSParameters[options.selectedYParameterIndex].statistics.positiveMin, FCSFile.FCSParameters[options.selectedYParameterIndex].statistics.max ],
        width: options.plotWidth - xOffset,
        height: options.plotHeight - yOffset
    })

    const populationCopy = population.subPopulation.slice(0)

    for (let gate of _.filter(gates, g => g.type === constants.GATE_TYPE_POLYGON)) {
        gate.includeEventIds = []

        // Round polygons vertices to the nearest 0.01
        const invertedPolygon = gate.renderedPolygon.map(p => [ Math.round(scales.xScale.invert(p[0]) * 100) / 100, Math.round(scales.yScale.invert(p[1]) * 100) / 100 ])
        let invertedXCutoffs
        let invertedYCutoffs

        if (gate.gateData.xCutoffs) {
            invertedXCutoffs = [ Math.round(scales.yScale.invert(gate.gateData.xCutoffs[2]) * 100) / 100, Math.round(scales.yScale.invert(gate.gateData.xCutoffs[0]) * 100) / 100 ]
        }

        if (gate.gateData.yCutoffs) {
            invertedYCutoffs = [ Math.round(scales.xScale.invert(gate.gateData.yCutoffs[0]) * 100) / 100, Math.round(scales.xScale.invert(gate.gateData.yCutoffs[2]) * 100) / 100 ]
        }

        for (let i = 0; i < populationCopy.length; i++) {
            const point = populationCopy[i]
            if (!point) { continue }
            // Double zeroes are vulnerable to logarithm minimum value problems, so if we're including double zeroes don't bother to measure them against cutoffs
            if (gate.gateCreatorData.includeXChannelZeroes && gate.gateCreatorData.includeYChannelZeroes && point[0] === 0 && point[1] === 0) {
                gate.includeEventIds.push(point[2])
                populationCopy[i] = null
            }
            else if (invertedXCutoffs && gate.gateCreatorData.includeXChannelZeroes && point[0] === 0 && point[1] >= invertedXCutoffs[0] && point[1] <= invertedXCutoffs[1]) {
                gate.includeEventIds.push(point[2])
                populationCopy[i] = null
            } else if (invertedYCutoffs && gate.gateCreatorData.includeYChannelZeroes && point[1] === 0 && point[0] >= invertedYCutoffs[0] && point[0] <= invertedYCutoffs[1]) {
                gate.includeEventIds.push(point[2])
                populationCopy[i] = null
            }
            else if (pointInsidePolygon(point, invertedPolygon)) {
                gate.includeEventIds.push(point[2])
                populationCopy[i] = null
            }
        }
    }

    let negativeGate = _.find(gates, g => g.type === constants.GATE_TYPE_NEGATIVE)
    // Create a negative gate including all the uncaptured events if the user specified
    if (negativeGate) {
        negativeGate.includeEventIds = _.filter(populationCopy, p => !_.isNull(p)).map(p => p[2])
    }

    return gates
}

export const expandToIncludeZeroes = (xCutoffs, yCutoffs, gates, options) => {
    const newGates = gates.slice(0)
    const CYTOF_HISTOGRAM_WIDTH = Math.round(Math.min(options.plotWidth, options.plotHeight) * 0.07)

    for (let p = 0; p < yCutoffs.length; p++) {
        const peak = yCutoffs[p][1]
        // Find the closest gate which matches this peak
        let closestGate
        let closestDistance = Infinity
        for (let gate of newGates) {
            const xBoundaries = getPolygonBoundaries(gate.gateData.polygons[gate.gateCreatorData.truePeakWidthIndex + gate.gateCreatorData.widthIndex])[0]
            const centerPoint = getPolygonCenter(gate.gateData.polygons[gate.gateCreatorData.truePeakWidthIndex + gate.gateCreatorData.widthIndex])
            const distance = distanceBetweenPoints([peak, options.plotHeight - CYTOF_HISTOGRAM_WIDTH], centerPoint)
            if (peak >= xBoundaries[0][0] && peak <= xBoundaries[1][0] && distance < closestDistance) {
                closestDistance = distance
                closestGate = gate
            }
        }

        if (!closestGate) {
            console.log('Error: no close peak found for y = 0 peak with x value', peak)
        } else if (closestGate.gateCreatorData.includeYChannelZeroes === false) {
            console.log('Not including Y channel zeroes due to user override')
        } else {
            closestGate.gateCreatorData.includeYChannelZeroes = true
            closestGate.gateData.expandedYPolygons = []
            closestGate.gateData.yCutoffs = yCutoffs[p]
            // Don't expand to include events if expansion has been explicitly disabled by the user
            for (let i = 0; i < closestGate.gateData.polygons.length; i++) {
                const polygon = closestGate.gateData.polygons[i]
                const xBoundaries = getPolygonBoundaries(polygon)[0]
                let newPolygon = []
                let shouldAdd = true
                for (let i = 0; i < polygon.length; i++) {
                    const point = polygon[i]
                    if (shouldAdd) {
                        newPolygon.push(point)
                    }
                    if (point[0] === xBoundaries[1][0] && point[1] === xBoundaries[1][1]) {
                        // Insert the new 0 edge points
                        newPolygon = newPolygon.concat([
                            [yCutoffs[p][2], options.plotHeight - CYTOF_HISTOGRAM_WIDTH],
                            [yCutoffs[p][1], options.plotHeight - CYTOF_HISTOGRAM_WIDTH],
                            [yCutoffs[p][0], options.plotHeight - CYTOF_HISTOGRAM_WIDTH]
                        ])
                        shouldAdd = false
                    } else if (point[0] === xBoundaries[0][0] && point[1] === xBoundaries[0][1]) {
                        shouldAdd = true
                    }
                }

                newPolygon = breakLongLinesIntoPoints(newPolygon)
                // Recalculate the polygon boundary

                closestGate.gateData.expandedYPolygons[i] = hull(newPolygon, 50)
            }
        }
    }

    for (let p = 0; p < xCutoffs.length; p++) {
        const peak = xCutoffs[p][1]
        // Find the closest gate which matches this peak
        let closestGate
        let closestDistance = Infinity
        for (let gate of newGates) {
            const yBoundaries = getPolygonBoundaries(gate.gateData.polygons[gate.gateCreatorData.truePeakWidthIndex + gate.gateCreatorData.widthIndex])[1]
            const centerPoint = getPolygonCenter(gate.gateData.polygons[gate.gateCreatorData.truePeakWidthIndex + gate.gateCreatorData.widthIndex])
            const distance = distanceBetweenPoints([CYTOF_HISTOGRAM_WIDTH, peak], centerPoint)

            if (peak >= yBoundaries[0][1] && peak <= yBoundaries[1][1] && distance < closestDistance) {
                closestDistance = distance
                closestGate = gate
            }
        }

        if (!closestGate) {
            console.log('Error: no close peak found for x = 0 peak with y value', peak)
        } else if (closestGate.gateCreatorData.includeXChannelZeroes === false) {
            console.log('Not including X channel zeroes due to user override')
        } else {
            closestGate.gateCreatorData.includeXChannelZeroes = true
            closestGate.gateData.xCutoffs = xCutoffs[p]
            closestGate.gateData.expandedXPolygons = []
            // Don't expand to include events if expansion has been explicitly disabled by the user
            for (let i = 0; i < closestGate.gateData.polygons.length; i++) {
                const polygon = closestGate.gateData.polygons[i]
                // Remove all points between the corresponding boundaries
                const yBoundaries = getPolygonBoundaries(polygon)[1]
                let newPolygon = []
                let shouldAdd = true
                for (let i = 0; i < polygon.length; i++) {
                    const point = polygon[i]
                    if (shouldAdd) {
                        newPolygon.push(point)
                    }
                    if (point[0] === yBoundaries[1][0] && point[1] === yBoundaries[1][1]) {
                        // Insert the new 0 edge points
                        newPolygon = newPolygon.concat([
                            [0, xCutoffs[p][2]],
                            [0, xCutoffs[p][1]],
                            [0, xCutoffs[p][0]],
                        ])
                        shouldAdd = false
                    } else if (point[0] === yBoundaries[0][0] && point[1] === yBoundaries[0][1]) {
                        shouldAdd = true
                    }
                }

                newPolygon = breakLongLinesIntoPoints(newPolygon)
                // Recalculate the polygon boundary
                closestGate.gateData.expandedXPolygons[i] = hull(newPolygon, 50)
            }
        }
    }

    // Update values on all gates that didn't get expanded
    for (let gate of gates) {
        // If this peak has been expanded towards both axis, create a new array for double expansion
        if (gate.gateData.xCutoffs && gate.gateData.yCutoffs) {
            gate.gateData.doubleExpandedPolygons = []

            for (let i = 0; i < gate.gateData.polygons.length; i++) {
                const polygon = gate.gateData.polygons[i]
                // Remove all points between the corresponding boundaries
                const yBoundaries = getPolygonBoundaries(polygon)[1]
                const xBoundaries = getPolygonBoundaries(polygon)[0]
                let newPolygon = []
                let shouldAdd = true
                for (let i = 0; i < polygon.length; i++) {
                    const point = polygon[i]
                    if (shouldAdd) {
                        newPolygon.push(point)
                    }
                    if (point[0] === xBoundaries[1][0] && point[1] === xBoundaries[1][1]) {
                        shouldAdd = false
                        // Insert the new corner point
                        newPolygon = newPolygon.concat([
                            [gate.gateData.yCutoffs[2], options.plotHeight - CYTOF_HISTOGRAM_WIDTH],
                            [gate.gateData.yCutoffs[1], options.plotHeight - CYTOF_HISTOGRAM_WIDTH],
                            [gate.gateData.yCutoffs[0], options.plotHeight - CYTOF_HISTOGRAM_WIDTH],
                            [0, options.plotHeight - CYTOF_HISTOGRAM_WIDTH],
                            [0, gate.gateData.xCutoffs[2]],
                            [0, gate.gateData.xCutoffs[1]],
                            [0, gate.gateData.xCutoffs[0]],
                        ])
                    } else if (point[0] === yBoundaries[0][0] && point[1] === yBoundaries[0][1]) {
                        shouldAdd = true
                    }
                }

                newPolygon = breakLongLinesIntoPoints(newPolygon)

                // Recalculate the polygon boundary
                gate.gateData.doubleExpandedPolygons[i] = hull(newPolygon, 50)
            }

            gate.gateData.xCutoffs[2] = options.plotHeight - CYTOF_HISTOGRAM_WIDTH
            gate.gateData.yCutoffs[0] = 0
        }

        if (!gate.gateCreatorData.includeXChannelZeroes) {
            gate.gateCreatorData.includeXChannelZeroes = false
        }
        if (!gate.gateCreatorData.includeYChannelZeroes) {
            gate.gateCreatorData.includeYChannelZeroes = false
        }
    }

    return newGates
}