// test/FaceSim.ts
//
// A synthetic face, so the new features can be tested without a camera.
//
// It is a small 3D head model in millimetres: eyeballs of a known radius with
// irises of a known radius sitting on them, eyelids that follow the gaze the
// way real ones do, and a face midline. A pinhole camera projects it to the
// same 0..1 coordinates MediaPipe produces.
//
// Because the model knows the true gaze angle and the true head pose, we can
// ask questions no live recording can answer, such as: "hold the gaze exactly
// still and squint - how much does each feature move?"

import type { Point } from "../src/core/types";

// ---------------------------------------------------------------- 3D helpers

export type V3 = { x: number; y: number; z: number };

const v = (x: number, y: number, z: number): V3 => ({ x, y, z });
const add = (a: V3, b: V3): V3 => v(a.x + b.x, a.y + b.y, a.z + b.z);
const sub3 = (a: V3, b: V3): V3 => v(a.x - b.x, a.y - b.y, a.z - b.z);
const mul = (a: V3, s: number): V3 => v(a.x * s, a.y * s, a.z * s);
const cross = (a: V3, b: V3): V3 =>
  v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const len3 = (a: V3) => Math.hypot(a.x, a.y, a.z);
const unit = (a: V3): V3 => mul(a, 1 / (len3(a) || 1e-9));

/** Rz(roll) * Ry(yaw) * Rx(pitch), applied to a head-space point. */
function rotate(p: V3, pitch: number, yaw: number, roll: number): V3 {
  // pitch about x: chin down = positive
  let y = p.y * Math.cos(pitch) - p.z * Math.sin(pitch);
  let z = p.y * Math.sin(pitch) + p.z * Math.cos(pitch);
  let x = p.x;
  // yaw about y
  const x2 = x * Math.cos(yaw) + z * Math.sin(yaw);
  const z2 = -x * Math.sin(yaw) + z * Math.cos(yaw);
  x = x2;
  z = z2;
  // roll about z
  const x3 = x * Math.cos(roll) - y * Math.sin(roll);
  const y3 = x * Math.sin(roll) + y * Math.cos(roll);
  return v(x3, y3, z);
}

function rotateInv(p: V3, pitch: number, yaw: number, roll: number): V3 {
  // undo roll, then yaw, then pitch
  let x = p.x * Math.cos(roll) + p.y * Math.sin(roll);
  let y = -p.x * Math.sin(roll) + p.y * Math.cos(roll);
  let z = p.z;
  const x2 = x * Math.cos(yaw) - z * Math.sin(yaw);
  const z2 = x * Math.sin(yaw) + z * Math.cos(yaw);
  x = x2;
  z = z2;
  const y3 = y * Math.cos(pitch) + z * Math.sin(pitch);
  const z3 = -y * Math.sin(pitch) + z * Math.cos(pitch);
  return v(x, y3, z3);
}

// ------------------------------------------------------- anatomy, all in mm

const EYEBALL_R = 12.0;
const IRIS_R = 5.85; // 11.7 mm across, the same in every adult
const EYE_SEP = 63.0; // pupil-to-pupil
const HALF_OPEN = 5.0; // eyelid margin above / below the eye centre
const UPPER_LID_FOLLOW = 0.6; // the upper lid tracks 60% of vertical eye travel
const LOWER_LID_FOLLOW = 0.2;

/** Head-space positions. Origin at the midpoint of the two eyeball centres. */
const EYEBALL_C = {
  L: v(-EYE_SEP / 2, 0, -EYEBALL_R),
  R: v(+EYE_SEP / 2, 0, -EYEBALL_R),
};
const CANTHUS = {
  L_OUTER: v(-46, 1, -14),
  L_INNER: v(-17, 3, -10),
  R_INNER: v(+17, 3, -10),
  R_OUTER: v(+46, 1, -14),
};
const HEAD_PTS = {
  FOREHEAD: v(0, -62, -14),
  NASION: v(0, -4, -2),
  NOSE_TIP: v(0, 32, 22),
  CHIN: v(0, 88, -6),
  SIDE_L: v(-72, 6, -52),
  SIDE_R: v(+72, 6, -52),
};

// ------------------------------------------------------------------- camera

export interface Camera {
  width: number;
  height: number;
  f: number; // focal length in pixels
}

export const CAM: Camera = { width: 640, height: 480, f: 700 };

/** World point (camera at the origin, +z towards the user) -> 0..1 image. */
function project(p: V3, cam: Camera): Point {
  const depth = Math.max(p.z, 1);
  return {
    x: (cam.width / 2 + (cam.f * p.x) / depth) / cam.width,
    y: (cam.height / 2 + (cam.f * p.y) / depth) / cam.height,
    // MediaPipe's z is roughly "x units, relative to the head centre".
    z: (-(p.z - 600) / 600) * 0.4,
  };
}

// ------------------------------------------------------------------ the face

export interface Pose {
  /** Head rotation in radians. pitch: chin down positive. */
  pitch: number;
  yaw: number;
  roll: number;
  /** Head centre in world mm. +y is down, +z is away from the camera. */
  pos: V3;
  /** Where on the screen the person is looking, in world mm. */
  target: V3;
  /** Extra eyelid narrowing in mm, on top of the natural gaze-following. */
  squint?: number;
  /** Landmark noise in pixels (1 sigma). */
  noisePx?: number;
  /**
   * How strongly a covered iris drags the DETECTED iris centre towards the
   * visible part. Set to 0 for perfect detection.
   *
   * This matters, and it is easy to be dishonest about. The new features do
   * not read the eyelids at all, so on a perfect detector a squint could not
   * possibly move them. Real MediaPipe is not a perfect detector: when the
   * upper lid covers the top of the iris, the fitted circle slides down. So
   * the eyelid problem is only mostly solved, not entirely, and the test has
   * to include that or it proves nothing.
   */
  occlusionBias?: number;
}

