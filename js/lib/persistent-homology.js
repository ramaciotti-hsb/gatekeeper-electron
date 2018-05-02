// -------------------------------------------------------------------------
// Uses the Persistent Homology technique to discover peaks / populations in
// 2d data.
// -------------------------------------------------------------------------

import GrahamScan from './graham-scan.js'
import polygonsIntersect from 'polygon-overlap'
import pointInsidePolygon from 'point-in-polygon'
import area from 'area-polygon'
import _ from 'lodash'
import uuidv4 from 'uuid/v4'
import constants from './constants'
import * as d3 from 'd3'
import { getPolygonCenter, getScales } from './utilities'
import { distanceToPolygon, distanceBetweenPoints } from 'distance-to-polygon'
import * as turf from '@turf/turf'

let CYTOF_HISTOGRAM_WIDTH

// This function takes a two dimensional array (e.g foo[][]) and returns an array of polygons
// representing discovered peaks. e.g:
// [[2, 1], [2, 2], [1, 2]]

// Get the min and max y points of a polygon as [min, max]
function getPolygonXBoundaries (points) {
    let minX = Infinity
    let maxX = -Infinity

    for (let point of points) {
        if (point[0] < minX) {
            minX = point[0]
        }

        if (point[0] > maxX) {
            maxX = point[0]
        }
    }

    return [ minX, maxX ]
}

// Get the min and max y points of a polygon as [min, max]
function getPolygonYBoundaries (points) {
    let minY = Infinity
    let maxY = -Infinity

    for (let point of points) {
        if (point[1] < minY) {
            minY = point[1]
        }

        if (point[1] > maxY) {
            maxY = point[1]
        }
    }

    return [ minY, maxY ]
}

export default class PersistentHomology {

    constructor (options) {
        this.options = _.merge({
            options: {
                edgeDistance: options.options.plotWidth * 0.05,
                minPeakHeight: options.options.plotHeight * 0.04,
                minPeakSize: 5000,
                maxIterations: 10,
            }
        }, options)

        if (!this.options.sample || !this.options.options || !this.options.population) {
            throw 'Error initializing PersistantHomology: options.population and option.sample are required'
        }

        this.homologyPeaks = []
        this.truePeaks = []

        CYTOF_HISTOGRAM_WIDTH = Math.round(Math.min(this.options.options.plotWidth, this.options.options.plotHeight) * 0.07)
    }

    findIncludedEvents () {
        // Offset the entire graph and add histograms if we're looking at cytof data
        let xOffset = this.options.FCSFile.machineType === constants.MACHINE_CYTOF ? CYTOF_HISTOGRAM_WIDTH : 0
        let yOffset = this.options.FCSFile.machineType === constants.MACHINE_CYTOF ? CYTOF_HISTOGRAM_WIDTH : 0
        
        const scales = getScales({
            selectedXScale: this.options.options.selectedXScale,
            selectedYScale: this.options.options.selectedYScale,
            xRange: [ this.options.FCSFile.FCSParameters[this.options.options.selectedXParameterIndex].statistics.positiveMin, this.options.FCSFile.FCSParameters[this.options.options.selectedXParameterIndex].statistics.max ],
            yRange: [ this.options.FCSFile.FCSParameters[this.options.options.selectedYParameterIndex].statistics.positiveMin, this.options.FCSFile.FCSParameters[this.options.options.selectedYParameterIndex].statistics.max ],
            width: this.options.options.plotWidth - xOffset,
            height: this.options.options.plotHeight - yOffset
        })

        for (let peak of this.truePeaks) {
            peak.includeEventIds = []
            const invertedPolygon = _.map(peak.polygon, p => [ scales.xScale.invert(p[0]), scales.yScale.invert(p[1]) ])
            let invertedXCutoffs
            let invertedYCutoffs
            if (peak.xCutoffs) {
                invertedXCutoffs = [ peak.zeroY ? 0 : Math.round(scales.yScale.invert(peak.xCutoffs[1])), Math.round(scales.yScale.invert(peak.xCutoffs[0])) ]
            }
            if (peak.yCutoffs) {
                invertedYCutoffs = [ peak.zeroX ? 0 : Math.round(scales.xScale.invert(peak.yCutoffs[0])), Math.round(scales.xScale.invert(peak.yCutoffs[1])) ]
            }

            for (let point of this.options.population.subPopulation) {
                if (pointInsidePolygon(point, invertedPolygon)) {
                    peak.includeEventIds.push(point[2])
                } else {
                    // Comparisons to 0 points along the y axis are inverted because of the way images and indexed starting at the top left corner
                    if (invertedXCutoffs && point[0] === 0 && point[1] >= invertedXCutoffs[0] && point[1] <= invertedXCutoffs[1]) {
                        peak.includeEventIds.push(point[2])
                    } else if (invertedYCutoffs && point[1] === 0 && point[0] >= invertedYCutoffs[0] && point[0] <= invertedYCutoffs[1]) {
                        peak.includeEventIds.push(point[2])
                    }
                }
            }
        }
    }

