// -------------------------------------------------------------------------
// Calculates density estimates over 2d data.
// -------------------------------------------------------------------------

import { distanceBetweenPoints } from 'distance-to-polygon'

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

    calculateDensity () {
        // Create a sorted point cache that's accessible by [row][column] for faster density estimation
        this.pointCache = []
        this.densityMap = []

        for (let i = 0; i < this.data.length; i++) {
            const point = this.data[i]

            const xVal = Math.floor(point[0])
            const yVal = Math.floor(point[1])

            if (!this.pointCache[yVal]) {
                this.pointCache[yVal] = []
                this.densityMap[yVal] = []
            }
            if (!this.pointCache[yVal][xVal]) {
                this.pointCache[yVal][xVal] = []
                this.densityMap[yVal][xVal] = 0
            }

            this.pointCache[yVal][xVal].push({
                x: point[0],
                y: point[1]
            })
        }

        this.maxDensity = 0
        for (let y = 0; y < this.pointCache.length; y++) {
            const column = this.pointCache[y]
            if (!column || column.length === 0) { continue }

            for (let x = 0; x < column.length; x++) {
                const row = column[x]
                if (!row || row.length === 0) { continue }

                let density = 0
                let densityWidth = 1

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
    }

    getDensityMap () {
        return this.densityMap
    }

    getMaxDensity () {
        return this.maxDensity
    }
}