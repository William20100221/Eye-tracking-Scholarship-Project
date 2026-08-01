// src/core/GazeEstimator.ts
//
// A GazeEstimator learns "features -> screen pixel", then predicts.
//
// Abstract class again. The interesting part is that the parent provides
// REAL working code for evaluate() and toJSON(), so subclasses only have to
// write the three things that are genuinely different.

import { Sample, Point2, Accuracy } from "./types";
import { dot, ridgeRegression } from "./math";

export abstract class GazeEstimator {
  /** Short id, saved inside the file so we can rebuild the right class. */
  abstract readonly name: string;

  /** Which extractor produced the features. Guards against mixing them. */
  public extractorName = "";

  /** Learn from calibration data. */
  abstract train(samples: Sample[]): void;

  /** Guess a screen pixel from one set of features. */
  abstract predict(features: number[]): Point2;

  /** Turn the learned numbers into plain data for storage. */
  protected abstract serialize(): any;

  /** Rebuild the learned numbers from plain data. */
  protected abstract deserialize(data: any): void;

  // -------------------------------------------------------------------
  // Below here is SHARED code. Every subclass gets it free.
  // -------------------------------------------------------------------

  /**
   * How wrong is this estimator on some data?
   * Works for any subclass, because it only calls predict().
   * This is the point of the abstract class.
   */
  public evaluate(samples: Sample[]): Accuracy {
    let sx = 0;
    let sy = 0;
    for (const s of samples) {
      const p = this.predict(s.features);
      sx += Math.abs(p.x - s.screenX);
      sy += Math.abs(p.y - s.screenY);
    }
    const n = Math.max(samples.length, 1);
    return { errX: sx / n, errY: sy / n };
  }

  public toJSON(): any {
    return {
      type: this.name,
      extractor: this.extractorName,
      data: this.serialize(),
    };
  }

  // ---- simple factory, so storage can rebuild the right subclass ----

  private static makers = new Map<string, () => GazeEstimator>();

  public static register(name: string, make: () => GazeEstimator): void {
    GazeEstimator.makers.set(name, make);
  }

  public static fromJSON(json: any): GazeEstimator | null {
    if (!json || !json.type) return null;
    const make = GazeEstimator.makers.get(json.type);
    if (!make) {
      console.warn("[eye] unknown estimator type:", json.type);
      return null;
    }
    const est = make();
    est.extractorName = json.extractor ?? "";
    (est as any).deserialize(json.data);
    return est;
  }
}

// ---------------------------------------------------------------------------

/**
 * The real one. Two ridge regressions: one for screen X, one for screen Y.
 */
export class RidgeGazeEstimator extends GazeEstimator {
  readonly name = "ridge-v1";

  private wx: number[] = [];
  private wy: number[] = [];

  constructor(private lambda: number = 1e-3) {
    super();
  }

  train(samples: Sample[]): void {
    const X = samples.map((s) => s.features);
    this.wx = ridgeRegression(X, samples.map((s) => s.screenX), this.lambda);
    this.wy = ridgeRegression(X, samples.map((s) => s.screenY), this.lambda);
  }

  predict(features: number[]): Point2 {
    return { x: dot(features, this.wx), y: dot(features, this.wy) };
  }

  protected serialize() {
    return { wx: this.wx, wy: this.wy, lambda: this.lambda };
  }

  protected deserialize(d: any) {
    this.wx = d.wx;
    this.wy = d.wy;
    this.lambda = d.lambda ?? 1e-3;
  }
}

/**
 * A deliberately stupid baseline: always guesses the middle of the screen.
 *
 * Why keep this? Because "my system has 80 px error" means nothing until
 * you know what guessing badly would score. If your real estimator is not
 * clearly better than this, it has learned nothing.
 */
export class MeanGazeEstimator extends GazeEstimator {
  readonly name = "mean-v1";

  private mx = 0;
  private my = 0;

  train(samples: Sample[]): void {
    this.mx = samples.reduce((a, s) => a + s.screenX, 0) / samples.length;
    this.my = samples.reduce((a, s) => a + s.screenY, 0) / samples.length;
  }

  predict(_features: number[]): Point2 {
    return { x: this.mx, y: this.my };
  }

  protected serialize() {
    return { mx: this.mx, my: this.my };
  }

  protected deserialize(d: any) {
    this.mx = d.mx;
    this.my = d.my;
  }
}

// Tell the factory these classes exist.
GazeEstimator.register("ridge-v1", () => new RidgeGazeEstimator());
GazeEstimator.register("mean-v1", () => new MeanGazeEstimator());