    expandToIncludeZeroes () {
        // If we're looking at cytof data, extend lower gates out towards zero if there is a peak there
        const minPeakWidth = this.options.options.plotWidth * 0.1
        const inflectionWidth = 20

        let yPeaks = []
        // Find peaks in the 1d data where one of the channels is zero
        for (let i = 0; i < this.options.population.zeroDensityY.densityMap.length; i++) {
            let isPeak = true
            for (let j = Math.max(i - minPeakWidth, 0); j < Math.min(i + minPeakWidth, this.options.population.zeroDensityY.densityMap.length); j++) {
                if (i === j) { continue }

                if (this.options.population.zeroDensityY.densityMap[j] >= this.options.population.zeroDensityY.densityMap[i]) {
                    isPeak = false
                }
            }
            if (isPeak && yPeaks.length < 10) {
                yPeaks.push(i)
            }
        }
        
        const yCutoffs = []
        // Capture the peaks by iterating outwards until an inflection point or minimum value is found
        for (let i = 0; i < yPeaks.length; i++) {
            yCutoffs[i] = []
            const peak = yPeaks[i]
            let lowerCutoffFound = false
            let upperCutoffFound = false
            let index = peak - 1
            while (!lowerCutoffFound) {
                if (index === -1) {
                    lowerCutoffFound = true
                    yCutoffs[i][0] = 0
                // If the mean of the next inflectionWidth points is greater than the current point, the slope is increasing again (approaching another peak)
                } else if (this.options.population.zeroDensityY.densityMap[index] < this.options.population.zeroDensityY.densityMap.slice(index - inflectionWidth - 1, index - 1).reduce((acc, curr) => { return acc + curr }, 0) / inflectionWidth || this.options.population.zeroDensityY.densityMap[index] < 0.001) {
                    lowerCutoffFound = true
                    yCutoffs[i][0] = index
                }

                index--
            }

            index = peak + 1
            while (!upperCutoffFound) {
                if (index === this.options.population.zeroDensityY.densityMap.length) {
                    upperCutoffFound = true
                    yCutoffs[i][1] = index - 1
                // If the mean of the next inflectionWidth points is greater than the current point, the slope is increasing again (approaching another peak)
                } else if (this.options.population.zeroDensityY.densityMap[index] < this.options.population.zeroDensityY.densityMap.slice(index + 1, index + inflectionWidth + 1).reduce((acc, curr) => { return acc + curr }, 0) / inflectionWidth || this.options.population.zeroDensityY.densityMap[index] < 0.001) {
                    upperCutoffFound = true
                    yCutoffs[i][1] = index
                }

                index++
            }
        }

        for (let p = 0; p < yPeaks.length; p++) {
            const peak = yPeaks[p]
            // Find the closest gate which matches this peak
            let closestGate
            let closestDistance = Infinity
            for (let gate of this.truePeaks) {
                const xBoundaries = getPolygonXBoundaries(gate.polygon)
                const centerPoint = getPolygonCenter(gate.polygon)
                if (peak >= xBoundaries[0] && peak <= xBoundaries[1] && (this.options.options.plotHeight - centerPoint[1]) < closestDistance) {
                    closestDistance = this.options.options.plotHeight - centerPoint[1]
                    closestGate = gate
                }
            }

            if (!closestGate) {
                console.log('Error: no close peak found for y = 0 peak with x value', peak)
                yPeaks.splice(p, 1)
                yCutoffs.splice(p, 1)
                p--
            } else {
                // Don't expand to include events if expansion has been explicitly disabled by the user
                if (closestGate.includeYChannelZeroes) {
                    // Insert the new 0 edge points
                    const newGatePolygon = closestGate.polygon.concat([
                        [yCutoffs[p][0], this.options.options.plotHeight - CYTOF_HISTOGRAM_WIDTH],
                        [yCutoffs[p][1], this.options.options.plotHeight - CYTOF_HISTOGRAM_WIDTH]
                    ])
                    // Recalculate the polygon boundary
                    const grahamScan = new GrahamScan();
                    newGatePolygon.map(p => grahamScan.addPoint(p[0], p[1]))
                    closestGate.polygon = grahamScan.getHull().map(p => [p.x, p.y])
                    closestGate.yCutoffs = yCutoffs[p]
                    closestGate.zeroY = true
                } else {
                    console.log('Warning: peak was not expanded to include events where Y channel is zero because of user options')
                }
            }
        }

        let xPeaks = []
        // Find peaks in the 1d data where one of the channels is zero
        for (let i = 0; i < this.options.population.zeroDensityX.densityMap.length; i++) {
            let isPeak = true
            for (let j = Math.max(i - minPeakWidth, 0); j < Math.min(i + minPeakWidth, this.options.population.zeroDensityX.densityMap.length); j++) {
                if (i === j) { continue }

                if (this.options.population.zeroDensityX.densityMap[j] >= this.options.population.zeroDensityX.densityMap[i]) {
                    isPeak = false
                }
            }
            if (isPeak && xPeaks.length < 10) {
                xPeaks.push(i)
            }
        }

        const xCutoffs = []
        // Capture the peaks by iterating outwards until an inflection point or minimum value is found
        for (let i = 0; i < xPeaks.length; i++) {
            xCutoffs[i] = []
            const peak = xPeaks[i]
            let lowerCutoffFound = false
            let upperCutoffFound = false
            let index = peak - 1
            while (!lowerCutoffFound) {
                if (index === -1) {
                    lowerCutoffFound = true
                    xCutoffs[i][0] = 0
                // If the mean of the next inflectionWidth points is greater than the current point, the slope is increasing again (approaching another peak)
                } else if (this.options.population.zeroDensityX.densityMap[index] < this.options.population.zeroDensityX.densityMap.slice(index - inflectionWidth - 1, index - 1).reduce((acc, curr) => { return acc + curr }, 0) / inflectionWidth || this.options.population.zeroDensityX.densityMap[index] < 0.001) {
                    lowerCutoffFound = true
                    xCutoffs[i][0] = index
                }

                index--
            }

            index = peak + 1
            while (!upperCutoffFound) {
                if (index === this.options.population.zeroDensityX.densityMap.length) {
                    upperCutoffFound = true
                    xCutoffs[i][1] = index - 1
                // If the mean of the next inflectionWidth points is greater than the current point, the slope is increasing again (approaching another peak)
                } else if (this.options.population.zeroDensityX.densityMap[index] < this.options.population.zeroDensityX.densityMap.slice(index + 1, index + inflectionWidth + 1).reduce((acc, curr) => { return acc + curr }, 0) / inflectionWidth || this.options.population.zeroDensityX.densityMap[index] < 0.001) {
                    upperCutoffFound = true
                    xCutoffs[i][1] = index
                }

                index++
            }
        }


        for (let p = 0; p < xPeaks.length; p++) {
            const peak = xPeaks[p]
            // Find the closest gate
            let closestGate
            let closestDistance = Infinity
            for (let gate of this.truePeaks) {
                const yBoundaries = getPolygonYBoundaries(gate.polygon)
                const centerPoint = getPolygonCenter(gate.polygon)
                if (peak >= yBoundaries[0] && peak <= yBoundaries[1] && centerPoint[0] < closestDistance) {
                    closestDistance = centerPoint[0]
                    closestGate = gate
                }
            }

            if (!closestGate) {
                console.log('Error: no close peak found for x = 0 peak with y value', peak)
                xPeaks.splice(p, 1)
                xCutoffs.splice(p, 1)
                p = p - 1
            } else {
                // Don't expand to include events if expansion has been explicitly disabled by the user
                if (closestGate.includeXChannelZeroes) {
                    // Insert the 0 edge points
                    const newGatePolygon = closestGate.polygon.concat([
                        [0, xCutoffs[p][0]],
                        [0, xCutoffs[p][1]],
                    ])

                    // Recalculate the polygon boundary
                    const grahamScan = new GrahamScan();
                    newGatePolygon.map(p => grahamScan.addPoint(p[0], p[1]))
                    closestGate.polygon = grahamScan.getHull().map(p => [p.x, p.y])
                    closestGate.xCutoffs = xCutoffs[p]
                    closestGate.zeroX = true
                } else {
                    console.log('Warning: peak was not expanded to include events where X channel is zero because of user options')
                }
            }
        }

        for (let gate of this.truePeaks) {
            // If a gate includes zeroes on both the x and y axis, add a special (0,0) point to the gate            
            if (gate.zeroX && gate.zeroY) {
                // Insert the two new 0 edge points
                const newGatePolygon = gate.polygon.concat([[0, this.options.options.plotHeight - CYTOF_HISTOGRAM_WIDTH]])
                // Recalculate the polygon boundary
                const grahamScan = new GrahamScan();
                newGatePolygon.map(p => grahamScan.addPoint(p[0], p[1]))
                gate.xCutoffs[1] = this.options.options.plotHeight - CYTOF_HISTOGRAM_WIDTH
                gate.yCutoffs[0] = 0
                gate.polygon = grahamScan.getHull().map(p => [p.x, p.y])
            }
        }
    }

