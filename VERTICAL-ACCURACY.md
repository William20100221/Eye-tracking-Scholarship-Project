# More face landmarks, for vertical accuracy

Five new files in `src/core/`, a test folder, and edits to `offscreen.ts`,
`calibrate.ts` and `debug.ts`. Section 4 lists exactly what moved.

**Before anything works: `npm run build`, then calibrate again.** `dist/` still
holds the old bundles, and your saved calibration is now the wrong shape and
will be refused.

---

## 1. What I found

Your pipeline is: MediaPipe gives 478 points → `IrisRelativeExtractor` turns
them into 9 numbers → ridge regression maps those to a screen pixel. The idea
behind `IrisRelativeExtractor` is right: measure the iris *relative to* the eye
so head movement cancels out. It uses 13 landmarks to do it.

Vertical is the weak direction, and your own code says so — `calibrate.ts` uses
5 rows against 3 columns precisely because up/down is harder. Three things are
causing that, and each needs landmarks the old list did not include.

**Problem 1 — the ruler moves.** This is the big one.

```ts
ly = (iris.y - upperLid.y) / (lowerLid.y - upperLid.y)   // 159 and 145
```

The denominator is how open the eye is. It is not a constant. It shrinks when
you squint, when you smile, when the light is bright, and — worst of all — when
you look down, because the upper lid follows the eye. So the ruler shortens at
exactly the moment you are trying to measure a downward look. During a blink it
goes to zero and the feature explodes.

The horizontal version does not have this problem, because eye corners don't
move. That asymmetry is most of why sideways works and vertical doesn't.

**Problem 2 — no head-pitch signal.** Looking at the bottom of the screen and
nodding downward land in the same place, but look completely different in the
eye. The old features carry `face[1].y` (nose height), which moves for both,
and nothing that separates them.

**Problem 3 — head roll leaks sideways into vertical.** Tilt your head 10° and
part of your horizontal eye movement is measured as vertical.

---

## 2. The landmarks I added

| Group | Indices | What it fixes |
|---|---|---|
| **Iris rings** | 469–472, 474–477 | A ruler that cannot change length. The iris is ~11.7 mm across in every adult and never changes size, so it is a physical unit — and its apparent size also tells you how far away the head is. |
| **Inner + outer eye corners as a pair** | 33/133, 362/263 | Their midpoint is the vertical zero line. Held by bone, so it does not move when you blink. Replaces the eyelid as the reference. |
| **Full upper + lower eyelids** | 160,159,158 / 144,145,153 and 387,386,385 / 373,374,380 | Not used as a ruler any more — handed to the model as its own feature, so regression can subtract the lid-droop bias instead of being fooled by it. Also gives blink detection. |
| **Face midline** | 10 forehead, 168 nasion, 1 nose tip, 152 chin | Head pitch. Nod down and the upper face stretches in the image while the chin bunches up; the *ratio* of the two is a pitch estimate that does not care whether you have a tall forehead. |
| **Face sides** | 234, 454 | Head yaw, from the left/right width imbalance. |
| **Eyebrows** | 63,105,66 and 293,334,296 | People raise their brows when they look up. A weak signal, but free and independent of the eye itself. |
| **Depth channel** | `z` on 10 and 152 | A second, independent pitch opinion. Noisier than the geometric one, but it fails in different ways. |

Averaging three lid points instead of using one also cuts a lot of jitter.

---

## 3. New files

In `src/core/`:

| File | What it is |
|---|---|
| `Landmarks.ts` | Every index above, named and grouped, with the reasoning. Plus small vector helpers. No behaviour. |
| `VerticalFeatureExtractor.ts` | `VerticalLeanExtractor` (13 features, the recommended one) and `VerticalFullExtractor` (26, the comparison arm). Both extend your existing abstract `FeatureExtractor` with no changes to it. |
| `active.ts` | One switch that picks the live extractor. Also stops a circular-import crash — see the comment in the file. |
| `StandardizedRidgeEstimator.ts` | Ridge that scales the features first. Explained below. |
| `Validation.ts` | Leave-one-dot-out scoring, so you can tell whether a change actually helped. |

And in `test/` (outside `src/`, so the build entry points ignore them):

| File | What it is |
|---|---|
| `FaceSim.ts` | A synthetic 3D head — eyeballs, irises, eyelids that follow the gaze, a face midline, projected through a pinhole camera. Lets you test against a known ground truth. |
| `run.ts` | Seven checks. `npm test`. `SEED=3 npm test` re-rolls the head poses. |

