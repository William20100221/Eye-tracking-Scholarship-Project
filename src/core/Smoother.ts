// src/core/Smoother.ts
//
// Raw predictions jump around a lot. A Smoother calms them down.
// Different smoothers behave differently, so again: abstract parent,
// several children, swap freely.

import { Point2 } from "./types";

export abstract class Smoother {
  abstract readonly name: string;

  /** Give it a new noisy point, get back a calmer one. */
  abstract push(p: Point2): Point2;

  /** Forget everything. Called when tracking restarts. */
  abstract reset(): void;
}

/**
 * Moves a fraction of the way towards each new point.
 * Cheap and smooth, but it lags behind fast eye movements.
 */
export class ExponentialSmoother extends Smoother {
  readonly name = "exponential";

  private x = 0;
  private y = 0;
  private started = false;

  /** alpha: 0..1. Lower = calmer but slower. */
  constructor(private alpha: number = 0.25) {
    super();
  }

  push(p: Point2): Point2 {
    if (!this.started) {
      this.x = p.x;
      this.y = p.y;
      this.started = true;
    } else {
      this.x += (p.x - this.x) * this.alpha;
      this.y += (p.y - this.y) * this.alpha;
    }
    return { x: this.x, y: this.y };
  }

  reset(): void {
    this.started = false;
  }
}

/**
 * Takes the middle value of the last N points.
 * Slower to react, but it completely ignores single crazy readings -
 * which happen whenever MediaPipe briefly loses an eye.
 */
export class MedianSmoother extends Smoother {
  readonly name = "median";

  private buf: Point2[] = [];

  constructor(private window: number = 7) {
    super();
  }

  push(p: Point2): Point2 {
    this.buf.push(p);
    if (this.buf.length > this.window) this.buf.shift();

    const xs = this.buf.map((q) => q.x).sort((a, b) => a - b);
    const ys = this.buf.map((q) => q.y).sort((a, b) => a - b);
    const mid = Math.floor(xs.length / 2);

    return { x: xs[mid], y: ys[mid] };
  }

  reset(): void {
    this.buf = [];
  }
}

/** No smoothing. Useful when measuring true accuracy. */
export class NoSmoother extends Smoother {
  readonly name = "none";
  push(p: Point2): Point2 {
    return p;
  }
  reset(): void {}
}