    // Breaks up any long straight lines in peak polygons into smaller lines connected by points
    breakLongLinesIntoPoints () {
        const getMidPoint = function (x1, y1, x2, y2, per) {
            return [x1 + (x2 - x1) * per, y1 + (y2 - y1) * per];
        }

        for (let i = 0; i < this.truePeaks.length; i++) {
            this.truePeaks[i].polygon.push(this.truePeaks[i].polygon[0])

            for (let p = 0; p < this.truePeaks[i].polygon.length - 1; p++) {
                const pointOne = this.truePeaks[i].polygon[p]
                const pointTwo = this.truePeaks[i].polygon[p + 1]
                const pointDistance = distanceBetweenPoints(pointOne, pointTwo)
                if (pointDistance > 20) {
                    // Break the line up into 10px segments
                    const range = _.range(10, pointDistance, 10)
                    const pointsToAdd = []
                    for (let step = 0; step < range.length; step++) {
                        const midPoint = getMidPoint(pointOne[0], pointOne[1], pointTwo[0], pointTwo[1], range[step] / pointDistance)
                        pointsToAdd.push(midPoint)
                    }
                    // Slice in the new points
                    this.truePeaks[i].polygon = this.truePeaks[i].polygon.slice(0, p).concat(pointsToAdd).concat(this.truePeaks[i].polygon.slice(p + 1))
                }
            }
            // // Recalculate the polygon boundary
            // const grahamScan = new GrahamScan();
            // this.truePeaks[i].polygon.map(p => grahamScan.addPoint(p[0], p[1]))
            // this.truePeaks[i].polygon = grahamScan.getHull().map(p => [p.x, p.y])
        }
    }

