// src/core/FeatureExtractor.ts
//
// A FeatureExtractor turns 478 face points into a few useful numbers.
//
// This is an ABSTRACT class: it describes what every extractor must do,
// but refuses to say how. Each subclass decides the "how".
// That lets you swap one for another and measure which is more accurate.

import { Point } from "./types";

export abstract class FeatureExtractor {
  /** Short id. Saved with the model so we never mix incompatible data. */
  abstract readonly name: string;

  /** How many numbers extract() returns. */
  abstract readonly size: number;

  /** The actual work. Every subclass MUST write this. */
  abstract extract(face: Point[]): number[];

  /**
   * Shared helper, available to every subclass.
   * Divide safely - face points can sit on top of each other and give 0.
   */
  protected static div(a: number, b: number): number {
    return a / (Math.abs(b) < 1e-6 ? 1e-6 : b);
  }

  /** Distance between two points. Shared by subclasses. */
  protected static dist(a: Point, b: Point): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /** Same for all extractors, so it lives in the parent. */
  public describe(): string {
    return `${this.name} (${this.size} features)`;
  }
}

// ---------------------------------------------------------------------------

/** MediaPipe landmark numbers. */
const LM = {
  L_OUTER: 33,
  L_INNER: 133,
  L_UPPER: 159,
  L_LOWER: 145,
  L_IRIS: 468,
  R_INNER: 362,
  R_OUTER: 263,
  R_UPPER: 386,
  R_LOWER: 374,
  R_IRIS: 473,
  NOSE: 1,
  FACE_L: 234,
  FACE_R: 454,
};

/**
 * The good one.
 *
 * Measures where the iris sits INSIDE the eye, using the eye corners and
 * eyelids as a ruler. When the head moves, the corners move with it, so
 * this number stays stable. That is the whole trick.
 */
export class IrisRelativeExtractor extends FeatureExtractor {
  readonly name = "iris-relative-v1";
  readonly size = 9;

  extract(face: Point[]): number[] {
    const D = FeatureExtractor.div;

    // Position inside the eye, left to right (roughly 0..1).
    const lx = D(
      face[LM.L_IRIS].x - face[LM.L_OUTER].x,
      face[LM.L_INNER].x - face[LM.L_OUTER].x
    );
    const rx = D(
      face[LM.R_IRIS].x - face[LM.R_INNER].x,
      face[LM.R_OUTER].x - face[LM.R_INNER].x
    );

    // Position inside the eye, top to bottom.
    const ly = D(
      face[LM.L_IRIS].y - face[LM.L_UPPER].y,
      face[LM.L_LOWER].y - face[LM.L_UPPER].y
    );
    const ry = D(
      face[LM.R_IRIS].y - face[LM.R_UPPER].y,
      face[LM.R_LOWER].y - face[LM.R_UPPER].y
    );

    // Two eyes averaged are less noisy than one.
    const ex = (lx + rx) / 2;
    const ey = (ly + ry) / 2;

    // Head position and size. Size hints at how far away the user sits.
    const hx = face[LM.NOSE].x;
    const hy = face[LM.NOSE].y;
    const fw = FeatureExtractor.dist(face[LM.FACE_L], face[LM.FACE_R]);

    // The squared and multiplied terms let the formula bend a little
    // instead of being a perfectly straight line.
    return [1, ex, ey, ex * ex, ey * ey, ex * ey, hx, hy, fw];
  }
}

/**
 * The naive one. Kept on purpose as a COMPARISON.
 *
 * It uses the raw iris position, so head movement ruins it. Useful to
 * measure against, to prove the relative version is actually better.
 */
export class RawIrisExtractor extends FeatureExtractor {
  readonly name = "raw-iris-v1";
  readonly size = 4;

  extract(face: Point[]): number[] {
    const x = (face[LM.L_IRIS].x + face[LM.R_IRIS].x) / 2;
    const y = (face[LM.L_IRIS].y + face[LM.R_IRIS].y) / 2;
    return [1, x, y, x * y];
  }
}

/**
 * DEPRECATED - the live extractor now lives in ./active.ts.
 *
 * It had to move: the vertical extractors extend the class above, so if this
 * file imported them back to build `activeExtractor` the two files would
 * depend on each other in a circle and `class X extends Y` would throw at
 * start-up. active.ts imports both and is imported by neither.
 *
 * Left here only so nothing breaks if an old import is still around. Do not
 * import this - import `activeExtractor` from "./active" instead.
 */
export const activeExtractor: FeatureExtractor = new IrisRelativeExtractor();