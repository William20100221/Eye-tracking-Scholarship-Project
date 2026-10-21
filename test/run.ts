// test/run.ts
//
// Checks the new landmarks actually do what the comments claim.
//
// Run:  node --experimental-transform-types test/run.ts
//
// Test 1  vertical response      - does vy move when the eyes move up/down?
// Test 2  the eyelid artefact    - hold the gaze still and squint
// Test 3  head roll              - tilt the head, gaze unchanged
// Test 4  head distance          - lean back, gaze unchanged
// Test 5  blink rejection        - does quality() catch a closing eye?
// Test 6  end to end             - calibrate on 15 dots, score on unseen dots

import type { Sample } from "../src/core/types";
import { IrisRelativeExtractor } from "../src/core/FeatureExtractor";
import { RidgeGazeEstimator } from "../src/core/GazeEstimator";
import {
  VerticalLeanExtractor,
  VerticalFullExtractor,
  measure,
} from "../src/core/VerticalFeatureExtractor";
import { StandardizedRidgeEstimator } from "../src/core/StandardizedRidgeEstimator";
import { leaveOneDotOut } from "../src/core/Validation";
import type { Pose } from "./FaceSim";
import { renderFace, pixelToWorld, SCREEN, resetSeed, gauss } from "./FaceSim";

// Declared here rather than pulling in @types/node for two lines.
declare const process: {
  env: Record<string, string | undefined>;
  exit(code: number): void;
};

const D = Math.PI / 180;
const old = new IrisRelativeExtractor();
const lean = new VerticalLeanExtractor();
const full = new VerticalFullExtractor();

let failures = 0;
function check(label: string, ok: boolean, detail: string) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}\n        ${detail}`);
}

function basePose(overrides: Partial<Pose> = {}): Pose {
  return {
    pitch: 0,
    yaw: 0,
    roll: 0,
    pos: { x: 0, y: 30, z: 600 },
    target: pixelToWorld(SCREEN.wPx / 2, SCREEN.hPx / 2),
    ...overrides,
  };
}

/**
 * A gaze target that keeps the eye at a fixed angle relative to the FACE,
 * whatever the head is doing. Far away, so both eyes point the same way.
 */
function gazeInHeadFrame(roll: number, downDeg: number, sideDeg: number) {
  const dn = downDeg * D;
  const sd = sideDeg * D;
  // direction in head space
  const h = { x: Math.sin(sd) * Math.cos(dn), y: Math.sin(dn), z: -Math.cos(sd) * Math.cos(dn) };
  // rotate it by the head's roll into world space
  const wx = h.x * Math.cos(roll) - h.y * Math.sin(roll);
  const wy = h.x * Math.sin(roll) + h.y * Math.cos(roll);
  const base = basePose();
  return { x: base.pos.x + wx * 3000, y: base.pos.y + wy * 3000, z: base.pos.z + h.z * 3000 };
}

/** The old extractor's vertical feature is index 2 ("ey"). */
const oldEy = (f: number[]) => f[2];
/** The new extractor's vertical feature is index 1 ("vy"). */
const newVy = (f: number[]) => f[1];

console.log("=".repeat(72));
console.log("TEST 1  vertical response: eyes sweep top to bottom of screen");
console.log("=".repeat(72));
{
  const rows = [0.05, 0.275, 0.5, 0.725, 0.95];
  const oldVals: number[] = [];
  const newVals: number[] = [];
  for (const r of rows) {
    const f = renderFace(basePose({ target: pixelToWorld(SCREEN.wPx / 2, r * SCREEN.hPx) }));
    oldVals.push(oldEy(old.extract(f)));
    newVals.push(newVy(lean.extract(f)));
  }
  console.log("  screen row   :", rows.map((r) => r.toFixed(3).padStart(7)).join(""));
  console.log("  old  ey      :", oldVals.map((x) => x.toFixed(3).padStart(7)).join(""));
  console.log("  new  vy      :", newVals.map((x) => x.toFixed(3).padStart(7)).join(""));

  const mono = (a: number[]) => a.every((x, i) => i === 0 || x > a[i - 1]);
  const span = newVals[4] - newVals[0];
  check(
    "new vy rises monotonically as the gaze moves down",
    mono(newVals) && span > 0.15,
    `range ${span.toFixed(3)} iris diameters over the full screen height`
  );
}

console.log();
console.log("=".repeat(72));
console.log("TEST 2  THE EYELID ARTEFACT: gaze frozen, eyes squint 0 -> 2mm");
console.log("        (this is the failure the new landmarks exist to fix)");
console.log("=".repeat(72));
{
  const target = pixelToWorld(SCREEN.wPx / 2, 0.8 * SCREEN.hPx); // looking low
  const squints = [0, 0.5, 1.0, 1.5, 2.0];
  const oldVals: number[] = [];
  const newVals: number[] = [];
  for (const s of squints) {
    const f = renderFace(basePose({ target, squint: s }));
    oldVals.push(oldEy(old.extract(f)));
    newVals.push(newVy(lean.extract(f)));
  }
  console.log("  squint mm    :", squints.map((s) => s.toFixed(1).padStart(7)).join(""));
  console.log("  old  ey      :", oldVals.map((x) => x.toFixed(3).padStart(7)).join(""));
  console.log("  new  vy      :", newVals.map((x) => x.toFixed(3).padStart(7)).join(""));

  // Express the drift as "how many screen rows would this fake?"
  const rowsFor = (extract: (f: number[]) => number, e: any) => {
    const top = extract(e.extract(renderFace(basePose({ target: pixelToWorld(960, 54) }))));
    const bot = extract(e.extract(renderFace(basePose({ target: pixelToWorld(960, 1026) }))));
    return Math.abs(bot - top);
  };
  const oldDrift = Math.abs(oldVals[4] - oldVals[0]) / rowsFor(oldEy, old);
  const newDrift = Math.abs(newVals[4] - newVals[0]) / rowsFor(newVy, lean);

  console.log(
    `\n  A 2 mm squint fakes a gaze shift of:` +
      `\n    old feature : ${(oldDrift * 100).toFixed(1)}% of the screen height` +
      `\n    new feature : ${(newDrift * 100).toFixed(1)}% of the screen height` +
      `\n  (the new one is not zero: a lid over the iris still biases MediaPipe's` +
      `\n   own circle fit, which the simulator models. It is much smaller.)`
  );
  check(
    "new vy is far less fooled by eyelid movement",
    newDrift < oldDrift / 5,
    `${(oldDrift / Math.max(newDrift, 1e-9)).toFixed(1)}x less drift`
  );
}

