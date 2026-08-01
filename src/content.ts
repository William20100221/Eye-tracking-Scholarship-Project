// src/content.ts
// Runs on every web page. No camera, no MediaPipe.
// Draws a dot where the extension thinks you are looking.
// The dot can be switched off from the popup.

import { Point2 } from "./core/types";
import { Smoother, ExponentialSmoother } from "./core/Smoother";

/** Swap this line to compare smoothers. */
const smoother: Smoother = new ExponentialSmoother(0.25);

/** Owns the red dot on the page. */
class GazeMarker {
  private el: HTMLElement | null = null;
  private visible = true;

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

  public setVisible(on: boolean): void {
    this.visible = on;

    // Remove it completely when off. Cheaper than hiding, and leaves the
    // page exactly as it was.
    if (!on && this.el) {
      this.el.remove();
      this.el = null;
      smoother.reset();
    }
  }

  public moveTo(p: Point2): void {
    if (!this.visible) return;
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
  marker.setVisible(r.showDot !== false);
});

// React the moment the popup changes it - no page reload needed.
chrome.storage.onChanged.addListener((changes: any) => {
  if (changes.showDot) marker.setVisible(changes.showDot.newValue !== false);
});

chrome.runtime.onMessage.addListener((msg: any) => {
  if (msg?.type !== "GAZE") return;
  if (typeof msg.sx !== "number") return; // not calibrated yet

  const raw = screenToClient(msg.sx, msg.sy);
  marker.moveTo(smoother.push(raw));
});

console.log("[eye] content script ready, smoother =", smoother.name);