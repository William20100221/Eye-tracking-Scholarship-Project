// src/core/VerticalFeatureExtractor.ts
//
// Two new FeatureExtractor subclasses aimed at UP-AND-DOWN accuracy.
// They plug into the existing abstract FeatureExtractor with no changes to it.
//
//   VerticalLeanExtractor  - 13 features. The recommended default.
//   VerticalFullExtractor  - 26 features. Better, but needs more calibration
//                            points to learn from (see NOTES.md).
//
// THE FOUR IDEAS, IN ORDER OF HOW MUCH THEY HELP VERTICALLY
// ---------------------------------------------------------
//
// 1. MEASURE IN IRIS DIAMETERS, NOT IN EYELID OPENINGS.
//    Old:  ey = (iris.y - upperLid.y) / (lowerLid.y - upperLid.y)
//    That denominator is the eye opening, and it collapses towards 0 during a
//    blink, so ey explodes. It also shrinks whenever you squint or look down.
//    New:  vy = (iris.y - eyeCornerMidpoint.y) / irisDiameter
//    The iris is a fixed 11.7 mm in every adult, so the denominator is a real
//    ruler. The eye corners are held by bone, so the zero point does not move
//    when you blink. This single change is the biggest win in the file.
//
// 2. REMOVE HEAD ROLL BEFORE MEASURING.
//    If your head is tilted 10 degrees, part of your horizontal eye movement
//    shows up as vertical movement. We rotate every measurement so the line
//    between the two outer eye corners is flat first.
//
// 3. GIVE THE MODEL A REAL PITCH SIGNAL, AND LET IT INTERACT.
//    Looking down and nodding down land in the same place on screen but look
//    completely different in the eye. The features carry both a pitch estimate
//    and the product vy * pitch, so the model can learn "the same eye angle
//    means a different screen row depending on head tilt".
//
// 4. HAND THE EYELID STATE OVER AS ITS OWN FEATURE.
//    We cannot stop the upper lid from drooping when you look down. But if the
//    model can SEE the lid position, regression can subtract that bias out
//    instead of being fooled by it.

import type { Point } from "./types";
import { FeatureExtractor } from "./FeatureExtractor";
import type { EyeLandmarks, V2 } from "./Landmarks";
import {
  CAMERA_ASPECT,
  EYE_L,
  EYE_R,
  HEAD,
  at,
  centroid,
  hasIris,
  mid,
  norm,
  safeDiv,
  sub,
} from "./Landmarks";

// ---------------------------------------------------------------------------
// Everything measured off one face, before it is packed into a feature row.
// Exported so the debug page can display it.
// ---------------------------------------------------------------------------

export interface GazeSignals {
  /** Vertical iris offset from the eye-corner line, in iris diameters.
   *  Positive = iris sits low = looking down. THE key vertical number. */
  vy: number;
  /** Horizontal iris offset, same units. */
  hx: number;
  /** Left eye vy minus right eye vy. Should be near 0; large means one eye
   *  was mis-detected, so it doubles as a quality warning. */
  vyAsym: number;

  /** How open the eye is, in iris diameters. ~0.85 wide open, ~0 blinking. */
  apert: number;
  /** Gap from upper lid down to the iris centre. Shrinks when looking down. */
  lidUpper: number;
  /** Gap from iris centre down to the lower lid. */
  lidLower: number;
  /** Eyebrow height above the eye corners. Rises when looking up. */
  brow: number;

  /** Head pitch, anatomy-normalised, roughly -1..1. Bigger = chin down. */
  pitchN: number;
  /** Nose tip below the eye line, in iris diameters. */
  noseDrop: number;
  /** Vertical length of the nose bridge. Foreshortens as the head pitches. */
  noseLen: number;
  /** Pitch straight from MediaPipe's depth channel: forehead z minus chin z. */
  zPitch: number;
  /** Head yaw as a left/right face-width imbalance, roughly -1..1. */
  yaw: number;
  /** Head roll in radians, from the line between the outer eye corners. */
  roll: number;

