// src/core/types.ts
// Shared shapes used by every part of the system.

/** One point from MediaPipe. Values are 0..1 inside the camera picture. */
export interface Point {
  x: number;
  y: number;
  z?: number;
}

/** A point on the screen, in pixels. */
export interface Point2 {
  x: number;
  y: number;
}

/** One training example: "these features meant this screen pixel". */
export interface Sample {
  features: number[];
  screenX: number;
  screenY: number;
}

/** Average mistake, in pixels. */
export interface Accuracy {
  errX: number;
  errY: number;
}