console.log();
console.log("=".repeat(72));
console.log("TEST 3  head roll -12 to +12 degrees, EYE-IN-HEAD angle frozen");
console.log("        The eyes keep the same angle relative to the FACE while the");
console.log("        head tilts, so any movement in the feature is pure");
console.log("        measurement artefact - which is what un-rolling removes.");
console.log("        (Rolling while staring at a fixed dot would not work as a");
console.log("         test: then the eye really does have to re-aim.)");
console.log("=".repeat(72));
{
  const rolls = [-12, -6, 0, 6, 12];
  const oldVals: number[] = [];
  const newVals: number[] = [];
  for (const r of rolls) {
    // Look 8 degrees down and 15 degrees sideways IN THE FACE'S OWN FRAME.
    const f = renderFace(basePose({ roll: r * D, target: gazeInHeadFrame(r * D, 8, 15) }));
    oldVals.push(oldEy(old.extract(f)));
    newVals.push(newVy(lean.extract(f)));
  }
  console.log("  roll deg     :", rolls.map((r) => String(r).padStart(7)).join(""));
  console.log("  old  ey      :", oldVals.map((x) => x.toFixed(3).padStart(7)).join(""));
  console.log("  new  vy      :", newVals.map((x) => x.toFixed(3).padStart(7)).join(""));

  const fullRange = (extract: (f: number[]) => number, e: any) => {
    const top = extract(e.extract(renderFace(basePose({ target: pixelToWorld(960, 54) }))));
    const bot = extract(e.extract(renderFace(basePose({ target: pixelToWorld(960, 1026) }))));
    return Math.abs(bot - top);
  };
  const spread = (a: number[]) => Math.max(...a) - Math.min(...a);
  const oldDrift = spread(oldVals) / fullRange(oldEy, old);
  const newDrift = spread(newVals) / fullRange(newVy, lean);
  console.log(
    `\n  A 24 degree tilt fakes a gaze shift of:` +
      `\n    old feature : ${(oldDrift * 100).toFixed(1)}% of the screen height` +
      `\n    new feature : ${(newDrift * 100).toFixed(1)}% of the screen height`
  );
  check(
    "un-rolling keeps vy steady under head tilt",
    newDrift < oldDrift,
    `old ${(oldDrift * 100).toFixed(1)}%  vs  new ${(newDrift * 100).toFixed(1)}%`
  );
}

