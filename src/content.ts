// src/content.ts
// Runs on every web page. No camera, no MediaPipe.
// Draws a dot where the extension thinks you are looking.
// The dot can be switched off from the popup.

import { Point2 } from "./core/types";
import { Smoother, ExponentialSmoother } from "./core/Smoother";

/** Swap this line to compare smoothers. */
const smoother: Smoother = new ExponentialSmoother(0.25);

/**
 * Owns the red dot on the page.
 *
 * The dot is drawn only when BOTH things are true:
 *   wanted - the user has not switched it off in the popup
 *   live   - predictions are actually arriving right now
 *
 * The second one matters more than it looks. If tracking stops - the user
 * pressed stop, the calibration was deleted, the camera was taken by a video
 * call - the messages simply cease. Nothing tells the page. Without a "live"
 * flag the dot would just freeze wherever it happened to be and sit there
 * looking like a real reading.
 */
class GazeMarker {
  private el: HTMLElement | null = null;
  private wanted = true;
  private live = false;

  private create(): HTMLElement {
    const el = document.createElement("div");
    el.style.cssText = [
      "position:fixed",
      "width:22px",
      "height:22px",
      "margin:-11px 0 0 -11px",
      "border-radius:50%",
      "background:rgba(255,60,60,.45)",
      "border:2px solid rgba(255,60,60,.9)",
      "pointer-events:none", // never blocks clicks
      "z-index:2147483647",
    ].join(";");
    document.documentElement.appendChild(el);
    return el;
  }

  private get showing(): boolean {
    return this.wanted && this.live;
  }

  /** Remove it completely rather than hiding it, so the page is left
   *  exactly as it was found. */
  private remove(): void {
    if (!this.el) return;
    this.el.remove();
    this.el = null;
    smoother.reset(); // otherwise it reappears drifting in from the old spot
  }

  /** The popup's "Gaze dot" switch. */
  public setWanted(on: boolean): void {
    this.wanted = on;
    if (!this.showing) this.remove();
  }

  /** Are predictions arriving? */
  public setLive(on: boolean): void {
    this.live = on;
    if (!this.showing) this.remove();
  }

  public moveTo(p: Point2): void {
    if (!this.showing) return;
    if (!this.el) this.el = this.create();
    this.el.style.left = p.x + "px";
    this.el.style.top = p.y + "px";
  }
}

/** Converts a whole-screen pixel into a pixel inside this page. */
function screenToClient(sx: number, sy: number): Point2 {
  const chromeHeight = window.outerHeight - window.innerHeight;
  return {
    x: sx - window.screenX,
    y: sy - window.screenY - chromeHeight,
  };
}

const marker = new GazeMarker();

// Read the saved setting. Default is ON.
chrome.storage.local.get("showDot", (r: any) => {
  marker.setWanted(r.showDot !== false);
});

// React the moment the popup changes it - no page reload needed.
chrome.storage.onChanged.addListener((changes: any) => {
  if (changes.showDot) marker.setWanted(changes.showDot.newValue !== false);
});

/** When the last usable prediction arrived. 0 means none yet. */
let lastGazeAt = 0;

chrome.runtime.onMessage.addListener((msg: any) => {
  // The service worker says tracking was switched off, or the calibration was
  // deleted. Do not wait for the timeout below - go immediately.
  if (msg?.type === "TRACKING_OFF") {
    lastGazeAt = 0;
    marker.setLive(false);
    return;
  }

  if (msg?.type !== "GAZE") return;

  // A reading with no sx means the camera is working but there is no
  // calibration to turn it into a screen position. Nothing to draw.
  if (typeof msg.sx !== "number") {
    marker.setLive(false);
    return;
  }

  lastGazeAt = performance.now();
  marker.setLive(true);
  marker.moveTo(smoother.push(screenToClient(msg.sx, msg.sy)));
});

/**
 * The safety net. An explicit "stopped" message only arrives if something
 * politely announced it. A crashed offscreen page, a sleeping service worker
 * or a video call stealing the camera announce nothing - the messages just
 * stop. Readings arrive about every 50 ms, so silence for 700 ms means gone.
 */
setInterval(() => {
  if (lastGazeAt && performance.now() - lastGazeAt > 700) {
    lastGazeAt = 0;
    marker.setLive(false);
  }
}, 300);

console.log("[eye] content script ready, smoother =", smoother.name);