// src/debug.ts
// A face view for checking the tracker.
// It draws the 478 points, highlights the eyes, and shows the 9 features.
//
// It does NOT open the camera. The hidden page owns the camera, and a
// camera can only be opened once. So we ask the service worker for the
// points it already has.

import { activeFeatureNames } from "./core/active";
import { EYE_L, EYE_R, HEAD } from "./core/Landmarks";

// ---- landmark index lists (from MediaPipe's face mesh) ----
const LEFT_EYE_RING = [
  33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7,
];
const RIGHT_EYE_RING = [
  362, 398, 384, 385, 386, 387, 388, 466, 263, 249, 390, 373, 374, 380, 381,
  382,
];
const LEFT_IRIS = [468, ...EYE_L.IRIS_RING];
const RIGHT_IRIS = [473, ...EYE_R.IRIS_RING];

/**
 * The eye corners. These are the vertical ZERO LINE: the iris is measured
 * up or down from the midpoint between them. Corners are held by bone, so
 * unlike the eyelids they stay put when you blink.
 */
const ZERO_LINE = [EYE_L.OUTER, EYE_L.INNER, EYE_R.OUTER, EYE_R.INNER];

/**
 * The face midline. These four are the head-pitch sensors: nod down and the
 * forehead stretches away from the eyes while the chin bunches towards them.
 */
const MIDLINE = [HEAD.FOREHEAD, HEAD.NASION, HEAD.NOSE_TIP, HEAD.CHIN];

/** Eyelids. No longer a ruler - now a feature in their own right. */
const LIDS = [
  ...EYE_L.LID_UPPER_MID,
  ...EYE_L.LID_LOWER_MID,
  ...EYE_R.LID_UPPER_MID,
  ...EYE_R.LID_LOWER_MID,
];

// ---- elements ----
const faceCv = document.getElementById("face") as HTMLCanvasElement;
const fctx = faceCv.getContext("2d")!;
const screenCv = document.getElementById("screen") as HTMLCanvasElement;
const sctx = screenCv.getContext("2d")!;
const featTable = document.getElementById("feat") as HTMLElement;
const camState = document.getElementById("camState") as HTMLElement;
const fpsEl = document.getElementById("fps") as HTMLElement;

let updates = 0;
let lastPoints: { x: number; y: number }[] | null = null;

/** Mirror the x, so moving right on screen matches moving right in real life. */
function px(x: number) {
  return (1 - x) * faceCv.width;
}
function py(y: number) {
  return y * faceCv.height;
}

function ring(points: any[], idx: number[], colour: string, width = 1.5) {
  fctx.beginPath();
  idx.forEach((i, n) => {
    const p = points[i];
    if (!p) return;
    if (n === 0) fctx.moveTo(px(p.x), py(p.y));
    else fctx.lineTo(px(p.x), py(p.y));
  });
  fctx.closePath();
  fctx.strokeStyle = colour;
  fctx.lineWidth = width;
  fctx.stroke();
}

function drawFace(points: { x: number; y: number }[]) {
  fctx.clearRect(0, 0, faceCv.width, faceCv.height);

  // All points, faint.
  fctx.fillStyle = "rgba(160,160,180,.45)";
  for (const p of points) {
    fctx.fillRect(px(p.x) - 0.75, py(p.y) - 0.75, 1.5, 1.5);
  }

  // Eye outlines.
  ring(points, LEFT_EYE_RING, "#4a9eff");
  ring(points, RIGHT_EYE_RING, "#4a9eff");

  // Iris.
  ring(points, LEFT_IRIS, "#45d17a", 2);
  ring(points, RIGHT_IRIS, "#45d17a", 2);

  // Iris centres, filled.
  fctx.fillStyle = "#45d17a";
  for (const i of [468, 473]) {
    const p = points[i];
    if (!p) continue;
    fctx.beginPath();
    fctx.arc(px(p.x), py(p.y), 3, 0, Math.PI * 2);
    fctx.fill();
  }

  // The zero line - the iris is measured up or down from between these.
  dots(points, ZERO_LINE, "#ffa94a", 3);

  // The eyelids. Watch these move on their own when you look down: that is
  // the effect the old vertical feature could not tell apart from a real
  // downward look.
  dots(points, LIDS, "#c07bff", 2);

  // The head-pitch sensors, joined up so the tilt is visible.
  dots(points, MIDLINE, "#ff6b6b", 3);
  fctx.beginPath();
  MIDLINE.forEach((i, n) => {
    const p = points[i];
    if (!p) return;
    if (n === 0) fctx.moveTo(px(p.x), py(p.y));
    else fctx.lineTo(px(p.x), py(p.y));
  });
  fctx.strokeStyle = "rgba(255,107,107,.4)";
  fctx.lineWidth = 1;
  fctx.stroke();
}

