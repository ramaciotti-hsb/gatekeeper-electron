// -------------------------------------------------------------
// Javascript utility functions
// -------------------------------------------------------------

import hslToRGB from 'hsl-to-rgb-for-reals'
import * as d3 from "d3"
import logicleScale from '../scales/logicle.js'
import arcsinScale from '../scales/arcsinh-scale'
import constants from './constants'

// Calculate 1d density using kernel density estimation for drawing histograms
const kernelDensityEstimator = function (kernel, X) {
  return function(V) {
    return X.map(function(x) {
      return [x, d3.mean(V, function(v) { return kernel(x - v); })];
    });
  };
}

const kernelEpanechnikov = function (k) {
  return function(v) {
    return Math.abs(v /= k) <= 1 ? 0.75 * (1 - v * v) / k : 0;
  };
}

const heatMapHSLStringForValue = function (value) {
    var h = (1.0 - value) * 240
    return "hsl(" + h + ", 100%, 50%)";
}

const getPolygonCenter = function(polygon) {
    var x = polygon.map(function(a){ return a[0] });
    var y = polygon.map(function(a){ return a[1] });
    var minX = Math.min.apply(null, x);
    var maxX = Math.max.apply(null, x);
    var minY = Math.min.apply(null, y);
    var maxY = Math.max.apply(null, y);
    return [(minX + maxX)/2, (minY + maxY)/2];
}

const heatMapRGBForValue = function (value) {
    const h = (1.0 - value) * 240
    const s = 1
    const l = 0.5
    let r, g, b;

    if (s == 0){
        r = g = b = l; // achromatic
    } else {
        const hue2rgb = function hue2rgb(p, q, t){
            if(t < 0) t += 1;
            if(t > 1) t -= 1;
            if(t < 1/6) return p + (q - p) * 6 * t;
            if(t < 1/2) return q;
            if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        }

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }

    return hslToRGB(h, s, l)
}

const getPlotImageKey = function (sample) {
    return `${sample.selectedXParameterIndex}_${sample.selectedXScale}-${sample.selectedYParameterIndex}_${sample.selectedYScale}`
}


// options shape:
// {
//     selectedXScale,
//     selectedYScale,
//     xRange,
//     yRange,
//     width,
//     height
// }
const getScales = (options) => {
    const scales = {}
    // console.log(options)
    if (options.selectedXScale === constants.SCALE_LINEAR) {
        scales.xScale = d3.scaleLinear().range([0, options.width]) // value -> display
        // don't want dots overlapping axis, so add in buffer to data domain
        scales.xScale.domain([options.xRange[0], options.xRange[1]]);
    // Log Scale
    } else if (options.selectedXScale === constants.SCALE_LOG) {
        // Log scale will break for values <= 0
        scales.xScale = d3.scaleLog()
            .range([0, options.width])
            .base(Math.E)
            .domain([0.01, options.xRange[1]])
    // Biexponential Scale
    } else if (options.selectedXScale === constants.SCALE_BIEXP) {
        scales.xScale = logicleScale().range([0, options.width])
    // Arcsin scale
    } else if (options.selectedXScale === constants.SCALE_ARCSIN) {
        scales.xScale = arcsinScale().range([0, options.width])
    }

    // setup y
    if (options.selectedYScale === constants.SCALE_LINEAR) {
        scales.yScale = d3.scaleLinear().range([options.height, 0]) // value -> display
        scales.yScale.domain([options.yRange[0], options.yRange[1]]);
    // Log Scale
    } else if (options.selectedYScale === constants.SCALE_LOG) {
        scales.yScale = d3.scaleLog()
            .range([options.height, 0])
            .base(Math.E)
            .domain([0.01, options.yRange[1]])
    // Biexponential Scale
    } else if (options.selectedYScale === constants.SCALE_BIEXP) {
        scales.yScale = logicleScale().range([options.height, 0])
    // Arcsin scale
    } else if (options.selectedYScale === constants.SCALE_ARCSIN) {
        scales.yScale = arcsinScale().range([options.height, 0])
    }

    // window.scales = scales

    return scales
}

export { heatMapHSLStringForValue, heatMapRGBForValue, getPlotImageKey, getScales, getPolygonCenter, kernelDensityEstimator, kernelEpanechnikov }