    // Fix overlapping peak polygons using the zipper method
    fixOverlappingPolygonsUsingZipper () {
        for (let i = 0; i < this.truePeaks.length; i++) {
            for (let j = 0; j < this.truePeaks.length; j++) {
                if (i === j) {
                    continue
                }

                const polygonOne = this.truePeaks[i].polygon
                const polygonTwo = this.truePeaks[j].polygon

                if (polygonsIntersect(polygonOne, polygonTwo)) {
                    // Find intersecting points between these two polygons
                    for (let p = 0; p < polygonOne.length; p++) {
                        const pointOne = polygonOne[p]
                        // If this particular point is inside the other polygon
                        if (pointInsidePolygon(pointOne, polygonTwo)) {
                            // Find the closest point on the border of the other polygon
                            let closestPointIndex
                            let closestPointDistance = Infinity
                            for (let p2 = 0; p2 < polygonTwo.length; p2++) {
                                const pointTwo = polygonTwo[p2]

                                const pointDistance = distanceBetweenPoints(pointOne, pointTwo)
                                if (pointDistance < closestPointDistance) {
                                    closestPointDistance = pointDistance
                                    closestPointIndex = p2
                                }
                            }

                            // Get the halfway point between the two points
                            const halfwayPoint = [ (pointOne[0] + polygonTwo[closestPointIndex][0]) / 2, (pointOne[1] + polygonTwo[closestPointIndex][1]) / 2 ]
                            // Add the halfway point to both polygons and remove both the original points
                            polygonOne.splice(p, 1, halfwayPoint)
                            polygonTwo.splice(closestPointIndex, 1, halfwayPoint)
                        }
                    }
                }
            }
        }
    }

