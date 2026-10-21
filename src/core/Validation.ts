// src/core/Validation.ts
//
// Honest accuracy, and a way to choose lambda.
//
// WHY THIS MATTERS MORE ONCE YOU ADD FEATURES
// -------------------------------------------
// calibrate.ts currently reports real.evaluate(this.samples) - the error on
// the very samples the model just learned from. That number always goes DOWN
// when you add features, whether or not the tracker got better. It went down
// for a while at 9 features; it will go down further at 26 while the real
// screen accuracy gets worse.
//
// So before deciding "the new landmarks helped", the error has to be measured
// on dots the model has never seen.
//
// LEAVE-ONE-DOT-OUT
// -----------------
// Calibration records ~22 frames while you stare at each dot. Those 22 frames
// are nearly identical, so holding out random FRAMES proves nothing - the
// model saw 21 near-copies of the held-out one. We hold out a whole DOT: train
// on 14 dots, predict the 15th, repeat 15 times. That is the same question the
// tracker faces in real use ("a place on screen I was not calibrated on").
//
// Samples are grouped by their target pixel, which is exactly one dot.

import type { Sample, Accuracy } from "./types";
import { GazeEstimator } from "./GazeEstimator";

/** Split samples into one group per calibration dot. */
export function groupByDot(samples: Sample[]): Sample[][] {
  const groups = new Map<string, Sample[]>();
  for (const s of samples) {
    const key = `${Math.round(s.screenX)}|${Math.round(s.screenY)}`;
    const g = groups.get(key);
    if (g) g.push(s);
    else groups.set(key, [s]);
  }
  return [...groups.values()];
}

/**
 * Train on every dot but one, score on the one left out, repeat.
 * `make` must return a FRESH untrained estimator each call.
 */
export function leaveOneDotOut(
  samples: Sample[],
  make: () => GazeEstimator
): Accuracy & { dots: number } {
  const dots = groupByDot(samples);
  if (dots.length < 3) return { errX: NaN, errY: NaN, dots: dots.length };

  let sx = 0;
  let sy = 0;
  let n = 0;

  for (let held = 0; held < dots.length; held++) {
    const train: Sample[] = [];
    for (let i = 0; i < dots.length; i++) {
      if (i !== held) train.push(...dots[i]);
    }

    const est = make();
    est.train(train);

    // Score once per dot, not once per frame, so a dot that happened to
    // record more frames does not count for more.
    const acc = est.evaluate(dots[held]);
    sx += acc.errX;
    sy += acc.errY;
    n++;
  }

  return { errX: sx / n, errY: sy / n, dots: dots.length };
}

/**
 * Try several lambdas and keep the one with the best held-out VERTICAL error.
 * Vertical, not the average, because reading needs rows.
 */
export function chooseLambda(
  samples: Sample[],
  make: (lambda: number) => GazeEstimator,
  candidates: number[] = [0.1, 0.3, 1, 3, 10, 30, 100, 300, 1000]
): { lambda: number; errX: number; errY: number; curve: Array<{ lambda: number; errY: number }> } {
  let best = candidates[0];
  let bestY = Infinity;
  let bestX = Infinity;
  const curve: Array<{ lambda: number; errY: number }> = [];

  for (const lambda of candidates) {
    const acc = leaveOneDotOut(samples, () => make(lambda));
    curve.push({ lambda, errY: acc.errY });
    if (Number.isFinite(acc.errY) && acc.errY < bestY) {
      bestY = acc.errY;
      bestX = acc.errX;
      best = lambda;
    }
  }

  return { lambda: best, errX: bestX, errY: bestY, curve };
}

/**
 * Compare any number of (extractor, estimator) setups on the same recording.
 *
 * This is the measurement the project is really about: does adding the new
 * landmarks lower the held-out vertical error, or does it just lower the
 * training error? Feed it the same calibration session encoded two ways.
 */
export interface Contender {
  label: string;
  samples: Sample[];
  make: () => GazeEstimator;
}

export function compare(contenders: Contender[]) {
  return contenders.map((c) => {
    const held = leaveOneDotOut(c.samples, c.make);
    const onTrain = (() => {
      const est = c.make();
      est.train(c.samples);
      return est.evaluate(c.samples);
    })();
    return {
      label: c.label,
      heldOutErrX: held.errX,
      heldOutErrY: held.errY,
      trainErrX: onTrain.errX,
      trainErrY: onTrain.errY,
      dots: held.dots,
      /** Big gap = the model memorised the dots instead of learning gaze. */
      overfitGapY: held.errY - onTrain.errY,
    };
  });
}
