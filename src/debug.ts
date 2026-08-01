// src/debug.ts
// A face view for checking the tracker.
// It draws the 478 points, highlights the eyes, and shows the 9 features.
//
// It does NOT open the camera. The hidden page owns the camera, and a
// camera can only be opened once. So we ask the service worker for the
// points it already has.

export {}; // <- IMPORTANT. Makes esbuild treat this as a module.

// ---- landmark index lists (from MediaPipe's face mesh) ----
const LEFT_EYE_RING = [
  33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7,
];
const RIGHT_EYE_RING = [
  362, 398, 384, 385, 386, 387, 388, 466, 263, 249, 390, 373, 374, 380, 381,
  382,
];
const LEFT_IRIS = [468, 469, 470, 471, 472];
const RIGHT_IRIS = [473, 474, 475, 476, 477];
// The points used as the "ruler" in IrisRelativeExtractor.
const RULERS = [33, 133, 159, 145, 362, 263, 386, 374];

const FEATURE_NAMES = [
  "constant",
  "eye X (ex)",
  "eye Y (ey)",
  "ex squared",
  "ey squared",
  "ex times ey",
  "head X",
  "head Y",
  "face width",
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

  // The ruler points - these are what make the tracking head-proof.
  fctx.fillStyle = "#ffa94a";
  for (const i of RULERS) {
    const p = points[i];
    if (!p) continue;
    fctx.beginPath();
    fctx.arc(px(p.x), py(p.y), 2.5, 0, Math.PI * 2);
    fctx.fill();
  }
}

function drawFeatures(features: number[]) {
  let html = "";
  features.forEach((v, i) => {
    const name = FEATURE_NAMES[i] ?? "f" + i;
    // Most features sit around 0..1, so a 0..1 bar is a fair picture.
    const pct = Math.max(0, Math.min(1, v)) * 100;
    html +=
      `<tr><td class="k">${name}` +
      `<div class="bar"><i style="width:${pct}%"></i></div></td>` +
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
    if (Array.isArray(res.features)) drawFeatures(res.features);
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