    // Returns this.truePeaks arranged into groups along the x and y axis
    getAxisGroups (truePeaks) {
        // Percentage of maximum distance between furthest peak to group together
        const maxGroupDistance = 0.3
        // Divide peaks into groups along the x and y axis
        // Get [minX, maxX] range of peaks along x axis
        let xRange = this.truePeaks.reduce((acc, curr) => { return [ Math.min(acc[0], getPolygonCenter(curr.polygon)[0]), Math.max(acc[1], getPolygonCenter(curr.polygon)[0]) ] }, [Infinity, -Infinity])
        // Get [minY, maxY] range of peaks along y axis
        let yRange = this.truePeaks.reduce((acc, curr) => { return [ Math.min(acc[0], getPolygonCenter(curr.polygon)[1]), Math.max(acc[1], getPolygonCenter(curr.polygon)[1]) ] }, [Infinity, -Infinity])
        // Create buckets and place peaks into groups along each axis
        // console.log(this.truePeaks)
        // console.log(xRange, yRange)
        // console.log((xRange[1] - xRange[0]) * 0.2, (yRange[1] - yRange[0]) * 0.2)
        let xGroups = []
        let yGroups = []
        for (let peak of truePeaks) {
            let peakCenter = getPolygonCenter(peak.polygon)
            // console.log(peakCenter)
            
            const newXGroup = () => {
                xGroups.push({
                    position: peakCenter[0],
                    peaks: [ peak.id ]
                })
            }

            // Create a group from the first peak
            if (xGroups.length === 0) {
                newXGroup()
            } else {
                let found = false
            
                for (let group of xGroups) {
                    // If the peak is within 10% of an existing group, add it to that group
                    if (Math.abs(group.position - peakCenter[0]) <= ((xRange[1] - xRange[0]) * 0.3) || Math.abs(group.position - peakCenter[0]) < 20) {
                        group.peaks.push(peak.id)
                        found = true
                    }
                }
            
                // Otherwise create a new group
                if (!found) {
                    newXGroup()
                }
            }

            const newYGroup = () => {
                yGroups.push({
                    position: peakCenter[1],
                    peaks: [ peak.id ]
                })
            }

            // Create a group from the first peak
            if (yGroups.length === 0) {
                newYGroup()
            } else {
                let found = false
            
                for (let group of yGroups) {
                    // If the peak is within 10% of an existing group, add it to that group
                    if (Math.abs(group.position - peakCenter[1]) <= ((yRange[1] - yRange[0]) * 0.3) || Math.abs(group.position - peakCenter[1]) < 20) {
                        group.peaks.push(peak.id)
                        found = true
                    }
                }
            
                // Otherwise create a new group
                if (!found) {
                    newYGroup()
                }
            }
        }
        xGroups.sort((a, b) => { return a.position - b.position })
        yGroups.sort((a, b) => { return a.position - b.position })
        return { xGroups, yGroups } 
    }

    findPeaksInternal (stepCallback) {
        let currentHeight = 100

        while (currentHeight > 3) {
            this.performHomologyIteration(currentHeight)
            currentHeight = currentHeight - 1
            if (stepCallback) { stepCallback('Gating using Persistent Homology: ' + (100 - currentHeight) + '% complete.') }
        }
        
        if (this.truePeaks.length > 5) {
            console.log("Error in PersistantHomology.findPeaks: too many peaks were found (", this.truePeaks.length + ")")
        } else {
            for (let peak of this.homologyPeaks) {
                if (peak.height > this.options.options.minPeakHeight && area(peak.polygon.map((p) => { return { x: p[0], y: p[1] } })) > this.options.options.minPeakSize && !_.find(this.truePeaks, p => p.id === peak.id)) {
                    // console.log(peak, 'has qualified to be added to truePeaks')
                    const truePeak = _.cloneDeep(peak)
                    truePeak.homologyParameters = {
                        bonusIterations: peak.maxIterations
                    }
                    this.truePeaks.push(truePeak)
                }
            }

            return this.truePeaks
        }
    }