console.log();
console.log("=".repeat(72));
console.log("TEST 4  distance 500 -> 725 mm, EYE ANGLE frozen at 10 degrees down");
console.log("        (not a frozen screen dot - leaning back genuinely changes");
console.log("         the angle to a fixed dot, which would test nothing)");
console.log("=".repeat(72));
{
  const zs = [500, 575, 650, 725];
  const newVals: number[] = [];
  const oldVals: number[] = [];
  const scales: number[] = [];
  for (const z of zs) {
    const pos = { x: 0, y: 30, z };
    // A target far away along a fixed direction keeps the gaze ANGLE constant.
    const down = 10 * D;
    const target = {
      x: pos.x,
      y: pos.y + 1000 * Math.sin(down),
      z: pos.z - 1000 * Math.cos(down),
    };
    const f = renderFace(basePose({ pos, target }));
    newVals.push(newVy(lean.extract(f)));
    oldVals.push(oldEy(old.extract(f)));
    scales.push(measure(f).scale);
  }
  console.log("  old  ey      :", oldVals.map((x) => x.toFixed(3).padStart(7)).join(""));
  console.log("  distance mm  :", zs.map((z) => String(z).padStart(7)).join(""));
  console.log("  new  vy      :", newVals.map((x) => x.toFixed(3).padStart(7)).join(""));
  console.log("  distance cue :", scales.map((x) => x.toFixed(3).padStart(7)).join(""));
  const spread = Math.max(...newVals) - Math.min(...newVals);
  check(
    "vy barely moves with distance (iris-diameter scaling works)",
    spread < 0.05,
    `spread ${spread.toFixed(4)} iris diameters`
  );
  check(
    "the distance cue does move, so the model can see leaning",
    scales[0] - scales[3] > 0.2,
    `${scales[0].toFixed(2)} at 500mm vs ${scales[3].toFixed(2)} at 725mm`
  );
}

console.log();
console.log("=".repeat(72));
console.log("TEST 5  blink rejection");
console.log("=".repeat(72));
{
  for (const s of [0, 2, 3.5, 4.5]) {
    const m = measure(renderFace(basePose({ squint: s })));
    console.log(
      `  squint ${s.toFixed(1)}mm -> openness ${m.apert.toFixed(3)}  quality ${m.quality.toFixed(3)}`
    );
  }
  const open = measure(renderFace(basePose({ squint: 0 }))).quality;
  const shut = measure(renderFace(basePose({ squint: 4.5 }))).quality;
  check(
    "quality is high with the eye open and near zero when it closes",
    open > 0.9 && shut < 0.15,
    `open ${open.toFixed(2)}, closing ${shut.toFixed(2)}`
  );
}

