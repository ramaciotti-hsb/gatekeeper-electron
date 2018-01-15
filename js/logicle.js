import {ticks} from "d3-array";
import {format} from "d3-format";
import constant from "../node_modules/d3-scale/src/constant";
import nice from "../node_modules/d3-scale/src/nice";
import {default as continuous, copy} from "../node_modules/d3-scale/src/continuous";
import Logicle from './logicle-scale.js'

var logicle = new Logicle(262000, 0.4, 4.5, 0.7);

function deinterpolate(a, b) {
  return function (x) { return logicle.scale(x) }
}

function reinterpolate(a, b) {
  return function(x) { logicle.inverse(x); }
}

function reflect(f) {
  return function(x) {
    return -f(-x);
  };
}

export default function log() {

  var scale = continuous(deinterpolate, reinterpolate).domain([-120, 262000]),
      domain = scale.domain

  scale.domain = function(_) {
    return arguments.length ? domain(_) : domain();
  };

  scale.ticks = function(count) {
    return logicle.axisLabels()
  };

  scale.tickFormat = function(count, specifier) {
    return ".0e"
    // if (specifier == null) specifier = base === 10 ? ".0e" : ",";
    // if (typeof specifier !== "function") specifier = format(specifier);
    // if (count === Infinity) return specifier;
    // if (count == null) count = 10;
    // var k = Math.max(1, base * count / scale.ticks().length); // TODO fast estimate?
    // return function(d) {
    //   var i = d / pows(Math.round(logs(d)));
    //   if (i * base < base - 0.5) i *= base;
    //   return i <= k ? specifier(d) : "";
    // };
  };

  scale.nice = function() {
    console.log("test")
    return domain(nice(domain(), {
      floor: function(x) { return pows(Math.floor(logs(x))); },
      ceil: function(x) { return pows(Math.ceil(logs(x))); }
    }));
  };

  scale.copy = function() {
    console.log('test')
    return copy(scale, log());
  };

  return scale;
}