    // Find peaks using gating template information
    findPeaksWithTemplate (stepCallback) {
        // First find true peaks at their original size
        this.options.options.maxIterations = 0
        this.findPeaksInternal(stepCallback)
        const polygonTemplates = _.filter(this.options.gateTemplates, p => p.type === constants.GATE_TYPE_POLYGON)
        // Try and match them to options.gateTemplates
        if (this.truePeaks.length !== polygonTemplates.length) {
            console.log(this.options)
            console.log('Error, peak number didnt match templates', this.truePeaks)
            return []
        } else {
            const groups = this.getAxisGroups(this.truePeaks)
            // console.log(groups)
            for (let peak of this.truePeaks) {
                peak.xGroup = _.findIndex(groups.xGroups, g => g.peaks.includes(peak.id))
                peak.yGroup = _.findIndex(groups.yGroups, g => g.peaks.includes(peak.id))
            }

            // Compare the orders to the templates
            let orderMatches = true
            for (let i = 0; i < polygonTemplates.length; i++) {
                // If there's no matching template for the peak we're looking at
                if (!_.find(this.truePeaks, p => p.yGroup === polygonTemplates[i].yGroup && p.xGroup === polygonTemplates[i].xGroup)) {
                    orderMatches = false
                }
            }
            // console.log(groups)
            // If we match along one of the axis, it's likely that the peaks have just shifted order slightly. Re order them so they match the other axis
            if (!orderMatches) {
                console.log(this.truePeaks)
                console.log(groups)
                console.log('neither order matches, aborting')
                return []
            }

            for (let i = 0; i < polygonTemplates.length; i++) {
                const matchingPeak = _.find(this.truePeaks, p => p.yGroup === polygonTemplates[i].yGroup && p.xGroup === polygonTemplates[i].xGroup)
                polygonTemplates[i].centerPoint = getPolygonCenter(matchingPeak.polygon)
            }

            this.homologyPeaks = []
            this.truePeaks = []

            let currentHeight = 100

            while (currentHeight > 3) {
                this.performHomologyIteration(currentHeight, polygonTemplates)
                currentHeight = currentHeight - 1
                if (stepCallback) { stepCallback('Applying existing templates to sample: ' + (100 - currentHeight) + '% complete.') }
            }

            if (this.truePeaks.length > 5) {
                console.log("Error in PersistantHomology.findPeaks: too many peaks were found (", this.truePeaks.length, ")")
            } else {
                // Include any large peaks that didn't reach their max iterations
                for (let peak of this.homologyPeaks) {
                    if (peak.truePeak && !_.find(this.truePeaks, p => p.id === peak.id)) {
                        this.truePeaks.push(_.cloneDeep(peak))
                    }
                }

                if (true || this.options.options.breakLongLinesIntoPoints) {
                    this.breakLongLinesIntoPoints()
                }

                if (this.options.FCSFile.machineType === constants.MACHINE_CYTOF) {
                    this.expandToIncludeZeroes()
                }

                this.fixOverlappingPolygonsUsingZipper()

                this.findIncludedEvents()

                // Add homology parameters so they can be reused later
                for (let peak of this.truePeaks) {
                    peak.homologyParameters = {
                        bonusIterations: peak.maxIterations
                    }
                    if (this.options.FCSFile.machineType === constants.MACHINE_CYTOF) {
                        peak.homologyParameters.includeXChannelZeroes = peak.includeXChannelZeroes
                        peak.homologyParameters.includeYChannelZeroes = peak.includeYChannelZeroes
                    }
                }

                // Create a negative gate including all the uncaptured events if the user specified
                if (this.options.options.createNegativeGate) {
                    const excludedEventIds = this.truePeaks.reduce((accumulator, current) => { return accumulator.concat(current.includeEventIds) }, [])
                    const gate = {
                        type: constants.GATE_TYPE_NEGATIVE,
                        gateCreator: constants.GATE_CREATOR_PERSISTENT_HOMOLOGY,
                        includeEventIds: _.filter(this.options.population.subPopulation, event => !excludedEventIds.includes(event[2])).map(event => event[2])
                    }

                    this.truePeaks.push(gate)
                }

                return this.truePeaks
            }
        }
    }

