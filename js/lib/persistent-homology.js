// -------------------------------------------------------------------------
// Uses the Persistent Homology technique to discover peaks / populations in
// 2d data. Each iteration is calculated on a different iteration of the
// event loop to prevent blocking for large datasets.
// -------------------------------------------------------------------------

import GrahamScan from './graham-scan.js'
import polygonsIntersect from 'polygon-overlap'
import pointInsidePolygon from 'point-in-polygon'
import area from 'area-polygon'
import { distanceToPolygon, distanceBetweenPoints } from 'distance-to-polygon'

// This function takes a two dimensional array (e.g foo[][]) and returns an array of polygons
// representing discovered peaks. e.g:
// [[2, 1], [2, 2], [1, 2]]
export default function (densityMap) {
    return new Promise((resolve, reject) => {
        let truePeaks = []
        let homologyPeaks = []
        let iterations = 0
        let initialHeight = densityMap.getMaxDensity()

        const performHomologyIteration = (height, edgeDistance = 15, minPeakHeight = 4) => {
            console.log('Homology iteration: ', height)
            for (let y = 0; y < densityMap.getDensityMap().length; y++) {
                const column = densityMap.getDensityMap()[y]
                if (!column || column.length === 0) { continue }

                for (let x = 0; x < column.length; x++) {
                    const density = column[x]

                    if (density >= height) {
                        let foundPeak = false

                        for (var i = 0; i < homologyPeaks.length; i++) {
                            foundPeak = pointInsidePolygon([x, y], homologyPeaks[i].polygon)
                            if (foundPeak) {
                                break
                            }
                        }

                        if (!foundPeak || homologyPeaks.length === 0) {
                            for (var i = 0; i < homologyPeaks.length; i++) {
                                const peak = homologyPeaks[i]
                                // If the new point is close enough to the edge, expand the polygon to accomodate it
                                const distance = peak.polygon.length === 1 ? distanceBetweenPoints([x, y], peak.polygon[0]) : distanceToPolygon([x, y], peak.polygon)
                                if (distance < edgeDistance && distance > 0) {
                                    peak.pointsToAdd.push([x, y])
                                    foundPeak = true
                                    break
                                } else if (distance === 0) {
                                    peak.pointsToAdd.push([x, y])
                                    foundPeak = true
                                    break
                                }
                            }

                            if (!foundPeak) {
                                homologyPeaks.push({
                                    polygon: [[x, y]],
                                    height: 0,
                                    pointsToAdd: []
                                })
                            }
                        }
                    }
                }
            }

            // Add new points and recalculate polygons
            for (let peak of homologyPeaks) {
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
            for (let i = 0; i < homologyPeaks.length; i++) {
                let intersected = false
                for (let j = i + 1; j < homologyPeaks.length; j++) {
                    // Don't merge if the polygons are over a certain size
                    if (polygonsIntersect(homologyPeaks[i].polygon, homologyPeaks[j].polygon)) {
                        if ((homologyPeaks[i].polygon.length === 1 || area(homologyPeaks[i].polygon.map((p) => { return { x: p[0], y: p[1] } })) > 100)
                            && (homologyPeaks[j].polygon.length === 1 || area(homologyPeaks[j].polygon.map((p) => { return { x: p[0], y: p[1] } })) > 100)) {
                            console.log('polygon height of', homologyPeaks[i], ' before merging:', homologyPeaks[i].height)
                            console.log('polygon height of', homologyPeaks[j], ' before merging:', homologyPeaks[j].height)
                            if (homologyPeaks[i].height >= minPeakHeight) {
                                truePeaks.push(homologyPeaks[i])
                            }
                            if (homologyPeaks[j].height >= minPeakHeight) {
                                truePeaks.push(homologyPeaks[j])
                            }
                            const newPolygon = homologyPeaks[i].polygon.concat(homologyPeaks[j].polygon)
                            homologyPeaks.splice(i, 1, { polygon: newPolygon, height: 0 })
                            homologyPeaks.splice(j, 1)
                            j--
                            // Rebuild polygons after combining
                            const grahamScan = new GrahamScan();
                            homologyPeaks[i].polygon.map(p => grahamScan.addPoint(p[0], p[1]))
                            homologyPeaks[i].polygon = grahamScan.getHull().map(p => [p.x, p.y])
                            homologyPeaks[i].pointsToAdd = []
                            intersected = true
                        }
                    }
                }
                if (!intersected) {
                    homologyPeaks[i].height++
                }
            }

            if (height > 1) {
                setTimeout(performHomologyIteration.bind(null, height - 1), 0)
            } else {
                // Finally, remove any polygons that are completely inside other polygons
                for (let i = 0; i < truePeaks.length; i++) {
                    for (let j = i + 1; j < truePeaks.length; j++) {
                        let inside = true
                        for (let point of truePeaks[j].polygon) {
                            if (!pointInsidePolygon(point, truePeaks[i].polygon)) {
                                inside = false
                            }
                        }
                        
                        if (inside) {
                            truePeaks.splice(j, 1)
                            j--
                        }

                        inside = true
                        for (let point of truePeaks[i].polygon) {
                            if (!pointInsidePolygon(point, truePeaks[j].polygon)) {
                                inside = false
                            }
                        }
                        
                        if (inside) {
                            truePeaks.splice(i, 1)
                            i--
                            break
                        }
                    }   
                }

                // If there's only one peak or a peak is too large, try recalculating with different settings
                let shouldRecalculate = truePeaks.length === 1

                for (let i = 0; i < truePeaks.length; i++) {
                    if (area(truePeaks[i].polygon) > 40000) {
                        shouldRecalculate = true
                    }
                }

                if (shouldRecalculate && iterations < 1) {
                    // truePeaks = []
                    // homologyPeaks = []
                    // iterations++
                    // performHomologyIteration(initialHeight, edgeDistance + 10, minPeakHeight)
                    resolve(truePeaks)
                } else {
                    resolve(truePeaks)                    
                }
            }
        }


        performHomologyIteration(initialHeight)
    })
}