console.log();
console.log("=".repeat(72));
console.log("TEST 6  END TO END: calibrate on a 3x5 grid, score on unseen dots");
console.log("=".repeat(72));
{
  // SEED=3 node --experimental-transform-types test/run.ts
  // Re-run with a few seeds: one lucky draw of head poses proves nothing.
  resetSeed(Number(process.env.SEED ?? 7));

  const NOISE = 0.6; // px, roughly MediaPipe's landmark jitter

  /** People hold roughly still for one dot, then shift. */
  function poseForDot(px: number, py: number, frames: number): Pose[] {
    const p = gauss(4 * D);
    const y = gauss(5 * D);
    const r = gauss(3 * D);
    const pos = { x: gauss(25), y: 30 + gauss(25), z: 600 + gauss(45) };
    const sq = Math.abs(gauss(0.5));
    const out: Pose[] = [];
    for (let i = 0; i < frames; i++) {
      out.push({
        pitch: p + gauss(0.5 * D),
        yaw: y + gauss(0.5 * D),
        roll: r + gauss(0.4 * D),
        pos: { x: pos.x + gauss(2), y: pos.y + gauss(2), z: pos.z + gauss(4) },
        target: pixelToWorld(px, py),
        squint: sq + Math.abs(gauss(0.3)),
        noisePx: NOISE,
      });
    }
    return out;
  }

  function collect(
    dots: Array<[number, number]>,
    framesPerDot: number
  ): { oldS: Sample[]; leanS: Sample[]; fullS: Sample[] } {
    const oldS: Sample[] = [];
    const leanS: Sample[] = [];
    const fullS: Sample[] = [];
    for (const [px, py] of dots) {
      for (const pose of poseForDot(px, py, framesPerDot)) {
        const f = renderFace(pose);
        oldS.push({ features: old.extract(f), screenX: px, screenY: py });
        leanS.push({ features: lean.extract(f), screenX: px, screenY: py });
        fullS.push({ features: full.extract(f), screenX: px, screenY: py });
      }
    }
    return { oldS, leanS, fullS };
  }

  // The project's real calibration grid: 3 columns x 5 rows.
  const cols = [0.12, 0.5, 0.88];
  const rows = [0.08, 0.29, 0.5, 0.71, 0.92];
  const calDots: Array<[number, number]> = [];
  for (const r of rows) for (const c of cols) calDots.push([c * SCREEN.wPx, r * SCREEN.hPx]);

  // A wider grid, for the "does the 26-feature version ever win?" question.
  const bigCalDots: Array<[number, number]> = [];
  for (const r of [0.06, 0.23, 0.4, 0.56, 0.73, 0.94]) {
    for (const c of [0.08, 0.32, 0.68, 0.92]) bigCalDots.push([c * SCREEN.wPx, r * SCREEN.hPx]);
  }

  // Fresh dots the model never saw, at fresh head poses, spanning the screen.
  const testDots: Array<[number, number]> = [];
  for (const r of [0.14, 0.36, 0.58, 0.79, 0.96]) {
    for (const c of [0.2, 0.45, 0.75]) testDots.push([c * SCREEN.wPx, r * SCREEN.hPx]);
  }

  const cal = collect(calDots, 22);
  const big = collect(bigCalDots, 22);
  const tst = collect(testDots, 12);

  function score(train: Sample[], test: Sample[], make: () => any) {
    const est = make();
    est.train(train);
    return {
      train: est.evaluate(train),
      unseen: est.evaluate(test),
      loo: leaveOneDotOut(train, make),
    };
  }

  const rowsOut = [
    ["old  9 feat + ridge 1e-3", score(cal.oldS, tst.oldS, () => new RidgeGazeEstimator(1e-3))],
    ["new 13 feat + ridge 1e-3", score(cal.leanS, tst.leanS, () => new RidgeGazeEstimator(1e-3))],
    ["new 13 feat + std ridge ", score(cal.leanS, tst.leanS, () => new StandardizedRidgeEstimator(10))],
    ["new 26 feat + std ridge ", score(cal.fullS, tst.fullS, () => new StandardizedRidgeEstimator(10))],
  ] as const;

  console.log("\n  vertical error in pixels (1080 px tall screen)");
  console.log("  " + "-".repeat(66));
  console.log("  setup                      on cal dots   leave-1-dot-out   unseen dots");
  console.log("  " + "-".repeat(66));
  for (const [label, s] of rowsOut) {
    console.log(
      `  ${label}  ` +
        `${s.train.errY.toFixed(0).padStart(9)}   ` +
        `${s.loo.errY.toFixed(0).padStart(13)}   ` +
        `${s.unseen.errY.toFixed(0).padStart(11)}`
    );
  }
  console.log("  " + "-".repeat(66));

  // Does the 26-feature version pay off once there are enough dots to learn
  // from? This is the check behind the advice in NOTES.md.
  console.log("\n  same thing, but calibrated on a 4x6 grid (24 dots):");
  console.log("  " + "-".repeat(66));
  for (const [label, s] of [
    ["new 13 feat + std ridge ", score(big.leanS, tst.leanS, () => new StandardizedRidgeEstimator(10))],
    ["new 26 feat + std ridge ", score(big.fullS, tst.fullS, () => new StandardizedRidgeEstimator(10))],
  ] as const) {
    console.log(
      `  ${label}  ` +
        `${s.train.errY.toFixed(0).padStart(9)}   ` +
        `${s.loo.errY.toFixed(0).padStart(13)}   ` +
        `${s.unseen.errY.toFixed(0).padStart(11)}`
    );
  }
  console.log("  " + "-".repeat(66));

  const oldUnseen = rowsOut[0][1].unseen.errY;
  const bestNew = Math.min(rowsOut[1][1].unseen.errY, rowsOut[2][1].unseen.errY, rowsOut[3][1].unseen.errY);
  console.log(
    `\n  Lines of text (24 px each): old ${(oldUnseen / 24).toFixed(1)}  ->  new ${(bestNew / 24).toFixed(1)}`
  );
  check(
    "new features lower the error on dots never calibrated on",
    bestNew < oldUnseen,
    `${oldUnseen.toFixed(0)} px -> ${bestNew.toFixed(0)} px  (${(100 * (1 - bestNew / oldUnseen)).toFixed(0)}% better)`
  );
}

console.log();
console.log("=".repeat(72));
console.log(failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
console.log("=".repeat(72));
process.exit(failures === 0 ? 0 : 1);
