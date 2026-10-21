// src/calibrate.ts
// The calibration screen: show dots, collect samples, train, save.

import { Sample } from "./core/types";
import { activeExtractor } from "./core/active";
import { GazeEstimator, MeanGazeEstimator } from "./core/GazeEstimator";
import { StandardizedRidgeEstimator } from "./core/StandardizedRidgeEstimator";
import { chooseLambda, leaveOneDotOut } from "./core/Validation";

console.log("[eye] calibrate page loaded");

/** A recorded frame, plus how much we trust it. */
type ScoredSample = Sample & { quality: number };

/**
 * Frames below this are dropped before training. Blinks land near 0.
 * If almost everything is dropped, training falls back to using all of it
 * rather than failing - see pickTrainingSet().
 */
const MIN_QUALITY = 0.5;

/** Runs the whole calibration session. */
class CalibrationSession {
  // 3 columns x 5 rows. Extra rows because up/down is the weak direction,
  // and reading needs up/down accuracy most.
  // Adding rows is the cheapest accuracy win here: the vertical mapping is
  // the one that curves most, and a curve needs points to pin it down.
  private readonly cols = [0.12, 0.5, 0.88];
  private readonly rows = [0.08, 0.29, 0.5, 0.71, 0.92];

  private readonly settleMs = 700; // let the eye arrive
  private readonly recordMs = 900; // then record

  private samples: ScoredSample[] = [];
  private latestFeatures: number[] | null = null;
  private latestQuality = 1;
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
      // Older builds of the hidden page do not send this. Assume good.
      this.latestQuality = typeof res.quality === "number" ? res.quality : 1;
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
          // Record everything, including blinks, and filter later. Filtering
          // at capture time risks throwing away a whole dot from someone with
          // naturally narrow eyes, and then there is nothing to fall back to.
          this.samples.push({
            features: this.latestFeatures,
            screenX: target.sx,
            screenY: target.sy,
            quality: this.latestQuality,
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
   * Drop the frames we do not trust - mostly blinks.
   *
   * If that leaves too little to train on, keep everything instead. A bad
   * calibration is still better than a page that refuses to finish, and this
   * is the likely outcome for someone whose eyes read as narrow.
   */
  private pickTrainingSet(): { rows: Sample[]; dropped: number; gated: boolean } {
    const good = this.samples.filter((s) => s.quality >= MIN_QUALITY);
    const enough = good.length >= activeExtractor.size * 4;
    return {
      rows: enough ? good : this.samples,
      dropped: this.samples.length - good.length,
      gated: enough,
    };
  }

  /**
   * Train the real estimator, and also a dumb baseline to compare with.
   * If the real one is not clearly better, calibration failed.
   *
   * Two things changed here from the first version:
   *
   *  - The strength of the ridge penalty is chosen by measurement instead of
   *    being hard-coded, because the right value depends on the features and
   *    the features are no longer the ones the old 1e-3 was picked for.
   *
   *  - The headline error is now measured on dots the model has NEVER seen.
   *    The old number was measured on the same samples the model learned
   *    from, which always flatters it, and flatters it more the more
   *    features you add. That made it useless for judging a change.
   */
  public train() {
    const { rows, dropped, gated } = this.pickTrainingSet();

    const build = (lambda: number) => {
      const e = new StandardizedRidgeEstimator(lambda);
      e.extractorName = activeExtractor.name;
      return e;
    };

    const picked = chooseLambda(rows, build);

    const real = build(picked.lambda);
    real.train(rows);

    const trainErr = real.evaluate(rows);

    // Holding out a dot needs at least 3 dots to hold out from. If something
    // went badly wrong and there are fewer, fall back to the training error
    // rather than showing "Infinity px".
    const held = Number.isFinite(picked.errY)
      ? { errX: picked.errX, errY: picked.errY }
      : trainErr;

    return {
      real: real as GazeEstimator,
      lambda: picked.lambda,
      /** Error on unseen dots. The honest one. */
      heldErr: held,
      /** Error on the dots it learned from. Kept only for comparison. */
      trainErr,
      /** The same held-out test, on a model that always guesses the middle.
       *  Scored the same way, or the comparison would be rigged. */
      baseErr: leaveOneDotOut(rows, () => new MeanGazeEstimator()),
      used: rows.length,
      dropped,
      gated,
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

  const t = session.train();

  // errY is measured on dots the model never trained on, so it is a fair
  // guess at how it will behave on a real page.
  const errY = Math.round(t.heldErr.errY);
  const errX = Math.round(t.heldErr.errX);
  const baseY = Math.round(t.baseErr.errY);
  const lines = (errY / 24).toFixed(1); // ~24 px per line of text

  // Compare against the dumb baseline. This is the honest test.
  const improvement = baseY > 0 ? Math.round((1 - errY / baseY) * 100) : 0;

  // Save the formula AND how good it was, so the popup can report it later.
  chrome.storage.local.set({
    gazeModel: t.real.toJSON(),
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

  // The small print. Mostly useful when something looks wrong.
  const trainY = Math.round(t.trainErr.errY);
  const detail = document.getElementById("detail");
  if (detail) {
    detail.textContent =
      `${activeExtractor.describe()} | ${t.used} samples used` +
      (t.gated
        ? `, ${t.dropped} dropped as blinks`
        : `, blink filter off (too few clean frames)`) +
      ` | penalty ${t.lambda} | error on the dots it learned from: ${trainY} px` +
      ` (lower than the ${errY} px above, which is why that one is not the score)`;
  }

  result.style.display = "block";
}