### The one non-obvious bit: standardising before ridge

Ridge shrinks every weight by the same lambda, which is only fair if every
feature has a similar spread. In the new rows they don't:

```
iris vertical   spread ~0.15        head pitch      spread ~0.02
head Y          spread ~0.05        distance        sits near 1.0
```

A feature with a small spread needs a big weight to do anything, and a big
weight is exactly what ridge punishes. So the penalty quietly deletes the
small-spread features — including head pitch, which is one of the features
added specifically to fix vertical. Subtracting the mean and dividing by the
spread first makes lambda mean the same thing to every feature.

This also affects your current 9-feature setup, just less severely.

Because the features are now standardised, **lambda lives on a different
scale**. Don't reuse `1e-3` — start around 10 and let `chooseLambda()` in
`Validation.ts` pick it.

### The other non-obvious bit: your accuracy number is optimistic

`calibrate.ts` reports `real.evaluate(this.samples)` — the error on the very
samples it just learned from. That number goes down whenever you add features,
whether or not the tracker got better. With 9 features it was mildly
optimistic; at 26 it would be badly misleading.

`leaveOneDotOut()` trains on 14 dots and scores the 15th, fifteen times over. It
holds out a whole *dot*, not random frames, because the ~22 frames recorded at
one dot are near-copies of each other — holding one out proves nothing.

---

## 4. What changed in the existing files

**`src/offscreen.ts`**

- Imports `activeExtractor` from `./core/active` instead of
  `./core/FeatureExtractor`.
- Sends a `quality` score with every `GAZE` and `FACE` message.
  `background.ts` forwards whole messages untouched, so it needed no change.
- **New guard on loading a saved calibration.** A saved model is a list of
  weights, one per feature. The old saved model has 9; we now send 13. Because
  `dot()` walks the *feature* list, the extra features get multiplied by
  `undefined` and every prediction comes out `NaN` — nothing throws, the dot
  just quietly stops moving. `loadModel()` now checks `extractorName` and
  refuses a mismatch with a console warning. This is the check the comment on
  `GazeEstimator.extractorName` always claimed to do but never did.

**`src/calibrate.ts`**

- Same import swap.
- Records `quality` with every sample, then filters at training time rather
  than at capture time — filtering during capture risks throwing away a whole
  dot from someone with naturally narrow eyes, leaving nothing to fall back
  to. If fewer than `size * 4` clean frames survive, it keeps everything and
  says so.
- Trains a `StandardizedRidgeEstimator`, with lambda chosen by
  `chooseLambda()` instead of hard-coded.
- **The headline number is now the held-out error**, not the training error.
  Expect it to read *worse* than before — that is the point. The old number
  was measured on the samples the model had just learned from.
- A grey line of small print underneath shows the extractor, samples used,
  blinks dropped, the chosen lambda, and the old training-error number for
  comparison.

**`src/debug.ts`** — feature labels come from `activeFeatureNames`, so the
table follows whichever extractor is active. The face view now colours the
groups separately: green iris ring (the ruler), orange eye corners (the zero
line), purple eyelids, red face midline joined into a line (the pitch
sensors). Bars are centred on zero, since features now go negative. There is
also a frame-quality row that turns red during a blink.

Worth doing once: open the debug page, keep your head still, and look down.
The purple eyelid points move on their own. That movement is what the old
vertical feature could not tell apart from a real downward look.

**`src/core/FeatureExtractor.ts`** — untouched except a comment marking the old
`activeExtractor` export as deprecated.

**`package.json` / `tsconfig.json`** — added `npm test` and `npm run
typecheck`; set `moduleResolution: "bundler"` to match how esbuild actually
resolves imports, and dropped `rootDir` so `test/` is type-checked too.
`calibrate.html` gained one `<p id="detail">`.

## 4b. Run this

```bash
npm run build       # required - dist/ still has the old bundles
npm test            # the six checks below
npm run typecheck   # I could not run this, see the note in section 5
```

Then **calibrate again**. Your existing saved calibration will be rejected by
the new guard, and the popup will keep reporting the old accuracy figure until
you do.

---

## 5. Does it work?

`test/run.ts`, six checks, all passing. The interesting ones:

**The eyelid artefact.** Gaze frozen, eyes squint by 2 mm:

```
  squint mm    :     0.0    0.5    1.0    1.5    2.0
  old  ey      :   0.843  0.877  0.928  1.007  1.121
  new  vy      :   0.171  0.163  0.159  0.159  0.159

  A 2 mm squint fakes a gaze shift of:
    old feature : 92.5% of the screen height
    new feature :  3.2% of the screen height
```

