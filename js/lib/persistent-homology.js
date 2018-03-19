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

// This function takes a two dimensional array (e.g foo[][]) and returns an array of polygons
// representing discovered peaks. e.g:
// [[2, 1], [2, 2], [1, 2]]


// Calculate 1d density using kernel density estimation for drawing histograms
function kernelDensityEstimator(kernel, X) {
  return function(V) {
    return X.map(function(x) {
      return [x, d3.mean(V, function(v) { return kernel(x - v); })];
    });
  };
}

function kernelEpanechnikov(k) {
  return function(v) {
    return Math.abs(v /= k) <= 1 ? 0.75 * (1 - v * v) / k : 0;
  };
}

export default class PersistentHomology {

    constructor (options) {
        this.options = _.merge({
            edgeDistance: constants.PLOT_WIDTH * 0.03,
            minPeakHeight: constants.PLOT_WIDTH * 0.04,
            maxIterations: 0,//constants.PLOT_WIDTH * 0.02,
            densityMap: null
        }, options)

        if (!this.options.sample || !this.options.options || !this.options.population) {
            throw 'Error initializing PersistantHomology: options.population and option.sample are required'
        }

        this.homologyPeaks = []
        this.truePeaks = []
    }

    expandToIncludeZeroes () {
        // If we're looking at cytof data, extend lower gates out towards zero if there is a peak there
        const minPeakWidth = constants.PLOT_WIDTH * 0.05
        const inflectionWidth = 10

        const scales = getScales({
            selectedXScale: this.options.options.selectedXScale,
            selectedYScale: this.options.options.selectedYScale,
            xRange: [ this.options.sample.FCSParameters[this.options.options.selectedXParameterIndex].statistics.min, this.options.sample.FCSParameters[this.options.options.selectedXParameterIndex].statistics.max ],
            yRange: [ this.options.sample.FCSParameters[this.options.options.selectedYParameterIndex].statistics.min, this.options.sample.FCSParameters[this.options.options.selectedYParameterIndex].statistics.max ],
            width: constants.PLOT_WIDTH - constants.CYTOF_HISTOGRAM_WIDTH,
            height: constants.PLOT_HEIGHT - constants.CYTOF_HISTOGRAM_HEIGHT
        })

        const densityY = kernelDensityEstimator(kernelEpanechnikov(minPeakWidth / 2), _.range(0, constants.PLOT_WIDTH - constants.CYTOF_HISTOGRAM_WIDTH))(this.options.population.yChannelZeroes.map(scales.xScale))
        const densityX = kernelDensityEstimator(kernelEpanechnikov(minPeakWidth / 2), _.range(0, constants.PLOT_HEIGHT - constants.CYTOF_HISTOGRAM_HEIGHT))(this.options.population.xChannelZeroes.map(scales.yScale))

        let yPeaks = []
        // Find peaks in the 1d data where one of the channels is zero
        for (let i = 0; i < densityY.length; i++) {
            let isPeak = true
            for (let j = Math.max(i - minPeakWidth, 0); j < Math.min(i + minPeakWidth, densityY.length); j++) {
                if (i === j) { continue }

                if (densityY[j][1] >= densityY[i][1]) {
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
                } else if (densityY[index][1] < densityY.slice(index - inflectionWidth - 1, index - 1).reduce((acc, curr) => { return acc + curr[1] }, 0) / inflectionWidth || densityY[index][1] < 0.001) {
                    lowerCutoffFound = true
                    yCutoffs[i][0] = index
                }

                index--
            }

            index = peak + 1
            while (!upperCutoffFound) {
                if (index === densityY.length) {
                    upperCutoffFound = true
                    yCutoffs[i][1] = index - 1
                // If the mean of the next inflectionWidth points is greater than the current point, the slope is increasing again (approaching another peak)
                } else if (densityY[index][1] < densityY.slice(index + 1, index + inflectionWidth + 1).reduce((acc, curr) => { return acc + curr[1] }, 0) / inflectionWidth || densityY[index][1] < 0.001) {
                    upperCutoffFound = true
                    yCutoffs[i][1] = index
                }

                index++
            }
        }

        let xPeaks = []
        // Find peaks in the 1d data where one of the channels is zero
        for (let i = 0; i < densityX.length; i++) {
            let isPeak = true
            for (let j = Math.max(i - minPeakWidth, 0); j < Math.min(i + minPeakWidth, densityX.length); j++) {
                if (i === j) { continue }

                if (densityX[j][1] >= densityX[i][1]) {
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
                } else if (densityX[index][1] < densityX.slice(index - inflectionWidth - 1, index - 1).reduce((acc, curr) => { return acc + curr[1] }, 0) / inflectionWidth || densityX[index][1] < 0.001) {
                    lowerCutoffFound = true
                    xCutoffs[i][0] = index
                }

                index--
            }

            index = peak + 1
            while (!upperCutoffFound) {
                if (index === densityX.length) {
                    upperCutoffFound = true
                    xCutoffs[i][1] = index - 1
                // If the mean of the next inflectionWidth points is greater than the current point, the slope is increasing again (approaching another peak)
                } else if (densityX[index][1] < densityX.slice(index + 1, index + inflectionWidth + 1).reduce((acc, curr) => { return acc + curr[1] }, 0) / inflectionWidth || densityX[index][1] < 0.001) {
                    upperCutoffFound = true
                    xCutoffs[i][1] = index
                }

                index++
            }
        }

        console.log(xPeaks, yPeaks)

        for (let p = 0; p < yPeaks.length; p++) {
            const peak = yPeaks[p]
            // Find the closest gate
            let closestGate
            let closestDistance = Infinity
            for (let gate of this.truePeaks) {
                const centerPoint = getPolygonCenter(gate.polygon)
                const distance = distanceBetweenPoints(centerPoint, [peak, constants.PLOT_HEIGHT - constants.CYTOF_HISTOGRAM_HEIGHT])
                if (distance < closestDistance && pointInsidePolygon([peak, centerPoint[1]], gate.polygon)) {
                    closestDistance = distance
                    closestGate = gate
                }
            }

            if (!closestGate) {
                console.log('Error: no close peak found for y = 0 peak with x value', peak)
                yPeaks.splice(p, 1)
                p--
                continue
            }

            // Insert the new 0 edge points
            const newGatePolygon = closestGate.polygon.slice(0).concat([
                [yCutoffs[p][0], constants.PLOT_HEIGHT - constants.CYTOF_HISTOGRAM_HEIGHT],
                [yCutoffs[p][0], constants.PLOT_HEIGHT],
                [yCutoffs[p][1], constants.PLOT_HEIGHT],
                [yCutoffs[p][1], constants.PLOT_HEIGHT - constants.CYTOF_HISTOGRAM_HEIGHT]
            ])
            // Recalculate the polygon boundary
            const grahamScan = new GrahamScan();
            newGatePolygon.map(p => grahamScan.addPoint(p[0], p[1]))
            closestGate.polygon = grahamScan.getHull().map(p => [p.x, p.y])
            closestGate.yCutoffs = yCutoffs[p]
            closestGate.zeroY = true
        }

        for (let p = 0; p < xPeaks.length; p++) {
            const peak = xPeaks[p]
            // Find the closest gate
            let closestGate
            let closestDistance = Infinity
            for (let gate of this.truePeaks) {
                const centerPoint = getPolygonCenter(gate.polygon)
                const distance = distanceBetweenPoints(centerPoint, [constants.CYTOF_HISTOGRAM_WIDTH, peak])
                if (distance < closestDistance && pointInsidePolygon([centerPoint[0], peak], gate.polygon)) {
                    closestDistance = distance
                    closestGate = gate
                }
            }

            if (!closestGate) {
                console.log('Error: no close peak found for x = 0 peak with y value', peak)
                xPeaks.splice(p, 1)
                p--
                continue
            }

            // Insert the two new 0 edge points
            const newGatePolygon = closestGate.polygon.slice(0).concat([
                [constants.CYTOF_HISTOGRAM_WIDTH, xCutoffs[p][0]],
                [0, xCutoffs[p][0]],
                [0, xCutoffs[p][1]],
                [constants.CYTOF_HISTOGRAM_WIDTH, xCutoffs[p][1]]
            ])
            // Recalculate the polygon boundary
            const grahamScan = new GrahamScan();
            newGatePolygon.map(p => grahamScan.addPoint(p[0], p[1]))
            closestGate.polygon = grahamScan.getHull().map(p => [p.x, p.y])
            closestGate.xCutoffs = xCutoffs[p]
            closestGate.zeroX = true
        }

        // If a gate includes zeroes on both the x and y axis, add a special (0,0) point to the gate
        for (let gate of this.truePeaks) {
            if (gate.zeroX && gate.zeroY) {
                // Insert the two new 0 edge points
                const newGatePolygon = gate.polygon.concat([[0, constants.PLOT_HEIGHT]])
                // Recalculate the polygon boundary
                const grahamScan = new GrahamScan();
                newGatePolygon.map(p => grahamScan.addPoint(p[0], p[1]))
                gate.xCutoffs[1] = constants.PLOT_HEIGHT
                gate.yCutoffs[0] = 0
                gate.polygon = grahamScan.getHull().map(p => [p.x, p.y])
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
                    if (Math.abs(group.position - peakCenter[0]) <= ((xRange[1] - xRange[0]) * 0.3)) {
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
                    if (Math.abs(group.position - peakCenter[1]) <= ((yRange[1] - yRange[0]) * 0.3)) {
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

    // Find peaks using gating template information
    findPeaksWithTemplate (stepCallback) {
        // First find true peaks at their original size
        this.options.maxIterations = 0
        this.findPeaks(stepCallback, true)
        // Try and match them to options.gateTemplates
        if (this.truePeaks.length !== this.options.gateTemplates.length) {
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
            for (let i = 0; i < this.options.gateTemplates.length; i++) {
                // If there's no matching template for the peak we're looking at
                if (!_.find(this.truePeaks, p => p.yGroup === this.options.gateTemplates[i].yGroup && p.xGroup === this.options.gateTemplates[i].xGroup)) {
                    orderMatches = false
                }
            }
            console.log(groups)
            // If we match along one of the axis, it's likely that the peaks have just shifted order slightly. Re order them so they match the other axis
            if (!orderMatches) {
                console.log(this.truePeaks)
                console.log(this.groups)
                console.log('neither order matches, aborting')
                return []
            }

            for (let i = 0; i < this.options.gateTemplates.length; i++) {
                const matchingPeak = _.find(this.truePeaks, p => p.yGroup === this.options.gateTemplates[i].yGroup && p.xGroup === this.options.gateTemplates[i].xGroup)
                this.options.gateTemplates[i].centerPoint = getPolygonCenter(matchingPeak.polygon)
            }

            this.homologyPeaks = []
            this.truePeaks = []

            let currentHeight = 100

            while (currentHeight > 0) {
                this.performHomologyIteration(currentHeight, this.options.gateTemplates)
                currentHeight = currentHeight - 1
                if (stepCallback) { stepCallback('Applying existing templates to sample: ' + (100 - currentHeight) + '% complete.') }
            }

            if (this.truePeaks.length > 5) {
                console.log("Error in PersistantHomology.findPeaks: too many peaks were found (", this.truePeaks.length + ")")
            } else {
                // Include any large peaks that didn't reach their max iterations
                for (let peak of this.homologyPeaks) {
                    if (peak.truePeak && !_.find(this.truePeaks, p => p.id === peak.id)) {
                        const truePeak = _.cloneDeep(peak)
                        truePeak.homologyParameters = {
                            bonusIterations: peak.maxIterations
                        }
                        this.truePeaks.push(truePeak)
                    }
                }

                if (this.options.options.selectedMachineType === constants.MACHINE_CYTOF) {
                    this.expandToIncludeZeroes()
                }

                console.log(this.truePeaks)

                return this.truePeaks
            }
        }
    }

    findPeaks (stepCallback, dontIncludeZeroes) {
        let currentHeight = 100

        while (currentHeight > 5) {
            this.performHomologyIteration(currentHeight)
            currentHeight = currentHeight - 1
            if (stepCallback) { stepCallback('Gating using Persistent Homology: ' + (100 - currentHeight) + '% complete.') }
        }
        
        if (this.truePeaks.length > 5) {
            console.log("Error in PersistantHomology.findPeaks: too many peaks were found (", this.truePeaks.length + ")")
        } else {
            for (let peak of this.homologyPeaks) {
                if (peak.truePeak && !_.find(this.truePeaks, p => p.id === peak.id)) {
                    const truePeak = _.cloneDeep(peak)
                    truePeak.homologyParameters = {
                        bonusIterations: peak.maxIterations
                    }
                    this.truePeaks.push(truePeak)
                }
            }

            if (this.options.options.selectedMachineType === constants.MACHINE_CYTOF && !dontIncludeZeroes) {
                this.expandToIncludeZeroes()
            }
            const groups = this.getAxisGroups(this.truePeaks)
            // console.log(groups)
            for (let peak of this.truePeaks) {
                peak.xGroup = _.findIndex(groups.xGroups, g => g.peaks.includes(peak.id))
                peak.yGroup = _.findIndex(groups.yGroups, g => g.peaks.includes(peak.id))
            }
            // console.log(this.truePeaks)
            return this.truePeaks
        }
    }

    performHomologyIteration (height, gateTemplates)  {
        for (let y = 0; y < this.options.population.densityMap.densityMap.length; y++) {
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

                        if (closestPeakDistance < this.options.edgeDistance) {
                            this.homologyPeaks[closestPeakIndex].pointsToAdd.push([x, y])
                            foundPeak = true
                        }

                        if (!foundPeak) {
                            this.homologyPeaks.push({
                                id: uuidv4(),
                                polygon: [[x, y]],
                                height: 0,
                                bonusIterations: 0,
                                maxIterations: this.options.maxIterations,
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
                        if (distanceToPolygon([this.homologyPeaks[i].polygon[p]], this.homologyPeaks[j].polygon) < this.options.edgeDistance) {
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

                    if (jSize < 5000) {
                        const newPolygon = this.homologyPeaks[i].polygon.concat(this.homologyPeaks[j].polygon.slice(0))
                        this.homologyPeaks.splice(i, 1, {
                            polygon: newPolygon,
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
                    } else if (iSize > 5000) {
                        this.homologyPeaks[i].truePeak = true
                        if (gateTemplates) {
                            const centerPoint = getPolygonCenter(this.homologyPeaks[i].polygon)
                            const template = _.find(gateTemplates, g => Math.abs(g.centerPoint[0] - centerPoint[0]) < 20 && Math.abs(g.centerPoint[1] - centerPoint[1]) < 20)
                            if (template) {
                                this.homologyPeaks[i].maxIterations = template.typeSpecificData.bonusIterations
                                this.homologyPeaks[i].xGroup = template.xGroup
                                this.homologyPeaks[i].yGroup = template.yGroup
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
                if (peak.bonusIterations > peak.maxIterations) {
                    const truePeak = _.cloneDeep(peak)
                    truePeak.homologyParameters = {
                        bonusIterations: peak.maxIterations
                    }
                    this.truePeaks.push(truePeak)
                } else if (peak.truePeak) {
                    peak.bonusIterations++
                }
            }
        }
    }
}