// src/calibrate.ts
// The calibration screen: show dots, collect samples, train, save.

import { Sample } from "./core/types";
import { activeExtractor } from "./core/FeatureExtractor";
import {
  GazeEstimator,
  RidgeGazeEstimator,
  MeanGazeEstimator,
} from "./core/GazeEstimator";

console.log("[eye] calibrate page loaded");

/** Runs the whole calibration session. */
class CalibrationSession {
  // 3 columns x 5 rows. Extra rows because up/down is the weak direction,
  // and reading needs up/down accuracy most.
  private readonly cols = [0.12, 0.5, 0.88];
  private readonly rows = [0.08, 0.29, 0.5, 0.71, 0.92];

  private readonly settleMs = 700; // let the eye arrive
  private readonly recordMs = 900; // then record

  private samples: Sample[] = [];
  private latestFeatures: number[] | null = null;
  private messagesSeen = 0;

  constructor(
    private dot: HTMLElement,
    private hud: HTMLElement,
    private onFeatures: () => void
  ) {
    // ASK the service worker for the newest reading, 25 times a second.
    // We do not wait to be told: broadcast messages from the hidden page
    // do not reliably arrive here. Asking always works.
    setInterval(() => this.poll(), 40);
  }

  private poll(): void {
    chrome.runtime.sendMessage({ type: "GET_LATEST" }, (res: any) => {
      if (chrome.runtime.lastError) return; // worker waking up
      if (!res || !Array.isArray(res.features)) return;

      this.messagesSeen++;
      if (this.messagesSeen === 1) {
        console.log(
          "[eye] first eye data received:",
          res.features.length,
          "features"
        );
      }
      this.latestFeatures = res.features;
      this.onFeatures();
    });
  }

  public get seen(): number {
    return this.messagesSeen;
  }

  public get hasFeatures(): boolean {
    return this.latestFeatures !== null;
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** A point on this page -> a point on the whole screen. */
  private toScreen(clientX: number, clientY: number) {
    const chromeHeight = window.outerHeight - window.innerHeight;
    return {
      sx: window.screenX + clientX,
      sy: window.screenY + chromeHeight + clientY,
    };
  }

  public async run(): Promise<void> {
    const points: { x: number; y: number }[] = [];
    for (const ry of this.rows) {
      for (const rx of this.cols) {
        points.push({
          x: rx * window.innerWidth,
          y: ry * window.innerHeight,
        });
      }
    }

    for (let i = 0; i < points.length; i++) {
      const p = points[i];

      this.dot.style.left = p.x + "px";
      this.dot.style.top = p.y + "px";
      this.dot.classList.remove("ready");
      this.hud.textContent = `Point ${i + 1} of ${points.length}`;

      await this.sleep(this.settleMs);

      this.dot.classList.add("ready");
      const target = this.toScreen(p.x, p.y);
      const endAt = performance.now() + this.recordMs;

      while (performance.now() < endAt) {
        if (
          this.latestFeatures &&
          this.latestFeatures.length === activeExtractor.size
        ) {
          this.samples.push({
            features: this.latestFeatures,
            screenX: target.sx,
            screenY: target.sy,
          });
        }
        await this.sleep(40);
      }
    }
  }

  public get sampleCount(): number {
    return this.samples.length;
  }

  /**
   * Train the real estimator, and also a dumb baseline to compare with.
   * If the real one is not clearly better, calibration failed.
   */
  public train() {
    const real = new RidgeGazeEstimator(1e-3);
    real.extractorName = activeExtractor.name;
    real.train(this.samples);

    const base = new MeanGazeEstimator();
    base.train(this.samples);

    return {
      real: real as GazeEstimator,
      realErr: real.evaluate(this.samples),
      baseErr: base.evaluate(this.samples),
    };
  }
}

// ---------------------------------------------------------------- page glue

const intro = document.getElementById("intro") as HTMLElement;
const waiting = document.getElementById("waiting") as HTMLElement;
const startBtn = document.getElementById("startBtn") as HTMLButtonElement;
const dot = document.getElementById("dot") as HTMLElement;
const hud = document.getElementById("hud") as HTMLElement;
const result = document.getElementById("result") as HTMLElement;
const score = document.getElementById("score") as HTMLElement;
const advice = document.getElementById("advice") as HTMLElement;
const againBtn = document.getElementById("againBtn") as HTMLButtonElement;

let cameraSeen = false;

const session = new CalibrationSession(dot, hud, () => {
  if (!cameraSeen) {
    cameraSeen = true;
    startBtn.disabled = false;
    waiting.textContent = "Camera ready.";
    waiting.style.color = "#45d17a";
  }
});

// If nothing arrives, say WHY instead of leaving a dead button.
setTimeout(() => {
  if (cameraSeen) return;

  startBtn.disabled = false; // let the user try anyway
  waiting.style.color = "#e5c04b";
  waiting.textContent =
    "No eye data yet. Check your face is visible and lit, then press Start. " +
    "If the dots record nothing, open the offscreen console (edge://extensions " +
    "> Inspect views > offscreen.html).";
  console.warn("[eye] no GAZE messages after 6s");
}, 6000);

startBtn.addEventListener("click", async () => {
  intro.style.display = "none";
  dot.style.display = "block";
  hud.style.display = "block";

  await session.run();

  dot.style.display = "none";
  hud.style.display = "none";
  finish();
});

againBtn.addEventListener("click", () => location.reload());

function finish() {
  if (session.sampleCount < activeExtractor.size * 3) {
    score.textContent = "Not enough data.";
    score.className = "big bad";
    advice.textContent =
      `Only ${session.sampleCount} samples, and ${session.seen} eye messages ` +
      `arrived in total. If that second number is 0, the camera page is not ` +
      `sending anything. If it is large, your face was not detected - try ` +
      `more light, or sit closer.`;
    result.style.display = "block";
    return;
  }

  const { real, realErr, baseErr } = session.train();

  const errY = Math.round(realErr.errY);
  const errX = Math.round(realErr.errX);
  const baseY = Math.round(baseErr.errY);
  const lines = (errY / 24).toFixed(1); // ~24 px per line of text

  // Compare against the dumb baseline. This is the honest test.
  const improvement = baseY > 0 ? Math.round((1 - errY / baseY) * 100) : 0;

  // Save the formula AND how good it was, so the popup can report it later.
  chrome.storage.local.set({
    gazeModel: real.toJSON(),
    gazeAccuracy: { errX, errY, improvement },
  });

  score.textContent = `Vertical error: about ${errY} px (~${lines} lines)`;
  score.className = errY < 40 ? "big good" : errY < 90 ? "big ok" : "big bad";

  let text =
    `Sideways error ${errX} px. ` +
    `A guess-the-middle baseline scores ${baseY} px, ` +
    `so the tracking is ${improvement}% better than guessing. `;

  if (improvement < 30) {
    text += "That is too close to guessing - calibration did not work.";
  } else if (errY < 40) {
    text += "Line detection should work.";
  } else if (errY < 90) {
    text += "Good enough for paragraphs, not single lines.";
  } else {
    text += "Try again: sit still, more light, come closer to the camera.";
  }

  advice.textContent = text;
  result.style.display = "block";
}