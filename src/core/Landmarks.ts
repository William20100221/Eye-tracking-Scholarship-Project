// src/core/Landmarks.ts
//
// Named identifiers for the MediaPipe Face Landmarker points.
//
// WHY THIS FILE EXISTS
// --------------------
// The old code used 13 bare numbers (33, 133, 159, ...) scattered through
// FeatureExtractor.ts. That is enough to track sideways gaze, but not enough
// to track UP AND DOWN gaze, which is the direction that matters for reading.
//
// Vertical gaze is hard for three reasons, and each one needs landmarks the
// old list did not have:
//
//   1. THE EYELID PROBLEM. The old vertical feature measured the iris between
//      the upper lid (159) and the lower lid (145). But the eyelids MOVE. You
//      blink, you squint, and the upper lid drops when you look down. So the
//      ruler changes length at exactly the moment you are trying to measure.
//      FIX: use the IRIS RING (469-472, 474-477) as the ruler instead. The
//      iris is ~11.7 mm across in every adult human and never changes size,
//      and use the EYE CORNERS (33/133, 362/263) as the zero line, because
//      corners do not move when you blink.
//
//   2. THE HEAD PITCH PROBLEM. Looking at the bottom of the screen with your
//      head still is not the same as tilting your head down. The old features
//      had no way to tell those apart - nose y moves in both cases. FIX: add
//      the FACE MIDLINE (forehead 10, nasion 168, nose tip 1, chin 152). When
//      the head pitches, the top half of the face grows in the image and the
//      bottom half shrinks. That ratio is a real pitch signal.
//
//   3. THE HEAD ROLL PROBLEM. Tilt your head sideways and "up" in the image
//      is no longer "up" on your face, so vertical iris offset leaks into
//      horizontal and back. FIX: the two OUTER EYE CORNERS (33, 263) define
//      the face's own horizon, so we can rotate that leak away.
//
// Everything here is just index numbers plus small helpers. No behaviour.

import type { Point } from "./types";

// ---------------------------------------------------------------------------
// Camera geometry
// ---------------------------------------------------------------------------

/**
 * MediaPipe gives x as a fraction of image WIDTH and y as a fraction of image
 * HEIGHT. On a 640x480 camera those are different physical sizes, so a circle
 * looks like an ellipse in raw numbers. Multiplying x by this puts both axes
 * in the same unit ("fractions of image height") so distances and angles mean
 * something. offscreen.ts requests 640x480, hence 4/3.
 */
export const CAMERA_ASPECT = 640 / 480;

// ---------------------------------------------------------------------------
// Eyes
// ---------------------------------------------------------------------------

/** The landmark identifiers for one eye. */
export interface EyeLandmarks {
  /** Lateral (outer) corner of the eye. Bone-anchored, does not blink. */
  OUTER: number;
  /** Medial (inner) corner, next to the nose. Also bone-anchored. */
  INNER: number;

  /** Whole upper eyelid, outer -> inner. */
  LID_UPPER: number[];
  /** Whole lower eyelid, outer -> inner. Same order as LID_UPPER. */
  LID_LOWER: number[];

  /** The three upper-lid points that sit directly over the iris. */
  LID_UPPER_MID: number[];
  /** The three lower-lid points directly under the iris. */
  LID_LOWER_MID: number[];

  /**
   * Upper/lower pairs that face each other across the eye. Used to measure
   * how open the eye is (the "aperture"), and so to detect blinks.
   */
  LID_PAIRS: [number, number][];

  /** Centre of the iris. */
  IRIS_C: number;
  /** The four points around the edge of the iris. Our physical ruler. */
  IRIS_RING: number[];

  /** Upper eyebrow line, outer -> inner. People raise brows when looking up. */
  BROW: number[];
  /** The three brow points right above the iris. */
  BROW_MID: number[];
}

/**
 * MediaPipe's "left" eye group. (Which side of the picture this lands on
 * depends on mirroring - it does not matter, because both eyes are treated
 * the same way and then averaged.)
 *
 * Ordering was taken from the eye rings already used in src/debug.ts, so the
 * upper and lower lists line up point-for-point along the eye.
 */
