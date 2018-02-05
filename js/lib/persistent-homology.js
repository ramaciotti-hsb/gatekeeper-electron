// -------------------------------------------------------------------------
// Uses the Persistent Homology technique to discover peaks / populations in
// 2d data. Each iteration is calculated on a different iteration of the
// event loop to prevent blocking for large datasets.
// -------------------------------------------------------------------------

import GrahamScan from './graham-scan.js'
import polygonsIntersect from 'polygon-overlap'
import pointInsidePolygon from 'point-in-polygon'
import { distanceToPolygon, distanceBetweenPoints } from 'distance-to-polygon'
import area from 'area-polygon'

// This function takes a two dimensional array (e.g foo[][]) and returns an array of polygons
// representing discovered peaks. e.g:
// [[2, 1], [2, 2], [1, 2]]
export default function (densityMap) {
    return new Promise((resolve, reject) => {
        const truePeaks = []
        const homologyPeaks = []

        const performHomologyIteration = (height) => {
            for (let y = 0; y < densityMap.getDensityMap().length; y++) {
                const column = densityMap.getDensityMap()[y]
                if (!column || column.length === 0) { continue }

                for (let x = 0; x < column.length; x++) {
                    const density = column[x]

                    if (density >= height) {
                        let foundPeak = false
                        for (var i = 0; i < homologyPeaks.length; i++) {
                            const peak = homologyPeaks[i]
                            // If the new point is outside the peak polygon
                            if (!pointInsidePolygon([x, y], peak.polygon)) {
                                // If the new point is close enough to the edge, expand the polygon to accomodate it
                                const distance = peak.polygon.length === 1 ? distanceBetweenPoints([x, y], peak.polygon[0]) : distanceToPolygon([x, y], peak.polygon)
                                if (distance < 30 && distance > 0) {
                                    peak.pointsToAdd.push([x, y])
                                    foundPeak = true
                                    break
                                } else if (distance === 0) {
                                    foundPeak = true
                                    break
                                }
                            } else {
                                foundPeak = true
                                break
                            }
                        }

                        if (!foundPeak || homologyPeaks.length === 0) {
                            homologyPeaks.push({
                                polygon: [[x, y]],
                                height: 0,
                                pointsToAdd: []
                            })
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
                    // Only add to the polygon if it wouldn't expand the entire thing by more than 20%
                    peak.polygon = newPolygon
                    peak.pointsToAdd = []
                }
            }

            // Merge overlapping polygons
            for (let i = 0; i < homologyPeaks.length; i++) {
                let intersected = false
                for (let j = i + 1; j < homologyPeaks.length; j++) {
                    if (polygonsIntersect(homologyPeaks[i].polygon, homologyPeaks[j].polygon)) {
                        console.log('polygon height of', homologyPeaks[i], ' before merging:', homologyPeaks[i].height)
                        console.log('polygon height of', homologyPeaks[j], ' before merging:', homologyPeaks[j].height)
                        if (homologyPeaks[i].height >= 3) {
                            truePeaks.push(homologyPeaks[i])
                        }
                        if (homologyPeaks[j].height >= 3) {
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
                if (!intersected) {
                    homologyPeaks[i].height++
                }
            }

            if (height > 0) {
                setTimeout(performHomologyIteration.bind(null, height - 1), 0)
            } else {
                // Finally, remote any polygons that are completely inside other polygons
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

                resolve(truePeaks)
            }
        }

        performHomologyIteration(densityMap.getMaxDensity())
    })
}