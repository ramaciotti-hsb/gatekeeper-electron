// -------------------------------------------------------------------------
// Uses the Persistent Homology technique to discover peaks / populations in
// 2d data. Each iteration is calculated on a different iteration of the
// event loop to prevent blocking for large datasets.
// -------------------------------------------------------------------------

import GrahamScan from './graham-scan.js'
import polygonsIntersect from 'polygon-overlap'
import pointInsidePolygon from 'point-in-polygon'
import area from 'area-polygon'
import _ from 'lodash'
import uuidv4 from 'uuid/v4'
import { distanceToPolygon, distanceBetweenPoints } from 'distance-to-polygon'

// This function takes a two dimensional array (e.g foo[][]) and returns an array of polygons
// representing discovered peaks. e.g:
// [[2, 1], [2, 2], [1, 2]]

export default class PersistentHomology {

    constructor (options) {
        this.options = _.merge({
            edgeDistance: 10,
            minPeakHeight: 15,
            maxIterations: 10,
            densityMap: null
        }, options)

        console.log(this.options, options)

        if (!this.options.densityMap) {
            throw 'Error initializing PersistantHomology: options.densityMap is required'
        }

        this.homologyPeaks = []
        this.truePeaks = []
    }

    async findPeaks (densityMap) {
        return new Promise((resolve, reject) => {
            let currentHeight = this.options.densityMap.getMaxDensity()

            const intervalToken = setInterval(() => {
                if (currentHeight > 0.2) {
                    this.performHomologyIteration(currentHeight)
                    currentHeight = currentHeight - 0.01
                } else {
                    clearInterval(intervalToken)
                    if (this.truePeaks.length > 5) {
                        console.log("Error in PersistantHomology.findPeaks: too many peaks were found (", this.truePeaks.length + ")")
                    } else {
                        resolve(this.truePeaks)
                    }
                }
            }, 1)
        })
    }

    performHomologyIteration (height)  {
        // console.log('performing homology iteration ', height)
        for (let y = 0; y < this.options.densityMap.getDensityMap().length; y++) {
            const column = this.options.densityMap.getDensityMap()[y]
            if (!column || column.length === 0) { continue }

            for (let x = 0; x < column.length; x++) {
                const density = column[x]

                if (density >= height && density < height + 0.01) {
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
                // Silently merge if the polygons are below a certain size
                if (polygonsIntersect(this.homologyPeaks[i].polygon, this.homologyPeaks[j].polygon)) {
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
                            bonusIterations: this.homologyPeaks[i].bonusIterations
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
                        // console.log('Adding peak', this.homologyPeaks[i], 'as true peak')
                        this.homologyPeaks[i].truePeak = true
                    }
                }
            }
            if (!intersected) {
                this.homologyPeaks[i].height++
            }

            if (!_.find(this.truePeaks, p => p.id === this.homologyPeaks[i].id)) {
                // If a peak has reached it's bonus iterations count, clone it into true peaks
                if (this.homologyPeaks[i].bonusIterations > this.options.maxIterations) {
                    // console.log('peak ', this.homologyPeaks[i], 'has exceeded its bonus iterations count')
                    this.truePeaks.push(_.cloneDeep(this.homologyPeaks[i]))
                } else if (this.homologyPeaks[i].truePeak) {
                    this.homologyPeaks[i].bonusIterations++
                }
            }
        }
    }
}