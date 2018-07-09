// -------------------------------------------------------------------------
// Uses the Persistent Homology technique to discover peaks / populations in
// 2d data.
// -------------------------------------------------------------------------

import polygonsIntersect from 'polygon-overlap'
import pointInsidePolygon from 'point-in-polygon'
import area from 'area-polygon'
import hull from 'hull.js'
import _ from 'lodash'
import uuidv4 from 'uuid/v4'
import constants from '../../lib/constants'
import { getPolygonCenter } from '../../gatekeeper-utilities/utilities'
import { distanceToPolygon, distanceBetweenPoints } from 'distance-to-polygon'

let CYTOF_HISTOGRAM_WIDTH

export default class PersistentHomology {

    constructor (population, options) {
        if (!population) {
            throw 'Error initializing PersistantHomology: population is required'
        }

        this.options = _.merge({
            edgeDistance: options.plotWidth * 0.05,
            minPeakHeight: options.plotHeight * 0.04,
            minPeakSize: 5000,
            sampleNuclei: []
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
        let xRange = peaks.reduce((acc, curr) => { return [ Math.min(acc[0], curr.nucleus[0]), Math.max(acc[1], curr.nucleus[0]) ] }, [Infinity, -Infinity])
        // Get [minY, maxY] range of peaks along y axis
        let yRange = peaks.reduce((acc, curr) => { return [ Math.min(acc[0], curr.nucleus[1]), Math.max(acc[1], curr.nucleus[1]) ] }, [Infinity, -Infinity])
        // Create buckets and place peaks into groups along each axis
        let xGroups = []
        let yGroups = []
        for (let peak of peaks) {
        
            const newXGroup = () => {
                xGroups.push({
                    position: peak.nucleus[0],
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
                    if (Math.abs(group.position - peak.nucleus[0]) < (xRange[1] - xRange[0]) * maxGroupDistance) {
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
                    position: peak.nucleus[1],
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
                    if (Math.abs(group.position - peak.nucleus[1]) < (yRange[1] - yRange[0]) * maxGroupDistance) {
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
        // Add the sample nuclei as small peaks before looking for naturally occuring ones
        let peaks = this.options.sampleNuclei.map((n) => {
            const edges = 20
            const radius = 30
            const circle = []
            for (let i = 0; i < edges; i++) {
                circle.push([
                    n[0] + radius * Math.cos(2 * Math.PI * i / edges),
                    n[1] + radius * Math.sin(2 * Math.PI * i / edges)
                ])
            }
            
            let includedPoints = []
            for (let x = n[0] - radius; x < n[0] + radius; x++) {
                for (let y = n[1] - radius; y < n[1] + radius; y++) {
                    if (this.population.densityMap.densityMap[y][x] >= 1 && pointInsidePolygon([x, y], circle)) {
                        includedPoints.push([x, y])
                    }
                }
            }

            return {
                id: uuidv4(),
                polygons: [
                    circle
                ],
                nucleus: n,
                height: 0,
                type: constants.GATE_TYPE_POLYGON,
                includedPoints: includedPoints
            }
        })

        while (currentHeight > 0) {
            peaks = this.performHomologyIteration(currentHeight, peaks)
            currentHeight = currentHeight - 1
            if (stepCallback) { stepCallback('Gating using Persistent Homology: ' + (100 - currentHeight) + '% complete.') }
        }

        if (_.filter(peaks, p => p.truePeak).length > 5) {
            console.log("Error in PersistantHomology.findPeaks: too many peaks were found (", peaks.length + ")")
        } else {
            // Check if any peaks have grown large but haven't intersected
            for (let peak of peaks) {
                if (!peak.truePeak && peak.height > this.options.minPeakHeight && area(peak.polygons.slice(-1)[0].map((p) => { return { x: p[0], y: p[1] } })) > this.options.minPeakSize) {
                    peak.truePeak = true
                    peak.truePeakWidthIndex = peak.polygons.length - 1
                    peak.widthIndex = 0
                }

                peak.gateCreatorData = {
                    truePeakWidthIndex: peak.truePeakWidthIndex,
                    // widthIndex: Math.min(25, peak.polygons.length - peak.truePeakWidthIndex - 1)
                    widthIndex: peak.polygons.length - peak.truePeakWidthIndex - 1
                }
            }

            return _.filter(peaks, p => p.truePeak)
        }
    }

    // Find peaks using gating template information
    findPeaksWithTemplate (stepCallback, gateTemplates) {
        // First find true peaks at their original size
        let peaks = this.findPeaksInternal(stepCallback)
        const groups = this.getAxisGroups(peaks)
        for (let peak of peaks) {
            peak.xGroup = _.findIndex(groups.xGroups, g => g.peaks.includes(peak.id))
            peak.yGroup = _.findIndex(groups.yGroups, g => g.peaks.includes(peak.id))
        }
        const polygonTemplates = _.filter(gateTemplates, p => p.type === constants.GATE_TYPE_POLYGON)
        let orderStatus = {
            'message': 'Found populations match the template',
            'status': constants.STATUS_SUCCESS,
            'information': 'Each found population was able to be matched to a gate template.'
        }
        // Compare the orders to the templates
        for (let i = 0; i < peaks.length; i++) {
            // If there's no matching template for the peak we're looking at
            if (!_.find(polygonTemplates, polygonTemplate => peaks[i].yGroup === polygonTemplate.yGroup && peaks[i].xGroup === polygonTemplate.xGroup)) {
                orderStatus = {
                    'message': 'Found populations didn\'t match the template',
                    'status': constants.STATUS_FAIL,
                    'information': 'Consider increasing or the "Max Group Distance" parameter if peaks seem to be in the same shape but have been assigned to different groups.'
                }
            }
        }

        let lengthStatus = {
            'message': 'The same number of populations were found',
            'status': constants.STATUS_SUCCESS,
            'information': ''
        }
        // Try and match them to options.gateTemplates
        if (peaks.length !== polygonTemplates.length) {
            lengthStatus = {
                'message': 'A different number of populations were found',
                'status': constants.STATUS_FAIL,
                'information': `${peaks.length} population${peaks.length === 1 ? ' was' : 's were'} found in this sample, whereas ${gateTemplates.length} population${gateTemplates.length === 1 ? ' was' : 's were'} expected by the template. Consider adjusting Minimum Peak Size / Height to increase or decrease the number of populations discovered.`
            }
        }

        if (orderStatus.status === constants.STATUS_FAIL || lengthStatus.status === constants.STATUS_FAIL) {
            return {
                status: constants.STATUS_FAIL,
                data: {
                    gates: peaks,
                    criteria: [ lengthStatus, orderStatus ]
                }
            }
        }

        // Make sure the widthIndex specified by the template doesn't overflow the boundaries of the polygon array
        for (let peak of peaks) {
            const template = _.find(gateTemplates, gt => gt.xGroup === peak.xGroup && gt.yGroup === peak.yGroup)
            if (template) {
                peak.gateCreatorData = template.typeSpecificData
                peak.gateCreatorData.truePeakWidthIndex = peak.truePeakWidthIndex                    
                // peak.gateCreatorData.widthIndex = Math.max(Math.min(peak.polygons.length - 1 - peak.gateCreatorData.truePeakWidthIndex, peak.gateCreatorData.widthIndex), -peak.gateCreatorData.truePeakWidthIndex)
                peak.gateCreatorData.widthIndex = peak.polygons.length - peak.truePeakWidthIndex - 1
                peak.gateTemplateId = template.id
            }
        }

        return {
            status: constants.STATUS_SUCCESS,
            data: {
                gates: peaks
            }
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

        return {
            status: constants.STATUS_SUCCESS,
            data: {
                gates: peaks
            }
        }
    }

    performHomologyIteration (height, peaks)  {
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
                            newPeaks[closestPeakIndex].includedPoints.push([x, y])
                            newPeaks[closestPeakIndex].recalculate = true
                            foundPeak = true
                        }

                        if (!foundPeak) {
                            newPeaks.push({
                                id: uuidv4(),
                                polygons: [
                                    [[x, y]]
                                ],
                                nucleus: [x, y],
                                height: 0,
                                type: constants.GATE_TYPE_POLYGON,
                                includedPoints: [[x, y]]
                            })
                        }
                    }
                }
            }
        }

        // Add new points and recalculate polygons
        for (let peak of newPeaks) {
            if (peak.recalculate) {
                // Recalculate the polygon boundary
                peak.includedPoints.length                
                const newPolygon = hull(peak.includedPoints, 50)
                peak.polygons.push(newPolygon)
                peak.recalculate = false
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
                    // Don't try and get area of a polygon with only one or two points
                    const iSize = newPeaks[i].polygons.slice(-1)[0].length < 3 ? 0 : area(newPeaks[i].polygons.slice(-1)[0].map((p) => { return { x: p[0], y: p[1] } }))
                    const jSize = newPeaks[j].polygons.slice(-1)[0].length < 3 ? 0 : area(newPeaks[j].polygons.slice(-1)[0].map((p) => { return { x: p[0], y: p[1] } }))

                    if (jSize < this.options.minPeakSize && newPeaks[j].height > this.options.minPeakHeight) {
                        let newIncludedPoints = newPeaks[i].includedPoints.concat(newPeaks[j].includedPoints)
                        console.log(newIncludedPoints.length)
                        // Rebuild polygons after combining
                        let newPolygon = hull(newIncludedPoints, 50)
                        
                        newPeaks.splice(i, 1, {
                            polygons: newPeaks[i].polygons.concat([ newPolygon ]),
                            nucleus: newPeaks[i].nucleus,
                            includedPoints: newIncludedPoints,
                            type: constants.GATE_TYPE_POLYGON,
                            height: newPeaks[i].height,
                            id: newPeaks[i].id,
                            truePeak: newPeaks[i].truePeak,
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