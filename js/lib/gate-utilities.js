// -------------------------------------------------------------------------
// Utilities for interacting with created gates, including polygons and resultant
// sub populations
// -------------------------------------------------------------------------

import constants from './constants'
import GrahamScan from './graham-scan.js'
import _ from 'lodash'
import pointInsidePolygon from 'point-in-polygon'
import { getPolygonCenter, getScales, getPolygonBoundaries } from './utilities'

// Find postive events included inside a particular gate (i.e. both x and y above zero)
export const findIncludedPositiveEvents = (polygon, population, FCSFile, options) => {
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

    const includeEventIds = []
    
    const invertedPolygon = _.map(polygon, p => [ scales.xScale.invert(p[0]), scales.yScale.invert(p[1]) ])

    for (let point of population.aboveZeroPopulation) {
        if (pointInsidePolygon(point, invertedPolygon)) {
            includeEventIds.push(point[2])
        }
    }

    return includeEventIds
}

// Find events with a zero in one or both channels that are inside the specified cutoffs
export const findIncludedZeroEvents = (xCutoffs, yCutoffs, population, FCSFile, options) => {
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

    includeEventIds = []
        
    let invertedXCutoffs
    let invertedYCutoffs

    if (xCutoffs) {
        invertedXCutoffs = [ peak.zeroY ? 0 : Math.round(scales.yScale.invert(peak.xCutoffs[1])), Math.round(scales.yScale.invert(peak.xCutoffs[0])) ]
        for (let point of population.xChannelZeroes) {
            if (point >= invertedXCutoffs[0] && point[1] <= invertedXCutoffs[1]) {
                includeEventIds.push(point[2])
            }
        }
    }

    if (yCutoffs) {
        invertedYCutoffs = [ peak.zeroX ? 0 : Math.round(scales.xScale.invert(peak.yCutoffs[0])), Math.round(scales.xScale.invert(peak.yCutoffs[1])) ]
        for (let point of population.yChannelZeroes) {
            if (point >= invertedYCutoffs[0] && point[1] <= invertedYCutoffs[1]) {
                includeEventIds.push(point[2])
            }
        }
    }

    return includeEventIds
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
            const xBoundaries = getPolygonBoundaries(gate.gateData.polygons[gate.gateCreatorData.widthIndex])[0]
            const centerPoint = getPolygonCenter(gate.gateData.polygons[gate.gateCreatorData.widthIndex])
            if (peak >= xBoundaries[0] && peak <= xBoundaries[1] && options.plotHeight - centerPoint[1] < closestDistance) {
                closestDistance = options.plotHeight - centerPoint[1]
                closestGate = gate
            }
        }

        if (!closestGate) {
            console.log('Error: no close peak found for y = 0 peak with x value', peak)
            yCutoffs.splice(p, 1)
            p--
        } else {
            closestGate.gateData.expandedPolygons = []
            // Don't expand to include events if expansion has been explicitly disabled by the user
            for (let i = 0; i < closestGate.gateData.polygons.length; i++) {
                const polygon = closestGate.gateData.polygons[i]
                // Insert the new 0 edge points
                const newPolygon = polygon.concat([
                    [yCutoffs[p][0], options.plotHeight - CYTOF_HISTOGRAM_WIDTH],
                    [yCutoffs[p][2], options.plotHeight - CYTOF_HISTOGRAM_WIDTH]
                ])
                // Recalculate the polygon boundary
                const grahamScan = new GrahamScan();
                newPolygon.map(p => grahamScan.addPoint(p[0], p[1]))
                closestGate.gateData.expandedPolygons[i] = grahamScan.getHull().map(p => [p.x, p.y])
            }

            closestGate.gateData.yCutoffs = yCutoffs[p]
        }
    }

    for (let p = 0; p < xCutoffs.length; p++) {
        const peak = xCutoffs[p][1]
        // Find the closest gate which matches this peak
        let closestGate
        let closestDistance = Infinity
        for (let gate of newGates) {
            const yBoundaries = getPolygonBoundaries(gate.gateData.polygons[gate.gateCreatorData.widthIndex])[1]
            const centerPoint = getPolygonCenter(gate.gateData.polygons[gate.gateCreatorData.widthIndex])
            if (peak >= yBoundaries[0] && peak <= yBoundaries[1] && centerPoint[1] < closestDistance) {
                closestDistance = centerPoint[1]
                closestGate = gate
            }
        }

        if (!closestGate) {
            console.log('Error: no close peak found for x = 0 peak with y value', peak)
            xCutoffs.splice(p, 1)
            p--
        } else {
            const polygonsToUse = closestGate.gateData.expandedPolygons || closestGate.gateData.polygons
            closestGate.gateData.expandedPolygons = closestGate.gateData.expandedPolygons || []
            // Don't expand to include events if expansion has been explicitly disabled by the user
            for (let i = 0; i < polygonsToUse.length; i++) {
                const polygon = polygonsToUse[i]
                // Insert the new 0 edge points
                const newPolygon = polygon.concat([
                    [0, xCutoffs[p][0]],
                    [0, xCutoffs[p][2]],
                ])
                // Recalculate the polygon boundary
                const grahamScan = new GrahamScan();
                newPolygon.map(p => grahamScan.addPoint(p[0], p[1]))
                closestGate.gateData.expandedPolygons[i] = grahamScan.getHull().map(p => [p.x, p.y])
            }

            closestGate.gateData.xCutoffs = xCutoffs[p]
        }
    }

    for (let gate of newGates) {
        // If a gate includes zeroes on both the x and y axis, add a special (0,0) point to the gate            
        if (gate.gateData.xCutoffs && gate.gateData.yCutoffs) {
            for (let i = 0; i < gate.gateData.expandedPolygons.length; i++) {
                const polygon = gate.gateData.expandedPolygons[i]
                // Insert the new 0 edge points
                const newPolygon = polygon.concat([[0, options.plotHeight - CYTOF_HISTOGRAM_WIDTH]])
                // Recalculate the polygon boundary
                const grahamScan = new GrahamScan();
                newPolygon.map(p => grahamScan.addPoint(p[0], p[1]))
                gate.gateData.expandedPolygons[i] = grahamScan.getHull().map(p => [p.x, p.y])
            }

            gate.gateData.xCutoffs[2] = options.plotHeight - CYTOF_HISTOGRAM_WIDTH
            gate.gateData.yCutoffs[0] = 0
        }

        gate.gateCreatorData.includeXChannelZeroes = true
        gate.gateCreatorData.includeYChannelZeroes = true
    }

    return newGates
}