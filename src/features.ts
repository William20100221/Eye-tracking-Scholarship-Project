// Shared math. Used by offscreen.ts (to predict) and calibrate.ts (to learn).
//
// Two jobs:
//   1. turn 478 face points into a few stable numbers ("features")
//   2. learn / apply a formula that turns those numbers into a screen pixel

// ---------- landmark numbers we care about ----------
// Left eye
const L_OUTER = 33;
const L_INNER = 133;
const L_UPPER = 159;
const L_LOWER = 145;
const L_IRIS = 468;
// Right eye
const R_INNER = 362;
const R_OUTER = 263;
const R_UPPER = 386;
const R_LOWER = 374;
const R_IRIS = 473;
// Head
const NOSE = 1;
const FACE_L = 234;
const FACE_R = 454;

export type Point = { x: number; y: number; z?: number };

// How many numbers are in one feature row.
export const N_FEATURES = 9;

/**
 * Turn the face points into features.
 *
 * The key idea: we do NOT use the raw iris position, because that moves
 * whenever the head moves. Instead we measure where the iris sits INSIDE
 * the eye, using the eye corners as a ruler. If the head moves, the corners
 * move too, so this number stays stable.
 */
export function extractFeatures(face: Point[]): number[] {
  // Where the iris sits inside the eye, left-to-right (about 0..1).
  const lx =
    (face[L_IRIS].x - face[L_OUTER].x) /
    (face[L_INNER].x - face[L_OUTER].x || 1e-6);
  const rx =
    (face[R_IRIS].x - face[R_INNER].x) /
    (face[R_OUTER].x - face[R_INNER].x || 1e-6);

  // Where the iris sits inside the eye, top-to-bottom (about 0..1).
  const ly =
    (face[L_IRIS].y - face[L_UPPER].y) /
    (face[L_LOWER].y - face[L_UPPER].y || 1e-6);
  const ry =
    (face[R_IRIS].y - face[R_UPPER].y) /
    (face[R_LOWER].y - face[R_UPPER].y || 1e-6);

  // Average of both eyes. Two eyes are less noisy than one.
  const ex = (lx + rx) / 2;
  const ey = (ly + ry) / 2;

  // Head position and size. Size tells us roughly how far away the user is.
  const hx = face[NOSE].x;
  const hy = face[NOSE].y;
  const fw = Math.hypot(
    face[FACE_R].x - face[FACE_L].x,
    face[FACE_R].y - face[FACE_L].y
  );

  // The squared and multiplied terms let the formula bend a little,
  // instead of being a perfectly straight line.
  return [1, ex, ey, ex * ex, ey * ey, ex * ey, hx, hy, fw];
}

// ---------- the learning part ----------

export type GazeModel = {
  wx: number[]; // formula for screen X
  wy: number[]; // formula for screen Y
  errX: number; // average mistake in pixels, on the calibration data
  errY: number;
  screenW: number;
  screenH: number;
};

/**
 * Solve A * w = b. Plain Gaussian elimination.
 * A is small (9x9) so speed does not matter.
 */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  // Work on copies.
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Find the biggest row, for numerical safety.
    let best = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[best][col])) best = r;
    }
    [M[col], M[best]] = [M[best], M[col]];

    const pivot = M[col][col];
    if (Math.abs(pivot) < 1e-12) continue; // skip a dead column

    for (let c = col; c <= n; c++) M[col][c] /= pivot;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }

  return M.map((row) => row[n]);
}

/**
 * Ridge regression: find the formula that best turns features into targets.
 *
 * "Ridge" means we add a small penalty (lambda) so the formula stays gentle.
 * Without it, the formula can fit the calibration points perfectly but go
 * crazy everywhere else.
 */
function ridge(X: number[][], y: number[], lambda: number): number[] {
  const n = X[0].length;

  // A = X^T X + lambda * I
  const A: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const b: number[] = new Array(n).fill(0);

  for (let i = 0; i < X.length; i++) {
    const row = X[i];
    for (let a = 0; a < n; a++) {
      b[a] += row[a] * y[i];
      for (let c = 0; c < n; c++) A[a][c] += row[a] * row[c];
    }
  }
  // Don't penalise the constant term (index 0).
  for (let a = 1; a < n; a++) A[a][a] += lambda;

  return solve(A, b);
}

export function trainModel(
  rows: number[][],
  targetsX: number[],
  targetsY: number[],
  screenW: number,
  screenH: number
): GazeModel {
  const lambda = 1e-3;
  const wx = ridge(rows, targetsX, lambda);
  const wy = ridge(rows, targetsY, lambda);

  // How wrong is it, on average, on the data it just learned from?
  // (Real accuracy will be a bit worse than this.)
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < rows.length; i++) {
    sx += Math.abs(dot(rows[i], wx) - targetsX[i]);
    sy += Math.abs(dot(rows[i], wy) - targetsY[i]);
  }

  return {
    wx,
    wy,
    errX: sx / rows.length,
    errY: sy / rows.length,
    screenW,
    screenH,
  };
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function predict(model: GazeModel, features: number[]) {
  return {
    sx: dot(features, model.wx),
    sy: dot(features, model.wy),
  };
}