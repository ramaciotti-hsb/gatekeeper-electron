// -------------------------------------------------------------
// Javascript utility functions
// -------------------------------------------------------------

import hslToRGB from 'hsl-to-rgb-for-reals'
import * as d3 from "d3"
import logicleScale from '../scales/logicle.js'
import arcsinScale from '../scales/arcsinh-scale'
import constants from './constants'

const heatMapHSLStringForValue = function (value) {
    var h = (1.0 - value) * 240
    return "hsl(" + h + ", 100%, 50%)";
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

const getScalesForSample = (sample, graphWidth, graphHeight) => {
    const scales = {}
    const statisticsX = sample.FCSParameters[sample.selectedXParameterIndex].statistics
    const statisticsY = sample.FCSParameters[sample.selectedYParameterIndex].statistics
    if (sample.selectedXScale === constants.SCALE_LINEAR) {
        scales.xScale = d3.scaleLinear().range([0, graphWidth]) // value -> display
        // don't want dots overlapping axis, so add in buffer to data domain
        scales.xScale.domain([statisticsX.min, statisticsX.max]);
    // Log Scale
    } else if (sample.selectedXScale === constants.SCALE_LOG) {
        // Log scale will break for values <= 0
        scales.xScale = d3.scaleLog()
            .range([0, graphWidth])
            .base(Math.E)
            .domain([Math.exp(Math.log(Math.max(0.1, 0))), Math.exp(Math.log(statisticsX.max))])
    // Biexponential Scale
    } else if (sample.selectedXScale === constants.SCALE_BIEXP) {
        scales.xScale = logicleScale().range([0, graphWidth])
    // Arcsin scale
    } else if (sample.selectedXScale === constants.SCALE_ARCSIN) {
        scales.xScale = arcsinScale().range([0, graphWidth])
    }

    // setup y
    if (sample.selectedYScale === constants.SCALE_LINEAR) {
        scales.yScale = d3.scaleLinear().range([graphHeight, 0]) // value -> display
        scales.yScale.domain([statisticsY.min, statisticsY.max]);
    // Log Scale
    } else if (sample.selectedYScale === constants.SCALE_LOG) {
        // yValue = (d) => { return Math.max(0.1, d[sample.selectedYParameterIndex]) } // data -> value
        scales.yScale = d3.scaleLog()
            .range([graphHeight, 0])
            .base(Math.E)
            .domain([Math.exp(Math.log(Math.max(0.1, 0))), Math.exp(Math.log(statisticsY.max))])
    // Biexponential Scale
    } else if (sample.selectedYScale === constants.SCALE_BIEXP) {
        scales.yScale = logicleScale().range([graphHeight, 0])
    // Arcsin scale
    } else if (sample.selectedXScale === constants.SCALE_ARCSIN) {
        scales.yScale = arcsinScale().range([graphHeight, 0])
    }

    return scales
}

export { heatMapHSLStringForValue, heatMapRGBForValue, getPlotImageKey, getScalesForSample }