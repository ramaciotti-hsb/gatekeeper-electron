// -------------------------------------------------------------
// Javascript utility functions
// -------------------------------------------------------------

const heatMapColorforValue = function (value) {
    var h = (1.0 - value) * 240
    return "hsl(" + h + ", 100%, 50%)";
}

export { heatMapColorforValue }