  /** Where the head sits in the camera frame, centred on 0. */
  headX: number;
  headY: number;
  /** Iris diameter in image units, times 30. A distance gauge: ~1 at a normal
   *  sitting distance, smaller when you lean back. */
  scale: number;

  /** 0..1. Low means blinking, or a landmark went missing. */
  quality: number;
}

// ---------------------------------------------------------------------------
// The measuring itself
// ---------------------------------------------------------------------------

/** Anatomical constant: outer-corner-to-outer-corner is ~7.7 iris diameters.
 *  Only used if the iris landmarks are missing (468-point model). */
const INTEROCULAR_PER_IRIS = 7.7;

// --- quality thresholds, all in iris diameters ---
//
// Eye shape varies a lot between people, so these are a compromise. If the
// quality score sits low for a particular user even with their eyes wide
// open, lower APERTURE_OPEN. A better long-term fix is to record each user's
// own maximum openness during the first seconds of calibration and scale from
// that, instead of a fixed number.

/** Below this the eye is treated as shut. */
export const APERTURE_CLOSED = 0.15;
/** At or above this the eye counts as fully open. */
export const APERTURE_OPEN = 0.5;
/** Left/right vertical disagreement that drops quality to zero. */
export const MAX_EYE_DISAGREEMENT = 0.5;

interface EyeStats {
  vy: number;
  hx: number;
  apert: number;
  lidUpper: number;
  lidLower: number;
  brow: number;
  irisR: number;
}

/**
 * Iris radius, in aspect-corrected units.
 *
 * Averages the distance from the centre to all four ring points, so it does
 * not care which ring point is "top" and does not need un-rolling: distance
 * is the same however the head is tilted.
 */
function irisRadius(face: Point[], E: EyeLandmarks, aspect: number): number {
  const c = at(face, E.IRIS_C, aspect);
  let s = 0;
  for (const i of E.IRIS_RING) s += norm(sub(at(face, i, aspect), c));
  return s / E.IRIS_RING.length;
}

function eyeStats(
  face: Point[],
  E: EyeLandmarks,
  aspect: number,
  unroll: (v: V2) => V2,
  unit: number
): EyeStats {
  const outer = at(face, E.OUTER, aspect);
  const inner = at(face, E.INNER, aspect);
  const iris = at(face, E.IRIS_C, aspect);

  // The zero line: halfway between the two corners. Bone, not muscle.
  const canthalMid = mid(outer, inner);

  const d = unroll(sub(iris, canthalMid));

  const upper = centroid(face, E.LID_UPPER_MID, aspect);
  const lower = centroid(face, E.LID_LOWER_MID, aspect);
  const browPt = centroid(face, E.BROW_MID, aspect);

  const lidUpper = unroll(sub(iris, upper)).y / unit; // + = lid above iris
  const lidLower = unroll(sub(lower, iris)).y / unit; // + = lid below iris

  return {
    vy: d.y / unit,
    hx: d.x / unit,
    apert: lidUpper + lidLower,
    lidUpper,
    lidLower,
    brow: unroll(sub(canthalMid, browPt)).y / unit,
    irisR: irisRadius(face, E, aspect),
  };
}

/**
 * Turn one face into every signal we know how to measure.
 * Both extractors call this, then pick which signals to keep.
 */
