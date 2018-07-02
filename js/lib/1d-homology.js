// -------------------------------------------------------------------------
// Finds and returns peaks in one dimensional data. Returns an array containing
// boundaries for each peak represented as [ [lowerBoundary, peak, upperBoundary] ]
// -------------------------------------------------------------------------    

import _ from 'lodash'

export default (data, maxDensity, userOptions) => {
    const defaultOptions = {
        min1DPeakWidth: userOptions.plotWidth * 0.1,
        inflectionWidth: 20,
        min1DPeakHeight: 0.003,
        knownPeaks: []
    }

    const options = _.merge(defaultOptions, userOptions)

    let peaks = options.knownPeaks
    console.log(options.knownPeaks)
    // Find peaks in the 1d data where one of the channels is zero
    for (let i = 0; i < data.length; i++) {
        let isPeak = true
        for (let j = Math.max(i - options.min1DPeakWidth, 0); j < Math.min(i + options.min1DPeakWidth, data.length); j++) {
            if (i === j) { continue }

            if (data[j] >= data[i]) {
                isPeak = false
                continue
            }
        }

        if (data[i] / maxDensity < options.min1DPeakHeight) {
            // console.log('ignoring peak that is too small')
            isPeak = false
        }

        if (isPeak && peaks.length < 10) {
            peaks.push(i)
        }
    }
    
    let cutoffs = []
    // Capture the peaks by iterating outwards until an inflection point or minimum value is found
    for (let i = 0; i < peaks.length; i++) {
        cutoffs[i] = []
        const peak = peaks[i]
        let lowerCutoffFound = false
        let upperCutoffFound = false
        let index = peak - 1
        while (!lowerCutoffFound) {
            if (index === -1) {
                lowerCutoffFound = true
                cutoffs[i][0] = 0
            // If the mean of the next inflectionWidth points is greater than the current point, the slope is increasing again (approaching another peak)
            } else if (data[index] < data.slice(index - options.inflectionWidth - 1, index - 1).reduce((acc, curr) => { return acc + curr }, 0) / options.inflectionWidth || data[index] / maxDensity < options.min1DPeakHeight) {
                lowerCutoffFound = true
                cutoffs[i][0] = index
            }

            index--
        }

        index = peak + 1
        while (!upperCutoffFound) {
            if (index === data.length) {
                upperCutoffFound = true
                cutoffs[i][1] = index - 1
            // If the mean of the next options.inflectionWidth points is greater than the current point, the slope is increasing again (approaching another peak)
            } else if (data[index] < data.slice(index + 1, index + options.inflectionWidth + 1).reduce((acc, curr) => { return acc + curr }, 0) / options.inflectionWidth || data[index] / maxDensity < options.min1DPeakHeight) {
                upperCutoffFound = true
                cutoffs[i][1] = index
            }

            index++
        }
    }

    // console.log(peaks.map((p, index) => { return [cutoffs[index][0], p, cutoffs[index][1]] }))

    return peaks.map((p, index) => { return [cutoffs[index][0], p, cutoffs[index][1]] })
}