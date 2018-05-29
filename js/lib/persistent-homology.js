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
import { getPolygonCenter } from './utilities'
import { distanceToPolygon, distanceBetweenPoints } from 'distance-to-polygon'
import * as turf from '@turf/turf'

let CYTOF_HISTOGRAM_WIDTH

export default class PersistentHomology {

    constructor (population, options) {
        if (!population) {
            throw 'Error initializing PersistantHomology: population is required'
        }

        this.options = _.merge({
            edgeDistance: options.plotWidth * 0.05,
            minPeakHeight: options.plotHeight * 0.04,
            minPeakSize: 5000
        }, options)

        this.population = population

        CYTOF_HISTOGRAM_WIDTH = Math.round(Math.min(this.options.plotWidth, this.options.plotHeight) * 0.07)
    }

    // Returns this.truePeaks arranged into groups along the x and y axis
    getAxisGroups (peaks) {
        // Percentage of maximum distance between furthest peak to group together
        const maxGroupDistance = 0.3
        // Divide peaks into groups along the x and y axis
        // Get [minX, maxX] range of peaks along x axis
        let xRange = peaks.reduce((acc, curr) => { return [ Math.min(acc[0], getPolygonCenter(curr.polygons[curr.truePeakWidthIndex])[0]), Math.max(acc[1], getPolygonCenter(curr.polygons[curr.truePeakWidthIndex])[0]) ] }, [Infinity, -Infinity])
        // Get [minY, maxY] range of peaks along y axis
        let yRange = peaks.reduce((acc, curr) => { return [ Math.min(acc[0], getPolygonCenter(curr.polygons[curr.truePeakWidthIndex])[1]), Math.max(acc[1], getPolygonCenter(curr.polygons[curr.truePeakWidthIndex])[1]) ] }, [Infinity, -Infinity])
        // Create buckets and place peaks into groups along each axis
        // console.log(xRange, yRange)
        // console.log((xRange[1] - xRange[0]) * 0.2, (yRange[1] - yRange[0]) * 0.2)
        let xGroups = []
        let yGroups = []
        for (let peak of peaks) {
            let peakCenter = getPolygonCenter(peak.polygons[peak.truePeakWidthIndex])
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

    findPeaksInternal (stepCallback, polygonTemplates) {
        let currentHeight = 100
        let peaks = []

        while (currentHeight > 3) {
            peaks = this.performHomologyIteration(currentHeight, peaks, polygonTemplates)
            currentHeight = currentHeight - 1
            if (stepCallback) { stepCallback('Gating using Persistent Homology: ' + (100 - currentHeight) + '% complete.') }
        }

        if (_.filter(peaks, p => p.truePeak).length > 5) {
            console.log("Error in PersistantHomology.findPeaks: too many peaks were found (", peaks.length + ")")
        } else {
            // Check if any peaks have grown large but haven't intersected
            for (let peak of peaks) {
                if (!peak.truePeak && peak.height > this.options.minPeakHeight && area(peak.polygons.slice(-1)[0].map((p) => { return { x: p[0], y: p[1] } })) > this.options.minPeakSize) {
                    // console.log(peak, 'has qualified to be added to truePeaks')
                    peak.truePeak = true
                    peak.truePeakWidthIndex = peak.polygons.length - 1
                    peak.widthIndex = peak.polygons.length - 1
                }
            }

            return _.filter(peaks, p => p.truePeak)
        }
    }

    // Find peaks using gating template information
    findPeaksWithTemplate (stepCallback, gateTemplates) {
        // First find true peaks at their original size
        let peaks = this.findPeaksInternal(stepCallback)
        const polygonTemplates = _.filter(gateTemplates, p => p.type === constants.GATE_TYPE_POLYGON)
        // Try and match them to options.gateTemplates
        if (peaks.length !== polygonTemplates.length) {
            console.log(this.options)
            console.log('Error, peak number didnt match templates', peaks)
            return []
        } else {
            const groups = this.getAxisGroups(peaks)
            // console.log(groups)
            for (let peak of peaks) {
                peak.xGroup = _.findIndex(groups.xGroups, g => g.peaks.includes(peak.id))
                peak.yGroup = _.findIndex(groups.yGroups, g => g.peaks.includes(peak.id))
            }

            // Compare the orders to the templates
            let orderMatches = true
            for (let i = 0; i < polygonTemplates.length; i++) {
                // If there's no matching template for the peak we're looking at
                if (!_.find(peaks, p => p.yGroup === polygonTemplates[i].yGroup && p.xGroup === polygonTemplates[i].xGroup)) {
                    orderMatches = false
                }
            }
            // console.log(groups)
            // If we match along one of the axis, it's likely that the peaks have just shifted order slightly. Re order them so they match the other axis
            if (!orderMatches) {
                console.log(peaks)
                console.log(groups)
                console.log('neither order matches, aborting')
                return []
            }

            for (let i = 0; i < polygonTemplates.length; i++) {
                const matchingPeak = _.find(peaks, p => p.yGroup === polygonTemplates[i].yGroup && p.xGroup === polygonTemplates[i].xGroup)
                polygonTemplates[i].centerPoint = getPolygonCenter(matchingPeak.polygons[matchingPeak.truePeakWidthIndex])
            }

            peaks = this.findPeaksInternal(stepCallback, gateTemplates)

            // Add homology parameters so they can be reused later
            for (let peak of peaks) {
                peak.homologyParameters = {
                    widthIndex: peak.widthIndex
                }
            }

            // // Create a negative gate including all the uncaptured events if the user specified
            // if (this.options.createNegativeGate) {
            //     const excludedEventIds = truePeaks.reduce((accumulator, current) => { return accumulator.concat(current.includeEventIds) }, [])
            //     const gate = {
            //         type: constants.GATE_TYPE_NEGATIVE,
            //         gateCreator: constants.GATE_CREATOR_PERSISTENT_HOMOLOGY,
            //         truePeak: true,
            //         includeEventIds: _.filter(this.population.subPopulation, event => !excludedEventIds.includes(event[2])).map(event => event[2])
            //     }

            //     this.homologyPeaks.push(gate)
            // }

            return peaks
        }
    }

    findPeaks (stepCallback, dontIncludeZeroes) {
        const peaks = this.findPeaksInternal(stepCallback)
        const groups = this.getAxisGroups(peaks)
        // console.log(groups)
        for (let peak of peaks) {
            peak.xGroup = _.findIndex(groups.xGroups, g => g.peaks.includes(peak.id))
            peak.yGroup = _.findIndex(groups.yGroups, g => g.peaks.includes(peak.id))
            peak.includeXChannelZeroes = true
            peak.includeYChannelZeroes = true
        }

        // Add homology parameters so they can be reused later
        for (let peak of peaks) {
            peak.homologyParameters = {
                widthIndex: peak.widthIndex
            }
        }

        // // Create a negative gate including all the uncaptured events if the user specified
        // if (this.options.createNegativeGate) {
        //     const excludedEventIds = peaks.reduce((accumulator, current) => { return accumulator.concat(current.includeEventIds) }, [])
        //     const gate = {
        //         type: constants.GATE_TYPE_NEGATIVE,
        //         gateCreator: constants.GATE_CREATOR_PERSISTENT_HOMOLOGY,
        //         truePeak: true,
        //         includeEventIds: _.filter(this.population.subPopulation, event => !excludedEventIds.includes(event[2])).map(event => event[2])
        //     }

        //     this.homologyPeaks.push(gate)
        // }

        return peaks
    }

    performHomologyIteration (height, peaks, gateTemplates)  {
        const newPeaks = peaks.slice(0)

        for (let y = 0; y < this.options.plotHeight; y++) {
            const column = this.population.densityMap.densityMap[y]
            if (!column || column.length === 0) { continue }

            for (let x = 0; x < column.length; x++) {
                const density = column[x]

                if (density >= (height / 100 * this.population.densityMap.maxDensity) && density < (height + 2) / 100 * this.population.densityMap.maxDensity) {
                    let foundPeak = false

                    for (var i = 0; i < newPeaks.length; i++) {
                        foundPeak = pointInsidePolygon([x, y], newPeaks[i].polygons.slice(-1)[0])
                        if (foundPeak) {
                            break
                        }
                    }

                    if (!foundPeak || newPeaks.length === 0) {
                        let closestPeakIndex
                        let closestPeakDistance = Infinity
                        for (var i = 0; i < newPeaks.length; i++) {
                            const peak = newPeaks[i]
                            // If the new point is close enough to the edge, expand the polygon to accomodate it
                            const distance = peak.polygons.slice(-1)[0].length === 1 ? distanceBetweenPoints([x, y], peak.polygons.slice(-1)[0][0]) : distanceToPolygon([x, y], peak.polygons.slice(-1)[0])
                            if (distance < closestPeakDistance) {
                                closestPeakIndex = i
                                closestPeakDistance = distance
                            }
                        }

                        if (closestPeakDistance < this.options.edgeDistance) {
                            if (newPeaks[closestPeakIndex].pointsToAdd) {
                                newPeaks[closestPeakIndex].pointsToAdd.push([x, y])
                            } else {
                                newPeaks[closestPeakIndex].pointsToAdd = [[x, y]]
                            }
                            foundPeak = true
                        }

                        if (!foundPeak) {
                            newPeaks.push({
                                id: uuidv4(),
                                polygons: [
                                    [[x, y]]
                                ],
                                height: 0,
                                type: constants.GATE_TYPE_POLYGON,
                                pointsToAdd: []
                            })
                        }
                    }
                }
            }
        }

        // Add new points and recalculate polygons
        for (let peak of newPeaks) {
            if (peak.pointsToAdd.length > 0) {
                const polyCopy = peak.polygons.slice(-1)[0].concat(peak.pointsToAdd)
                // Recalculate the polygon boundary
                const grahamScan = new GrahamScan();
                polyCopy.map(p => grahamScan.addPoint(p[0], p[1]))
                const newPolygon = grahamScan.getHull().map(p => [p.x, p.y])
                peak.polygons.push(newPolygon)
                peak.pointsToAdd = []
            }
        }

        // Merge overlapping polygons
        for (let i = 0; i < newPeaks.length; i++) {
            let intersected = false
            for (let j = 0; j < newPeaks.length; j++) {
                if (i === j) { continue }
                let intersected = polygonsIntersect(newPeaks[i].polygons.slice(-1)[0], newPeaks[j].polygons.slice(-1)[0])
                if (!intersected) {
                    // If the edge of a polygon is within a small distance of the nearby polygon, count them as intersected
                    for (let p = 0; p < newPeaks[i].polygons.slice(-1)[0].length; p++) {
                        if (distanceToPolygon([newPeaks[i].polygons.slice(-1)[0][p]], newPeaks[j].polygons.slice(-1)[0]) < this.options.edgeDistance) {
                            intersected = true
                            break
                        }
                    }
                }
                // Silently merge if the polygons are below a certain size
                if (intersected) {
                    // console.log(i, j)
                    // console.log('polygon height of', newPeaks[i], ' before merging:', newPeaks[i].height)
                    // console.log('polygon height of', newPeaks[j], ' before merging:', newPeaks[j].height)
                    // Don't try and get area of a polygon with only one or two points
                    const iSize = newPeaks[i].polygons.slice(-1)[0].length < 3 ? 0 : area(newPeaks[i].polygons.slice(-1)[0].map((p) => { return { x: p[0], y: p[1] } }))
                    const jSize = newPeaks[j].polygons.slice(-1)[0].length < 3 ? 0 : area(newPeaks[j].polygons.slice(-1)[0].map((p) => { return { x: p[0], y: p[1] } }))

                    if (jSize < this.options.minPeakSize && newPeaks[j].height > this.options.minPeakHeight) {
                        let newPolygon = newPeaks[i].polygons.slice(-1)[0].concat(newPeaks[j].polygons.slice(-1)[0].slice(0))
                        // Rebuild polygons after combining
                        const grahamScan = new GrahamScan();
                        newPolygon.map(p => grahamScan.addPoint(p[0], p[1]))
                        newPolygon = grahamScan.getHull().map(p => [p.x, p.y])
                        newPeaks[i].pointsToAdd = []
                        
                        newPeaks.splice(i, 1, {
                            polygons: [ newPolygon ],
                            type: constants.GATE_TYPE_POLYGON,
                            height: newPeaks[i].height,
                            id: newPeaks[i].id,
                            truePeak: newPeaks[i].truePeak,
                            widthIndex: newPeaks[i].widthIndex,
                            truePeakWidthIndex: newPeaks[i].truePeakWidthIndex,
                            xGroup: newPeaks[i].xGroup,
                            yGroup: newPeaks[i].yGroup
                        })
                        newPeaks.splice(j, 1)

                        if (j < i) {
                            i--
                        }
                        j--
                    } else if (!newPeaks[i].truePeak && iSize > this.options.minPeakSize && newPeaks[i].height > this.options.minPeakHeight) {
                        newPeaks[i].truePeak = true
                        newPeaks[i].truePeakWidthIndex = newPeaks[i].polygons.length - 1
                        if (gateTemplates) {
                            const centerPoint = getPolygonCenter(newPeaks[i].polygons.slice(-1)[0])
                            const template = _.find(gateTemplates, g => Math.abs(g.centerPoint[0] - centerPoint[0]) < 20 && Math.abs(g.centerPoint[1] - centerPoint[1]) < 20)
                            if (template) {
                                newPeaks[i].widthIndex = template.typeSpecificData.widthIndex
                                newPeaks[i].xGroup = template.xGroup
                                newPeaks[i].yGroup = template.yGroup
                            }
                        } else {
                            newPeaks[i].widthIndex = newPeaks[i].polygons.length - 1
                        }
                    }
                }
            }

            if (!intersected) {
                newPeaks[i].height++
            }
        }

        return newPeaks
    }
}