A squint that isn't a gaze change at all moves the old feature almost the full
height of the screen. That is the bug, isolated.

The new one isn't zero, and shouldn't be: the simulator models the fact that a
lid lying across the iris also drags MediaPipe's own circle fit downward. The
eyelid problem is mostly solved, not entirely.

**Head roll**, with the eye held at a fixed angle relative to the face, so any
movement is pure measurement artefact: a 24° tilt fakes **48.3%** of the screen
height on the old feature, **0.3%** on the new one.

**End to end.** Simulated calibration on your real 3×5 grid, with head pose
drifting between dots, MediaPipe-scale landmark noise, and squint variation.
Scored on dots the model never saw, at fresh head poses. Vertical error in
pixels on a 1080-px screen, across six random seeds:

| setup | on cal dots | leave-1-dot-out | **unseen dots** |
|---|---|---|---|
| old 9 features + ridge 1e-3 | 143–230 | 250–456 | **182–343** |
| new 13 features + ridge 1e-3 | 65–85 | 84–125 | **75–96** |
| new 13 features + std ridge | 68–88 | 84–129 | **73–93** |
| new 26 features + std ridge | 60–69 | 106–138 | **85–165** |

Roughly a 2.5–3.5× reduction in vertical error — about 9 lines of text down to
about 3.

Two things to take from the table beyond the headline. First, the gap between
"on cal dots" and "unseen dots" for the old setup (230 vs 456 held-out) is the
overfitting your current accuracy readout cannot see. Second, **the 26-feature
version is not better** — it fits the calibration dots best and generalises
worst, and it stayed worse even when I widened calibration to 24 dots. Use
`VerticalLeanExtractor`. Keep the full one as a comparison arm, the same way
you kept `RawIrisExtractor`.

**Which new features are actually earning their place.** Because the
standardised estimator puts every feature on the same scale, its weights are
directly comparable — `importance()` returns pixels of screen movement per one
standard deviation of each feature. On a simulated session the vertical model
leans on:

```
    iris vertical (vy)    92 px
    vy x openness         92 px      <- eyelid decoupling
    vy x pitch            90 px      <- head/eye separation
    eye openness          83 px      <- eyelid decoupling
    distance              41 px
```

Two of the top four are the eyelid terms and one is the pitch cross-term. Those
are exactly the three problems in section 1, so the new landmarks are doing the
work they were added for rather than just padding the row.

### What this test does and does not prove

It is a synthetic face, so the absolute pixel numbers are not a prediction of
what you'll measure on yourself. What it does establish is that the mechanism
is real and the direction of the comparison is right, under noise and head
motion, across seeds. The real number has to come from your own face — which is
what `Validation.ts` is for.

One thing I could not check: **type-checking.** Your `typescript@7` install
ships a native binary for Windows only, and my sandbox is Linux, so `tsc` would
not run there. Every file was parsed and executed (the tests import and run all
five `src/core/` files, and I checked the storage round-trip through
`GazeEstimator.fromJSON`), but please run `npx tsc --noEmit` yourself before
committing.

---

## 6. Worth trying next

**Blendshapes.** MediaPipe can already output `eyeLookUpLeft`,
`eyeLookDownLeft`, `eyeBlinkLeft` and 49 others — a gaze estimate from the
model itself, trained on far more faces than you can calibrate on. One line in
`offscreen.ts`:

```diff
  this.landmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { ... },
    runningMode: "VIDEO",
    numFaces: 1,
+   outputFaceBlendshapes: true,
  });
```

Then `result.faceBlendshapes[0].categories` alongside the geometric features.
It costs some CPU per frame, so measure both.

**Smooth the features, not just the output.** `Smoother` currently runs on the
predicted pixel. A median over the last few *feature* rows kills single-frame
landmark glitches before they reach the model, and a median is what you want
because it ignores outliers completely rather than averaging them in.

**More rows in calibration.** You have 5. The vertical mapping is the one that
curves most, and 5 points is thin for fitting a curve. 7 rows × 3 columns costs
about 20 extra seconds.

**A per-user openness baseline.** The blink threshold in
`VerticalFeatureExtractor.ts` assumes a wide-open eye reads about 0.5 iris
diameters. Eye shape varies a lot between people. Recording each user's own
maximum during the first seconds of calibration and scaling from that would be
more robust than a fixed constant.
