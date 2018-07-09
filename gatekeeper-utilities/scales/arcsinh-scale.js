import {ticks} from "d3-array";
import {format} from "d3-format";
import constant from "../node_modules/d3-scale/src/constant";
import nice from "../node_modules/d3-scale/src/nice";
import {default as continuous, copy} from "../node_modules/d3-scale/src/continuous";

function deinterpolate(a, b) {
  return function (x) { return Math.asinh(x) / Math.asinh(Math.max(a, b)) }
}

function reinterpolate(a, b) {
  return function(x) { return a > b ? Math.sinh(11000 - x) : Math.sinh(x) }
}

function reflect(f) {
  return function(x) {
    return -f(-x);
  };
}

export default function log() {

  var scale = continuous(deinterpolate, reinterpolate).domain([-120, 11000]),
      domain = scale.domain

  scale.domain = function(_) {
    return arguments.length ? domain(_) : domain();
  };

  scale.ticks = function(count) {
    return [-5.0, 0, 10.0, 100.0, 1000.0, 10000.0]
  };

  scale.tickFormat = function(count, specifier) {
    return ".0e"
  };

  scale.nice = function() {
    return domain(nice(domain(), {
      floor: function(x) { return pows(Math.floor(logs(x))); },
      ceil: function(x) { return pows(Math.ceil(logs(x))); }
    }));
  };

  scale.copy = function() {
    return copy(scale, log());
  };

  return scale;
}