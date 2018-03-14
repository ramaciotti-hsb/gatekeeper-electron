// -------------------------------------------------------------------------
// Calculates density estimates over 2d data.
// -------------------------------------------------------------------------

import { distanceBetweenPoints } from 'distance-to-polygon'
import constants from './constants'
import * as d3 from 'd3'

// Data should be an array of 2d points, in [x, y] format i.e. [[1, 1], [2, 2]]
export default function (points, densityWidth = 2) {
    // Create a sorted point cache that's accessible by [row][column] for faster density estimation
    const pointCache = []
    let maxDensity = 0
    
    for (let i = 0; i < points.length; i++) {
        const point = points[i]

        const xVal = Math.round(point[0])
        const yVal = Math.round(point[1])

        if (!pointCache[yVal]) {
            pointCache[yVal] = []
        }
        if (!pointCache[yVal][xVal]) {
            pointCache[yVal][xVal] = 1
        }

        // Increment the density of neighbouring points
        for (let y = yVal - densityWidth; y < yVal + densityWidth; y++) {
            const columnDens = pointCache[y]
            if (!columnDens) {
                pointCache[y] = []
            }

            for (let x = xVal - densityWidth; x < xVal + densityWidth; x++) {
                const rowDens = pointCache[y][x]
                if (!rowDens) {
                    pointCache[y][x] = ((1 - Math.abs(xVal - x) / densityWidth) + (1 - Math.abs(yVal - y) / densityWidth)) * 10
                    // console.log(pointCache[y][x])
                } else {
                    pointCache[y][x] += ((1 - Math.abs(xVal - x) / densityWidth) + (1 - Math.abs(yVal - y) / densityWidth)) * 10
                    if (pointCache[y][x] > maxDensity) {
                        maxDensity = pointCache[y][x]
                    }
                }
            }
        }
    }

    const scale = d3.scaleLog().range([0, 1]).domain([10, maxDensity])

    for (let y = 0; y < pointCache.length; y++) {
        if (!pointCache[y]) { continue }
        for (let x = 0; x < pointCache[y].length; x++) {
            if (!pointCache[y][x]) { continue }
            pointCache[y][x] = scale(pointCache[y][x])
        }
    }

    return {
        densityMap: pointCache,
        maxDensity
    }
}