import { ulp } from 'ulp'
/**
 * Translated to Javascript by Nic Barker.
 * Based on the Java implementation by Wayne A. Moore:
 *
 * Implements the Logicle data {@link Logicle#scale(double) scale} and its
 * {@link Logicle#inverse(double) inverse}. This is a reference implementation,
 * accurate to <code>double</code> precision. It is reasonably fast but not
 * suitable for real time applications. See
 * {@link edu.stanford.facs.logicle.FastLogicle} for a fast lower precision
 * version.
 * 
 * @author Wayne A. Moore
 * @version 1.0
 */

const LN_10 = Math.log(10)

export default class Logicle {

  /**
   * Real constructor that does all the work. Called only from implementing
   * classes.
   * 
   * @param T
   *          maximum data value or "top of scale"
   * @param W
   *          number of decades to linearize
   * @param M
   *          number of decades that a pure log scale would cover
   * @param A
   *          additional number of negative decades to include on scale
   * @param bins
   *          number of bins in the lookup table
   */
  constructor (T, W, M = 4.5, A = 0, bins = 0) {
    // Scale value below which Taylor series is used
    this.xTaylor = 0
    this.taylor = []
    this.a = 0
    this.b = 0
    this.c = 0
    this.d = 0
    this.f = 0
    this.w = 0
    this.x0 = 0
    this.x1 = 0
    this.x2 = 0

    if (T <= 0) {
      throw new Error("T is not positive")
    }
    if (W < 0) {
      throw new Error("W is negative")
    }
    if (M <= 0) {
      throw new Error("M is not positive")
    }
    if (2 * W > M) {
      throw new Error("W is too large")
    }
    if (-A > W || A + W > M - W) {
      throw new Error("A is too large")
    }

    // if we're going to bin the data make sure that
    // zero is on a bin boundary by adjusting A
    if (bins > 0) {
      let zero = (W + A) / (M + A)
      zero = Math.round(zero * bins) / bins
      A = (M * zero - W) / (1 - zero)
    }

    // standard parameters
    this.T = T
    this.M = M
    this.W = W
    this.A = A

    // actual parameters
    // formulas from biexponential paper
    this.w = W / (M + A)
    this.x2 = A / (M + A)
    this.x1 = this.x2 + this.w
    this.x0 = this.x2 + 2 * this.w
    this.b = (M + A) * LN_10
    this.d = this.solve(this.b, this.w)
    let c_a = Math.exp(this.x0 * (this.b + this.d))
    let mf_a = Math.exp(this.b * this.x1) - c_a / Math.exp(this.d * this.x1)
    this.a = T / ((Math.exp(this.b) - mf_a) - c_a / Math.exp(this.d))
    this.c = c_a * this.a
    this.f = -mf_a * this.a

    // use Taylor series near x1, i.e., data zero to
    // avoid round off problems of formal definition
    this.xTaylor = this.x1 + this.w / 4
    // compute coefficients of the Taylor series
    let posCoef = this.a * Math.exp(this.b * this.x1)
    let negCoef = -this.c / Math.exp(this.d * this.x1)
    // 16 is enough for full precision of typical scales
    this.taylor = new Array(16)
    for (let i = 0; i < this.taylor.length; ++i) {
      posCoef *= this.b / (i + 1)
      negCoef *= -this.d / (i + 1)
      this.taylor[i] = posCoef + negCoef
    }
    this.taylor[1] = 0 // exact result of Logicle condition
  }

  /**
   * Solve f(dw,b) = 2 * (ln(d) - ln(b)) + w * (d + b) = 0 for d, given b and w
   * 
   * @param b
   * @param w
   * @return double root d
   */
  solve (b, w) {
    // w == 0 means its really arcsinh
    if (w == 0) {
      return b
    }

    // precision is the same as that of b
    const tolerance = 2 * ulp(b)

    // based on RTSAFE from Numerical Recipes 1st Edition
    // bracket the root
    let d_lo = 0
    let d_hi = b

    // bisection first step
    let d = (d_lo + d_hi) / 2
    let last_delta = d_hi - d_lo
    let delta = 0

    // evaluate the f(dw,b) = 2 * (ln(d) - ln(b)) + w * (b + d)
    // and its derivative
    const f_b = -2 * Math.log(b) + w * b
    let f = 2 * Math.log(d) + w * d + f_b
    let last_f = NaN

    for (let i = 1; i < 20; ++i) {
      // compute the derivative
      const df = 2 / d + w

      // if Newton's method would step outside the bracket
      // or if it isn't converging quickly enough
      if (((d - d_hi) * df - f) * ((d - d_lo) * df - f) >= 0 || Math.abs(1.9 * f) > Math.abs(last_delta * df)) {
        // take a bisection step
        delta = (d_hi - d_lo) / 2
        d = d_lo + delta
        if (d == d_lo)
          return d // nothing changed, we're done
      } else {
        // otherwise take a Newton's method step
        delta = f / df
        const t = d
        d -= delta
        if (d == t)
          return d // nothing changed, we're done
      }
      // if we've reached the desired precision we're done
      if (Math.abs(delta) < tolerance) {
        return d
      }
      last_delta = delta

      // recompute the function
      f = 2 * Math.log(d) + w * d + f_b
      if (f == 0 || f == last_f) {
        return d // found the root or are not going to get any closer
      }
      last_f = f

      // update the bracketing interval
      if (f < 0) {
        d_lo = d
      }
      else {
        d_hi = d
      }
    }

    throw new Error("exceeded maximum iterations in solve()")
  }