export function measure(
  face: Point[],
  aspect: number = CAMERA_ASPECT
): GazeSignals {
  // --- head roll, from the two outer eye corners ---
  const outerL = at(face, EYE_L.OUTER, aspect);
  const outerR = at(face, EYE_R.OUTER, aspect);
  const eyeAxis = sub(outerR, outerL);
  const roll = Math.atan2(eyeAxis.y, eyeAxis.x);

  const cs = Math.cos(roll);
  const sn = Math.sin(roll);
  /** Rotate a difference vector so the eye line becomes flat. */
  const unroll = (v: V2): V2 => ({
    x: v.x * cs + v.y * sn,
    y: -v.x * sn + v.y * cs,
  });

  // --- the ruler: iris diameter, or a fallback if the model lacks irises ---
  let unit: number;
  if (hasIris(face)) {
    unit = irisRadius(face, EYE_L, aspect) + irisRadius(face, EYE_R, aspect);
  } else {
    unit = norm(eyeAxis) / INTEROCULAR_PER_IRIS;
  }
  if (!(unit > 1e-9)) unit = 1e-9;

  // --- per eye, then averaged ---
  const L = eyeStats(face, EYE_L, aspect, unroll, unit);
  const R = eyeStats(face, EYE_R, aspect, unroll, unit);
  const avg = (a: number, b: number) => (a + b) / 2;

  // --- head pose ---
  const eyeMid = mid(outerL, outerR);
  const forehead = at(face, HEAD.FOREHEAD, aspect);
  const chin = at(face, HEAD.CHIN, aspect);
  const noseTip = at(face, HEAD.NOSE_TIP, aspect);
  const nasion = at(face, HEAD.NASION, aspect);
  const sideL = at(face, HEAD.SIDE_L, aspect);
  const sideR = at(face, HEAD.SIDE_R, aspect);

  // Upper face height and lower face height, both in iris diameters.
  // Pitch down: upper grows, lower shrinks. Pitch up: the reverse.
  const upperFace = unroll(sub(eyeMid, forehead)).y / unit;
  const lowerFace = unroll(sub(chin, eyeMid)).y / unit;
  // The ratio cancels out "this person has a tall forehead".
  const pitchN = safeDiv(upperFace - lowerFace, upperFace + lowerFace);

  const noseDrop = unroll(sub(noseTip, eyeMid)).y / unit;
  const noseLen = unroll(sub(noseTip, nasion)).y / unit;

  // MediaPipe's z is roughly in the same units as x. Noisier than the
  // geometric estimates above, but it fails in different ways, which is
  // exactly what you want from a second opinion.
  const zOf = (i: number) => (face[i].z ?? 0) * aspect;
  const zPitch = (zOf(HEAD.FOREHEAD) - zOf(HEAD.CHIN)) / unit;

  // Yaw: turning your head makes one half of the face wider than the other.
  const halfL = unroll(sub(noseTip, sideL)).x;
  const halfR = unroll(sub(sideR, noseTip)).x;
  const yaw = safeDiv(halfL - halfR, halfL + halfR);

  // --- quality gate ---
  const apert = avg(L.apert, R.apert);
  const vyAsym = L.vy - R.vy;
  const openOk = Math.max(
    0,
    Math.min(1, (apert - APERTURE_CLOSED) / (APERTURE_OPEN - APERTURE_CLOSED))
  );
  const agreeOk = Math.max(0, Math.min(1, 1 - Math.abs(vyAsym) / MAX_EYE_DISAGREEMENT));
  const finite =
    Number.isFinite(L.vy) && Number.isFinite(R.vy) && Number.isFinite(pitchN);

  return {
    vy: avg(L.vy, R.vy),
    hx: avg(L.hx, R.hx),
    vyAsym,
    apert,
    lidUpper: avg(L.lidUpper, R.lidUpper),
    lidLower: avg(L.lidLower, R.lidLower),
    brow: avg(L.brow, R.brow),
    pitchN,
    noseDrop,
    noseLen,
    zPitch,
    yaw,
    roll,
    headX: eyeMid.x - aspect / 2,
    headY: eyeMid.y - 0.5,
    scale: unit * 30,
    quality: finite ? openOk * agreeOk : 0,
  };
}

/** Convenience wrapper: is this frame worth recording during calibration? */
export function frameQuality(face: Point[], aspect = CAMERA_ASPECT): number {
  return measure(face, aspect).quality;
}

// ---------------------------------------------------------------------------
// Extractor 1: the lean one. Start here.
// ---------------------------------------------------------------------------

