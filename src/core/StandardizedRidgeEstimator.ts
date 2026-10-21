// src/core/StandardizedRidgeEstimator.ts
//
// A drop-in replacement for RidgeGazeEstimator. Same maths, one fix.
//
// THE BUG IT FIXES
// ----------------
// Ridge regression shrinks every weight by the same lambda. That is only fair
// if every feature is on the same scale. In the old 9-feature row the scales
// were already uneven, and in the new vertical rows they are wildly uneven:
//
//     vy          ranges about  -0.4 .. 0.4
//     head pitch  ranges about  -0.1 .. 0.1
//     head Y      ranges about  -0.2 .. 0.2
//     distance    sits near      1.0
//
// A feature with a small spread needs a large weight to do any work, and a
// large weight is exactly what ridge punishes. So the penalty silently
// deletes the small-spread features - including head pitch, which is one of
// the features added specifically to fix vertical accuracy.
//
// The fix is standard and boring: subtract each feature's mean and divide by
// its spread before fitting, then remember those numbers so predict() can do
// the same. Now lambda means the same thing to every feature.
//
// Because features are standardised, lambda lives on a different scale than
// before. Do not reuse 1e-3. Use Validation.ts to pick it.

import type { Sample, Point2 } from "./types";
import { GazeEstimator } from "./GazeEstimator";
import { dot, ridgeRegression } from "./math";

export class StandardizedRidgeEstimator extends GazeEstimator {
  readonly name = "ridge-std-v1";

  private mu: number[] = [];
  private sd: number[] = [];
  private wx: number[] = [];
  private wy: number[] = [];

  constructor(private lambda: number = 10) {
    super();
  }

  /** Work out the mean and spread of every column. */
  private fitScaler(X: number[][]): void {
    const n = X[0].length;
    this.mu = new Array(n).fill(0);
    this.sd = new Array(n).fill(1);

    for (let c = 0; c < n; c++) {
      let sum = 0;
      for (const row of X) sum += row[c];
      const m = sum / X.length;

      let v = 0;
      for (const row of X) v += (row[c] - m) * (row[c] - m);
      const s = Math.sqrt(v / X.length);

      // Leave the constant column alone, and leave dead columns alone
      // rather than dividing by a spread of zero.
      if (c === 0 || s < 1e-9) {
        this.mu[c] = 0;
        this.sd[c] = 1;
      } else {
        this.mu[c] = m;
        this.sd[c] = s;
      }
    }
  }

  private scale(f: number[]): number[] {
    const out = new Array(f.length);
    for (let i = 0; i < f.length; i++) out[i] = (f[i] - this.mu[i]) / this.sd[i];
    return out;
  }

  train(samples: Sample[]): void {
    const raw = samples.map((s) => s.features);
    this.fitScaler(raw);
    const X = raw.map((r) => this.scale(r));

    this.wx = ridgeRegression(
      X,
      samples.map((s) => s.screenX),
      this.lambda
    );
    this.wy = ridgeRegression(
      X,
      samples.map((s) => s.screenY),
      this.lambda
    );
  }

  predict(features: number[]): Point2 {
    const z = this.scale(features);
    return { x: dot(z, this.wx), y: dot(z, this.wy) };
  }

  /**
   * How much each feature actually contributes, in pixels per one standard
   * deviation of that feature. Because the columns are standardised these
   * numbers are directly comparable - which makes this an honest answer to
   * "did the new landmarks help, and which ones?".
   */
  public importance(): { x: number[]; y: number[] } {
    return { x: this.wx.map(Math.abs), y: this.wy.map(Math.abs) };
  }

  protected serialize() {
    return { wx: this.wx, wy: this.wy, mu: this.mu, sd: this.sd, lambda: this.lambda };
  }

  protected deserialize(d: any) {
    this.wx = d.wx;
    this.wy = d.wy;
    this.mu = d.mu;
    this.sd = d.sd;
    this.lambda = d.lambda ?? 10;
  }
}

GazeEstimator.register("ridge-std-v1", () => new StandardizedRidgeEstimator());