  /**
   * Computes the slope of the biexponential function at a scale value.
   * 
   * @param scale
   * @return The slope of the biexponential at the scale point
   */
  slope (scale) {
    // reflect negative scale regions
    if (scale < this.x1) {
      scale = 2 * this.x1 - scale
    }

    // compute the slope of the biexponential
    return this.a * this.b * Math.exp(this.b * scale) + this.c * this.d / Math.exp(this.d * scale)
  }

  /**
   * Computes the value of Taylor series at a point on the scale
   * 
   * @param scale
   * @return value of the biexponential function
   */
  seriesBiexponential (scale) {
    // Taylor series is around this.x1
    const x = scale - this.x1
    // note that this.taylor[1] should be identically zero according
    // to the Logicle condition so skip it here
    let sum = this.taylor[this.taylor.length - 1] * x
    for (let i = this.taylor.length - 2; i >= 2; --i) {
      sum = (sum + this.taylor[i]) * x
    }
    return (sum * x + this.taylor[0]) * x
  }

  /**
   * Computes the Logicle scale value of the given data value
   * 
   * @param value a data value
   * @return the double Logicle scale value
   */
  scale (value) {
    // handle true zero separately
    if (value == 0) {
      return this.x1
    }

    // reflect negative values
    let negative = value < 0
    if (negative) {
      value = -value
    }

    // initial guess at solution
    let x
    if (value < this.f) {
      // use linear approximation in the quasi linear region
      x = this.x1 + value / this.taylor[0]
    } else {
      // otherwise use ordinary logarithm
      x = Math.log(value / this.a) / this.b
    }

    // try for double precision unless in extended range
    let tolerance = 3 * ulp(1)
    if (x > 1) {
      tolerance = 3 * ulp(x)
    }

    for (let i = 0; i < 10; ++i) {
      // compute the function and its first two derivatives
      let ae2bx = this.a * Math.exp(this.b * x)
      let ce2mdx = this.c / Math.exp(this.d * x)
      let y
      if (x < this.xTaylor) {
        // near zero use the Taylor series
        y = this.seriesBiexponential(x) - value
      } else {
        // this formulation has better roundoff behavior
        y = (ae2bx + this.f) - (ce2mdx + value)
      }
      let abe2bx = this.b * ae2bx
      let cde2mdx = this.d * ce2mdx
      let dy = abe2bx + cde2mdx
      let ddy = this.b * abe2bx - this.d * cde2mdx

      // this is Halley's method with cubic convergence
      let delta = y / (dy * (1 - y * ddy / (2 * dy * dy)))
      x -= delta

      // if we've reached the desired precision we're done
      if (Math.abs(delta) < tolerance) {
        // handle negative arguments
        if (negative) {
          return 2 * this.x1 - x
        } else {
          return x
        }
      }
    }

    throw new Error("scale() didn't converge")
  }

  /**
   * Computes the data value corresponding to the given point of the Logicle
   * scale. This is the inverse of the {@link Logicle#scale(double) scale}
   * function.
   * 
   * @param scale
   *          a double scale value
   * @return the double data value
   */
  inverse (scale) {
    // reflect negative scale regions
    let negative = scale < this.x1
    if (negative) {
      scale = 2 * this.x1 - scale
    }

    // compute the biexponential
    let inverse
    if (scale < this.xTaylor) {
      // near this.x1, i.e., data zero use the series expansion
      inverse = this.seriesBiexponential(scale)
    } else {
      // this formulation has better roundoff behavior
      inverse = (this.a * Math.exp(this.b * scale) + this.f) - this.c / Math.exp(this.d * scale)
    }

    // handle scale for negative values
    if (negative) {
      return -inverse
    } else {
      return inverse
    }
  }

  /**
   * Computes the dynamic range of the Logicle scale. For the Logicle scales
   * this is the ratio of the pixels per unit at the high end of the scale
   * divided by the pixels per unit at zero.
   * 
   * @return the double dynamic range
   */
  dynamicRange () {
    return this.slope(1) / this.slope(this.x1)
  }
  
    /**
     * Choose a suitable set of data coordinates for a Logicle scale
     * 
     * @return a double array of data values
     */
    axisLabels () {
        // number of decades in the positive logarithmic region
        let p = this.M - 2 * this.W
        // smallest power of 10 in the region
        let log10x = Math.ceil(Math.log(this.T) / LN_10 - p)
        // data value at that point
        let x = Math.exp(LN_10 * log10x)
        // number of positive labels
        let np = 0
        if (x > this.T) {
            x = this.T
            np = 1
        } else {
            np = (Math.floor(Math.log(this.T) / LN_10 - log10x)) + 1
        }
        // bottom of scale
        let B = this.inverse(0)
        // number of negative labels
        let nn = 0
        if (x > -B) {
            nn = 0
        } else if (x == this.T) {
            nn = 1
        } else {
            nn = Math.floor(Math.log(-B) / LN_10 - log10x) + 1
        }

        // fill in the axis labels
        let label = []
        label[nn] = 0
        for (let i = 1; i <= nn; ++i) {
            label[nn - i] = -x
            label[nn + i] = x
            x *= 10
        }
        for (let i = nn + 1; i <= np; ++i) {
            label[nn + i] = x
            x *= 10
        }

        return label
    }
}