/**
 * 13 features. Only 4 more than the old extractor, but every extra one is
 * spent on vertical accuracy. Safe to train on the existing 15-dot grid.
 */
export class VerticalLeanExtractor extends FeatureExtractor {
  readonly name = "iris-vertical-lean-v1";
  readonly size = 13;

  constructor(private aspect: number = CAMERA_ASPECT) {
    super();
  }

  extract(face: Point[]): number[] {
    const s = measure(face, this.aspect);
    return [
      1, //  0 constant
      s.vy, //  1 vertical iris offset          <- the main one
      s.hx, //  2 horizontal iris offset
      s.vy * s.vy, //  3 lets the vertical curve bend
      s.vy * s.hx, //  4 corner-of-screen correction
      s.pitchN, //  5 head pitch
      s.vy * s.pitchN, //  6 eye angle means different rows at different pitch
      s.noseDrop, //  7 second pitch opinion
      s.apert, //  8 how open the eye is
      s.vy * s.apert, //  9 subtracts the eyelid-droop bias
      s.lidUpper, // 10 upper lid position on its own
      s.headY, // 11 head height in the camera frame
      s.scale, // 12 how far away the head is
    ];
  }
}

export const VERTICAL_LEAN_FEATURE_NAMES = [
  "constant",
  "iris vertical (vy)",
  "iris sideways (hx)",
  "vy squared",
  "vy x hx",
  "head pitch",
  "vy x pitch",
  "nose drop",
  "eye openness",
  "vy x openness",
  "upper lid",
  "head Y in frame",
  "distance",
];

// ---------------------------------------------------------------------------
// Extractor 2: the full one. Use once calibration has >= 24 dots.
// ---------------------------------------------------------------------------

/**
 * 26 features. Adds roll, yaw, the depth-channel pitch, the brows, and the
 * left/right disagreement term.
 *
 * More features are not free: with only 15 calibration dots this will fit the
 * dots better and the screen worse. Only switch to it after widening the
 * calibration grid AND checking with the held-out score in Validation.ts.
 */
export class VerticalFullExtractor extends FeatureExtractor {
  readonly name = "iris-vertical-full-v1";
  readonly size = 26;

  constructor(private aspect: number = CAMERA_ASPECT) {
    super();
  }

  extract(face: Point[]): number[] {
    const s = measure(face, this.aspect);
    return [
      1, //  0 constant
      s.vy, //  1
      s.hx, //  2
      s.vy * s.vy, //  3
      s.vy * s.hx, //  4
      s.hx * s.hx, //  5
      s.pitchN, //  6 pitch from face-half ratio
      s.noseDrop, //  7 pitch from nose height
      s.noseLen, //  8 pitch from nose foreshortening
      s.zPitch, //  9 pitch from the depth channel
      s.yaw, // 10
      s.roll, // 11
      s.vy * s.pitchN, // 12 <- the important cross term
      s.vy * s.noseDrop, // 13
      s.hx * s.yaw, // 14
      s.apert, // 15
      s.lidUpper, // 16
      s.lidLower, // 17
      s.vy * s.apert, // 18
      s.brow, // 19
      s.vy * s.brow, // 20
      s.vyAsym, // 21 left/right disagreement
      s.headY, // 22
      s.headX, // 23
      s.scale, // 24
      s.vy * s.scale, // 25
    ];
  }
}

export const VERTICAL_FULL_FEATURE_NAMES = [
  "constant",
  "iris vertical (vy)",
  "iris sideways (hx)",
  "vy squared",
  "vy x hx",
  "hx squared",
  "head pitch (face halves)",
  "nose drop",
  "nose length",
  "depth pitch",
  "head yaw",
  "head roll",
  "vy x pitch",
  "vy x nose drop",
  "hx x yaw",
  "eye openness",
  "upper lid",
  "lower lid",
  "vy x openness",
  "brow raise",
  "vy x brow",
  "eye disagreement",
  "head Y in frame",
  "head X in frame",
  "distance",
  "vy x distance",
];
