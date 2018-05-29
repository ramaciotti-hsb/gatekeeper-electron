// -------------------------------------------------------------------------
// Utilities for manipulating polygons on a geometric level
// -------------------------------------------------------------------------

import { distanceToPolygon, distanceBetweenPoints } from 'distance-to-polygon'
import polygonsIntersect from 'polygon-overlap'
import pointInsidePolygon from 'point-in-polygon'
import { getPolygonCenter } from './utilities'
import GrahamScan from './graham-scan.js'
import _ from 'lodash'

const getMidPoint = function (x1, y1, x2, y2, per) {
    return [x1 + (x2 - x1) * per, y1 + (y2 - y1) * per];
}

// Breaks up any long straight lines in peak polygons into smaller lines connected by points
export const breakLongLinesIntoPoints = (polygon) => {
    let newPolygon = polygon.slice(0)

    for (let p = 0; p < newPolygon.length - 1; p++) {
        const pointOne = newPolygon[p]
        const pointTwo = newPolygon[p + 1]
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
            newPolygon = newPolygon.slice(0, p + 1).concat(pointsToAdd).concat(newPolygon.slice(p + 1))
        }
    }

    return newPolygon
}

// Fix overlapping peak polygons using the zipper method
export const fixOverlappingPolygonsUsingZipper = (polygons) => {
    const newPolygons = polygons.slice(0)

    for (let i = 0; i < newPolygons.length; i++) {
        for (let j = 0; j < newPolygons.length; j++) {
            if (i === j) {
                continue
            }

            const polygonOne = newPolygons[i].slice(0)
            const polygonTwo = newPolygons[j].slice(0)

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

            newPolygons[i] = polygonOne
            newPolygons[j] = polygonTwo
        }
    }

    return newPolygons.map((polygon) => {
        // Recalculate the polygon boundary
        const grahamScan = new GrahamScan();
        polygon.map(p => grahamScan.addPoint(p[0], p[1]))
        return grahamScan.getHull().map(p => [p.x, p.y])
    })

    return newPolygons
}