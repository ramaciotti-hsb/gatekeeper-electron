// -------------------------------------------------------------------------
// Calculates density estimates over 2d data.
// -------------------------------------------------------------------------

import { distanceBetweenPoints } from 'distance-to-polygon'
import * as d3 from 'd3'

// Data should be an array of 2d points, in [x, y] format i.e. [[1, 1], [2, 2]]
export default class twoDimensionalDensity {

    constructor (data, options = { densityWidth: null }) {
        this.data = data
        this.options = options
        // If the user didn't specify density width, calculate it automatically

        if (this.options.densityWidth === null || typeof this.options.densityWidth === 'undefined') {
            this.options.autoDensity = true
            this.options.densityWidth = 0.1
        }
    }

    calculateDensity (densityWidth = 2) {
        // Create a sorted point cache that's accessible by [row][column] for faster density estimation
        this.pointCache = []
        this.densityMap = []

        for (let i = 0; i < this.data.length; i++) {
            const point = this.data[i]

            const xVal = Math.round(point[0])
            const yVal = Math.round(point[1])

            if (!this.pointCache[yVal]) {
                this.pointCache[yVal] = []
            }
            if (!this.pointCache[yVal][xVal]) {
                this.pointCache[yVal][xVal] = []
            }

            this.pointCache[yVal][xVal].push({
                x: point[0],
                y: point[1]
            })
        }


        this.maxDensity = 0
        for (let y = 0; y < Math.ceil(this.options.shape[1]) + 1; y++) {
            for (let x = 0; x < Math.ceil(this.options.shape[0]) + 1; x++) {
                let density = 0
                if (!this.densityMap[y]) {
                    this.densityMap[y] = []
                }
                if (!this.densityMap[y][x]) {
                    this.densityMap[y][x] = 0
                }

                // Calculate the density of neighbouring points
                for (let i = y - densityWidth; i < y + densityWidth; i++) {
                    const columnDens = this.pointCache[i]
                    if (!columnDens) { continue }

                    for (let j = x - densityWidth; j < x + densityWidth; j++) {
                        const rowDens = this.pointCache[i][j]
                        if (!rowDens) { continue }

                        density += rowDens.length
                    }
                }

                this.densityMap[y][x] = density

                this.maxDensity = density > this.maxDensity ? density : this.maxDensity
            }
        }

        // Log scale will break for values <= 0
        const xScale = d3.scaleLog()
            .range([0, 1])
            .base(Math.E)
            .domain([Math.exp(0), Math.exp(Math.log(this.maxDensity))])

        window.xScale = xScale

        this.maxDensity = 0
        for (let i = 0; i < this.densityMap.length; i++) {
            if (!this.densityMap[i]) {
                continue
            }
            for (let j = 0; j < this.densityMap[i].length; j++) {
                this.densityMap[i][j] = this.densityMap[i][j] === 0 ? 0 : xScale(this.densityMap[i][j])
                this.maxDensity = this.densityMap[i][j] > this.maxDensity ? this.densityMap[i][j] : this.maxDensity
            }
        }
    }

    getDensityMap () {
        return this.densityMap
    }

    getMaxDensity () {
        return this.maxDensity
    }
}