let seed = 12345;
function rnd(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
export function resetSeed(s = 12345) {
  seed = s;
}
export function gauss(sigma: number): number {
  const u1 = Math.max(rnd(), 1e-9);
  const u2 = rnd();
  return sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
export { rnd };

/** Build all 478 landmarks for one head pose and gaze target. */
export function renderFace(pose: Pose, cam: Camera = CAM): Point[] {
  const { pitch, yaw, roll, pos, target } = pose;
  const squint = pose.squint ?? 0;
  const noise = pose.noisePx ?? 0;
  const occl = pose.occlusionBias ?? 0.35;

  const toWorld = (headPt: V3): V3 => add(rotate(headPt, pitch, yaw, roll), pos);

  const face: Point[] = new Array(478);
  const put = (i: number, headPt: V3) => {
    const p = project(toWorld(headPt), cam);
    if (noise > 0) {
      p.x += gauss(noise) / cam.width;
      p.y += gauss(noise) / cam.height;
    }
    face[i] = p;
  };

  // ---- per eye ----
  const eye = (
    side: "L" | "R",
    outerIdx: number,
    innerIdx: number,
    upperMid: number[],
    lowerMid: number[],
    browMid: number[],
    irisC: number,
    irisRing: number[]
  ) => {
    const E = EYEBALL_C[side];
    const eyeWorld = toWorld(E);

    // Gaze direction for THIS eye, in head space (so the two eyes converge).
    const dirWorld = unit(sub3(target, eyeWorld));
    const dirHead = rotateInv(dirWorld, pitch, yaw, roll);

    const trueIris = add(E, mul(dirHead, EYEBALL_R));

    // Vertical travel of the iris, which the lids partly follow.
    const drop = trueIris.y - E.y;
    const upperY = E.y - (HALF_OPEN - squint) + UPPER_LID_FOLLOW * drop;
    const lowerY = E.y + (HALF_OPEN - squint) + LOWER_LID_FOLLOW * drop;

    // Detector error: a lid lying across the iris drags the fitted centre
    // towards whatever is still visible.
    const hiddenTop = Math.max(0, upperY - (trueIris.y - IRIS_R));
    const hiddenBot = Math.max(0, trueIris.y + IRIS_R - lowerY);
    const irisCentre = add(trueIris, v(0, occl * (hiddenTop - hiddenBot) * 0.5, 0));

    // A flat disc perpendicular to the gaze, sitting on the eyeball surface.
    let u1 = cross(v(0, 1, 0), dirHead);
    if (len3(u1) < 1e-6) u1 = cross(v(1, 0, 0), dirHead);
    u1 = unit(u1);
    const u2 = unit(cross(dirHead, u1));

    put(irisC, irisCentre);
    irisRing.forEach((idx, k) => {
      const a = (k * Math.PI) / 2;
      put(
        idx,
        add(irisCentre, add(mul(u1, IRIS_R * Math.cos(a)), mul(u2, IRIS_R * Math.sin(a))))
      );
    });

    put(outerIdx, CANTHUS[side === "L" ? "L_OUTER" : "R_OUTER"]);
    put(innerIdx, CANTHUS[side === "L" ? "L_INNER" : "R_INNER"]);

    upperMid.forEach((idx, k) => {
      const dx = (k - 1) * 4;
      put(idx, v(E.x + dx, upperY, E.z + EYEBALL_R - 2));
    });
    lowerMid.forEach((idx, k) => {
      const dx = (k - 1) * 4;
      put(idx, v(E.x + dx, lowerY, E.z + EYEBALL_R - 3));
    });
    browMid.forEach((idx, k) => {
      const dx = (k - 1) * 6;
      put(idx, v(E.x + dx, E.y - 24, E.z + EYEBALL_R - 6));
    });
  };

  eye("L", 33, 133, [160, 159, 158], [144, 145, 153], [63, 105, 66], 468, [469, 470, 471, 472]);
  eye("R", 263, 362, [387, 386, 385], [373, 374, 380], [293, 334, 296], 473, [474, 475, 476, 477]);

  // ---- head ----
  put(10, HEAD_PTS.FOREHEAD);
  put(168, HEAD_PTS.NASION);
  put(1, HEAD_PTS.NOSE_TIP);
  put(152, HEAD_PTS.CHIN);
  put(234, HEAD_PTS.SIDE_L);
  put(454, HEAD_PTS.SIDE_R);

  // Anything not modelled still has to exist; park it on the nose.
  const filler = face[1];
  for (let i = 0; i < 478; i++) if (!face[i]) face[i] = { ...filler };

  return face;
}

// ------------------------------------------------------------------- screen

/** A 24 inch 1920x1080 monitor with the camera at the top centre. */
export const SCREEN = {
  wPx: 1920,
  hPx: 1080,
  wMm: 531,
  hMm: 299,
};

/** Screen pixel -> world mm (camera at the origin, screen plane at z = 0). */
export function pixelToWorld(px: number, py: number): V3 {
  return v(
    (px / SCREEN.wPx - 0.5) * SCREEN.wMm,
    (py / SCREEN.hPx) * SCREEN.hMm,
    0
  );
}