function dots(points: any[], idx: number[], colour: string, r: number) {
  fctx.fillStyle = colour;
  for (const i of idx) {
    const p = points[i];
    if (!p) continue;
    fctx.beginPath();
    fctx.arc(px(p.x), py(p.y), r, 0, Math.PI * 2);
    fctx.fill();
  }
}

function drawFeatures(features: number[], quality?: number) {
  let html = "";

  if (typeof quality === "number") {
    const colour = quality > 0.5 ? "#45d17a" : "#ff6b6b";
    html +=
      `<tr><td class="k" style="color:${colour}">frame quality` +
      `<div class="bar"><i style="width:${quality * 100}%;background:${colour}"></i></div></td>` +
      `<td class="v" style="color:${colour}">${quality.toFixed(2)}</td></tr>`;
  }

  features.forEach((v, i) => {
    const name = activeFeatureNames[i] ?? "f" + i;
    // Features now run either side of zero, so centre the bar on the middle
    // and let it grow left or right. Clamped to +/-1.
    const c = Math.max(-1, Math.min(1, v));
    const left = c < 0 ? 50 + c * 50 : 50;
    const width = Math.abs(c) * 50;
    html +=
      `<tr><td class="k">${name}` +
      `<div class="bar"><i style="margin-left:${left}%;width:${width}%"></i></div></td>` +
      `<td class="v">${v.toFixed(3)}</td></tr>`;
  });
  featTable.innerHTML = html;
}

function drawScreenGuess(sx?: number, sy?: number) {
  sctx.clearRect(0, 0, screenCv.width, screenCv.height);
  if (typeof sx !== "number") return;

  const fx = sx / window.screen.width;
  const fy = sy! / window.screen.height;

  sctx.fillStyle = "#ff3c3c";
  sctx.beginPath();
  sctx.arc(fx * screenCv.width, fy * screenCv.height, 6, 0, Math.PI * 2);
  sctx.fill();
}

// ---- talk to the service worker ----

// Tell it we are watching, so the hidden page starts sending face points.
// If this page closes, the messages stop within ~2 seconds by themselves.
setInterval(() => {
  chrome.runtime.sendMessage({ type: "WATCH_FACE" }).catch(() => {});
}, 800);

// Ask for the newest face, 25 times a second.
setInterval(() => {
  chrome.runtime.sendMessage({ type: "GET_FACE" }, (res: any) => {
    if (chrome.runtime.lastError) return;
    if (!res || !Array.isArray(res.points)) return;

    updates++;
    camState.textContent = "on";
    camState.className = "on";

    lastPoints = res.points;
    drawFace(res.points);
    if (Array.isArray(res.features)) drawFeatures(res.features, res.quality);
    drawScreenGuess(res.sx, res.sy);
  });
}, 40);

// Updates per second.
setInterval(() => {
  fpsEl.textContent = String(updates);
  if (updates === 0) {
    camState.textContent = "no data";
    camState.className = "off";
  }
  updates = 0;
}, 1000);

console.log("[eye] debug face view ready");