    findPeaks (stepCallback, dontIncludeZeroes) {
        this.findPeaksInternal()

        const groups = this.getAxisGroups(this.truePeaks)
        // console.log(groups)
        for (let peak of this.truePeaks) {
            peak.xGroup = _.findIndex(groups.xGroups, g => g.peaks.includes(peak.id))
            peak.yGroup = _.findIndex(groups.yGroups, g => g.peaks.includes(peak.id))
            peak.includeXChannelZeroes = true
            peak.includeYChannelZeroes = true
        }

        if (true || this.options.options.breakLongLinesIntoPoints) {
            this.breakLongLinesIntoPoints()                
        }


        if (this.options.FCSFile.machineType === constants.MACHINE_CYTOF && !dontIncludeZeroes) {
            this.expandToIncludeZeroes()
        }

        this.fixOverlappingPolygonsUsingZipper()

        this.findIncludedEvents()

        // Add homology parameters so they can be reused later
        for (let peak of this.truePeaks) {
            peak.homologyParameters = {
                bonusIterations: peak.maxIterations
            }
            if (this.options.FCSFile.machineType === constants.MACHINE_CYTOF) {
                peak.homologyParameters.includeXChannelZeroes = true
                peak.homologyParameters.includeYChannelZeroes = true
            }
        }

        // Create a negative gate including all the uncaptured events if the user specified
        if (this.options.options.createNegativeGate) {
            const excludedEventIds = this.truePeaks.reduce((accumulator, current) => { return accumulator.concat(current.includeEventIds) }, [])
            const gate = {
                type: constants.GATE_TYPE_NEGATIVE,
                gateCreator: constants.GATE_CREATOR_PERSISTENT_HOMOLOGY,
                includeEventIds: _.filter(this.options.population.subPopulation, event => !excludedEventIds.includes(event[2])).map(event => event[2])
            }

            this.truePeaks.push(gate)
        }

        return this.truePeaks
    }

