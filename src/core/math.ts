// src/core/math.ts
// Plain maths helpers. No classes here on purpose - these are pure functions
// with no state, so making them objects would add nothing.

/** Multiply two lists together and add up the result. */
export function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * Solve A * w = b using Gaussian elimination.
 * A is small (about 9x9), so speed does not matter.
 */
export function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Use the biggest row as the pivot. Safer with rounding errors.
    let best = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[best][col])) best = r;
    }
    [M[col], M[best]] = [M[best], M[col]];

    const pivot = M[col][col];
    if (Math.abs(pivot) < 1e-12) continue; // dead column, skip it

    for (let c = col; c <= n; c++) M[col][c] /= pivot;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }

  return M.map((row) => row[n]);
}

/**
 * Ridge regression: find weights w so that X * w is close to y.
 *
 * "Ridge" = we add a small penalty (lambda) so the weights stay small.
 * Without it the formula fits the calibration dots perfectly but behaves
 * badly everywhere else. This is called overfitting.
 */
export function ridgeRegression(
  X: number[][],
  y: number[],
  lambda: number
): number[] {
  const n = X[0].length;
  const A: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const b: number[] = new Array(n).fill(0);

  for (let i = 0; i < X.length; i++) {
    const row = X[i];
    for (let a = 0; a < n; a++) {
      b[a] += row[a] * y[i];
      for (let c = 0; c < n; c++) A[a][c] += row[a] * row[c];
    }
  }

  // Start at 1: never penalise the constant term.
  for (let a = 1; a < n; a++) A[a][a] += lambda;

  return solveLinearSystem(A, b);
}