export const EYE_L: EyeLandmarks = {
  OUTER: 33,
  INNER: 133,

  LID_UPPER: [246, 161, 160, 159, 158, 157, 173],
  LID_LOWER: [7, 163, 144, 145, 153, 154, 155],

  LID_UPPER_MID: [160, 159, 158],
  LID_LOWER_MID: [144, 145, 153],

  LID_PAIRS: [
    [160, 144],
    [159, 145],
    [158, 153],
  ],

  IRIS_C: 468,
  IRIS_RING: [469, 470, 471, 472],

  BROW: [70, 63, 105, 66, 107],
  BROW_MID: [63, 105, 66],
};

/** MediaPipe's "right" eye group. Mirror of the above. */
export const EYE_R: EyeLandmarks = {
  OUTER: 263,
  INNER: 362,

  LID_UPPER: [466, 388, 387, 386, 385, 384, 398],
  LID_LOWER: [249, 390, 373, 374, 380, 381, 382],

  LID_UPPER_MID: [387, 386, 385],
  LID_LOWER_MID: [373, 374, 380],

  LID_PAIRS: [
    [387, 373],
    [386, 374],
    [385, 380],
  ],

  IRIS_C: 473,
  IRIS_RING: [474, 475, 476, 477],

  BROW: [300, 293, 334, 296, 336],
  BROW_MID: [293, 334, 296],
};

export const EYES = [EYE_L, EYE_R];

// ---------------------------------------------------------------------------
// Head
// ---------------------------------------------------------------------------

/**
 * Points down the middle of the face and out to its edges.
 *
 * The midline ones are the pitch sensors. Nod your head down and, in the
 * camera image, the forehead stretches away from the eyes while the chin
 * bunches up towards them. Neither distance alone tells you the pitch,
 * because tall foreheads exist - but the RATIO of the two does.
 */
export const HEAD = {
  /** Top of the forehead, on the midline. */
  FOREHEAD: 10,
  /** Mid forehead. */
  FOREHEAD_MID: 151,
  /** Between the eyebrows (glabella). */
  GLABELLA: 9,
  /** Bridge of the nose between the eyes (nasion). The stiffest point on
   *  the face - almost no muscle can move it. */
  NASION: 168,
  /** Down the nose bridge. */
  BRIDGE: [6, 197, 195, 5],
  /** Tip of the nose. Sticks out, so it swings a lot with pitch and yaw. */
  NOSE_TIP: 1,
  /** Underside of the nose (subnasale). */
  SUBNASALE: 2,
  /** Bottom of the chin (menton). */
  CHIN: 152,
  /** Just above the chin tip. */
  CHIN_UPPER: [175, 199, 200],

  /** Side of the face, left and right. Used for yaw and for face width. */
  SIDE_L: 234,
  SIDE_R: 454,
  /** Further out, near the ears. */
  TEMPLE_L: 127,
  TEMPLE_R: 356,

  /** Cheekbones. Move with a smile, so used only as a fallback. */
  CHEEK_L: 50,
  CHEEK_R: 280,

  /** Mouth corners. Not used for gaze - handy for sanity checks. */
  MOUTH_L: 61,
  MOUTH_R: 291,
};

/** Everything the vertical extractor reads. Handy for validation. */
export const REQUIRED_MAX_INDEX = 477;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** A 2D point in aspect-corrected space (both axes in image-height units). */
export interface V2 {
  x: number;
  y: number;
}

/** Read a landmark and put it into aspect-corrected space. */
export function at(face: Point[], i: number, aspect = CAMERA_ASPECT): V2 {
  const p = face[i];
  return { x: p.x * aspect, y: p.y };
}

/** Average of several landmarks. Averaging kills a lot of jitter. */
export function centroid(
  face: Point[],
  idx: number[],
  aspect = CAMERA_ASPECT
): V2 {
  let x = 0;
  let y = 0;
  for (const i of idx) {
    x += face[i].x;
    y += face[i].y;
  }
  return { x: (x / idx.length) * aspect, y: y / idx.length };
}

export function sub(a: V2, b: V2): V2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function mid(a: V2, b: V2): V2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function norm(v: V2): number {
  return Math.hypot(v.x, v.y);
}

/** Divide without ever returning Infinity. */
export function safeDiv(a: number, b: number): number {
  return a / (Math.abs(b) < 1e-9 ? (b < 0 ? -1e-9 : 1e-9) : b);
}

/** Does this face have the iris points? The 478-point model has them. */
export function hasIris(face: Point[]): boolean {
  return face.length > REQUIRED_MAX_INDEX;
}