    performHomologyIteration (height, gateTemplates)  {
        for (let y = 0; y < this.options.options.plotHeight; y++) {
            const column = this.options.population.densityMap.densityMap[y]
            if (!column || column.length === 0) { continue }

            for (let x = 0; x < column.length; x++) {
                const density = column[x]

                if (density >= (height / 100 * this.options.population.densityMap.maxDensity) && density < (height + 2) / 100 * this.options.population.densityMap.maxDensity) {
                    let foundPeak = false

                    for (var i = 0; i < this.homologyPeaks.length; i++) {
                        foundPeak = pointInsidePolygon([x, y], this.homologyPeaks[i].polygon)
                        if (foundPeak) {
                            break
                        }
                    }

                    if (!foundPeak || this.homologyPeaks.length === 0) {
                        let closestPeakIndex
                        let closestPeakDistance = Infinity
                        for (var i = 0; i < this.homologyPeaks.length; i++) {
                            const peak = this.homologyPeaks[i]
                            // If the new point is close enough to the edge, expand the polygon to accomodate it
                            const distance = peak.polygon.length === 1 ? distanceBetweenPoints([x, y], peak.polygon[0]) : distanceToPolygon([x, y], peak.polygon)
                            if (distance < closestPeakDistance) {
                                closestPeakIndex = i
                                closestPeakDistance = distance
                            }
                        }

                        if (closestPeakDistance < this.options.options.edgeDistance) {
                            this.homologyPeaks[closestPeakIndex].pointsToAdd.push([x, y])
                            foundPeak = true
                        }

                        if (!foundPeak) {
                            this.homologyPeaks.push({
                                id: uuidv4(),
                                polygon: [[x, y]],
                                height: 0,
                                bonusIterations: 0,
                                maxIterations: this.options.options.maxIterations,
                                type: constants.GATE_TYPE_POLYGON,
                                pointsToAdd: []
                            })
                        }
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
                peak.polygon = newPolygon
                peak.pointsToAdd = []
            }
        }

        // Merge overlapping polygons
        for (let i = 0; i < this.homologyPeaks.length; i++) {
            let intersected = false
            for (let j = 0; j < this.homologyPeaks.length; j++) {
                if (i === j) { continue }
                let intersected = polygonsIntersect(this.homologyPeaks[i].polygon, this.homologyPeaks[j].polygon)
                if (!intersected) {
                    // If the edge of a polygon is within a small distance of the nearby polygon, count them as intersected
                    for (let p = 0; p < this.homologyPeaks[i].polygon.length; p++) {
                        if (distanceToPolygon([this.homologyPeaks[i].polygon[p]], this.homologyPeaks[j].polygon) < this.options.options.edgeDistance) {
                            intersected = true
                            break
                        }
                    }
                }
                // Silently merge if the polygons are below a certain size
                if (intersected) {
                    // console.log(i, j)
                    // console.log('polygon height of', this.homologyPeaks[i], ' before merging:', this.homologyPeaks[i].height)
                    // console.log('polygon height of', this.homologyPeaks[j], ' before merging:', this.homologyPeaks[j].height)
                    // Don't try and get area of a polygon with only one or two points
                    const iSize = this.homologyPeaks[i].polygon.length < 3 ? 0 : area(this.homologyPeaks[i].polygon.map((p) => { return { x: p[0], y: p[1] } }))
                    const jSize = this.homologyPeaks[j].polygon.length < 3 ? 0 : area(this.homologyPeaks[j].polygon.map((p) => { return { x: p[0], y: p[1] } }))

                    if (jSize < this.options.options.minPeakSize && this.homologyPeaks[j].height > this.options.options.minPeakHeight) {
                        const newPolygon = this.homologyPeaks[i].polygon.concat(this.homologyPeaks[j].polygon.slice(0))
                        this.homologyPeaks.splice(i, 1, {
                            polygon: newPolygon,
                            type: constants.GATE_TYPE_POLYGON,
                            height: this.homologyPeaks[i].height,
                            id: this.homologyPeaks[i].id,
                            truePeak: this.homologyPeaks[i].truePeak,
                            bonusIterations: this.homologyPeaks[i].bonusIterations,
                            maxIterations: this.homologyPeaks[i].maxIterations,
                            xGroup: this.homologyPeaks[i].xGroup,
                            yGroup: this.homologyPeaks[i].yGroup
                        })
                        this.homologyPeaks.splice(j, 1)

                        if (j < i) {
                            i--
                        }
                        j--

                        // Rebuild polygons after combining
                        const grahamScan = new GrahamScan();
                        this.homologyPeaks[i].polygon.map(p => grahamScan.addPoint(p[0], p[1]))
                        this.homologyPeaks[i].polygon = grahamScan.getHull().map(p => [p.x, p.y])
                        this.homologyPeaks[i].pointsToAdd = []
                        intersected = true
                    } else if (iSize > this.options.options.minPeakSize && this.homologyPeaks[i].height > this.options.options.minPeakHeight) {
                        this.homologyPeaks[i].truePeak = true
                        if (gateTemplates) {
                            const centerPoint = getPolygonCenter(this.homologyPeaks[i].polygon)
                            const template = _.find(gateTemplates, g => Math.abs(g.centerPoint[0] - centerPoint[0]) < 20 && Math.abs(g.centerPoint[1] - centerPoint[1]) < 20)
                            if (template) {
                                this.homologyPeaks[i].maxIterations = template.typeSpecificData.bonusIterations
                                this.homologyPeaks[i].xGroup = template.xGroup
                                this.homologyPeaks[i].yGroup = template.yGroup
                                if (this.options.FCSFile.machineType === constants.MACHINE_CYTOF) {
                                    this.homologyPeaks[i].includeXChannelZeroes = template.typeSpecificData.includeXChannelZeroes
                                    this.homologyPeaks[i].includeYChannelZeroes = template.typeSpecificData.includeYChannelZeroes
                                }
                            }
                        }
                    }
                }
            }
            if (!intersected) {
                this.homologyPeaks[i].height++
            }

            if (this.homologyPeaks[i].truePeak && !_.find(this.truePeaks, p => p.id === this.homologyPeaks[i].id)) {
                const peak = this.homologyPeaks[i]
                // If a peak has reached it's bonus iterations count, clone it into true peaks
                // console.log(peak.maxIterations)
                if (peak.bonusIterations >= peak.maxIterations) {
                    this.truePeaks.push(_.cloneDeep(peak))
                } else if (peak.truePeak) {
                    peak.bonusIterations++
                }
            }
        }
    }
}