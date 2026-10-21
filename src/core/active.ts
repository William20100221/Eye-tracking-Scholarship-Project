// src/core/active.ts
//
// The one place that decides which extractor the extension runs. Change the
// line at the bottom to experiment; nothing else needs touching.
//
// WHY THIS IS A SEPARATE FILE, AND NOT JUST A NEW LINE IN FeatureExtractor.ts
// --------------------------------------------------------------------------
// VerticalFeatureExtractor.ts already imports FeatureExtractor.ts, because its
// classes extend FeatureExtractor. If FeatureExtractor.ts imported back the
// other way to build `activeExtractor`, the two files would depend on each
// other in a circle. JavaScript handles that badly: whichever file is loaded
// second gets a half-built copy of the first, and `class X extends Y` blows up
// with "Cannot access Y before initialization" at start-up.
//
// A third file that imports both and is imported by neither breaks the circle.

import type { FeatureExtractor } from "./FeatureExtractor";
import { IrisRelativeExtractor, RawIrisExtractor } from "./FeatureExtractor";
import {
  VerticalLeanExtractor,
  VerticalFullExtractor,
  VERTICAL_LEAN_FEATURE_NAMES,
  VERTICAL_FULL_FEATURE_NAMES,
} from "./VerticalFeatureExtractor";

/** Every extractor worth comparing, with the names for the debug table. */
export const EXTRACTORS = {
  "raw-iris": { make: () => new RawIrisExtractor(), names: ["constant", "iris x", "iris y", "x times y"] },
  "iris-relative": {
    make: () => new IrisRelativeExtractor(),
    names: [
      "constant",
      "eye X (ex)",
      "eye Y (ey)",
      "ex squared",
      "ey squared",
      "ex times ey",
      "head X",
      "head Y",
      "face width",
    ],
  },
  "vertical-lean": { make: () => new VerticalLeanExtractor(), names: VERTICAL_LEAN_FEATURE_NAMES },
  "vertical-full": { make: () => new VerticalFullExtractor(), names: VERTICAL_FULL_FEATURE_NAMES },
};

/** <<< THE SWITCH. Change this one word to swap extractors. >>> */
export const ACTIVE: keyof typeof EXTRACTORS = "vertical-lean";

export const activeExtractor: FeatureExtractor = EXTRACTORS[ACTIVE].make();
export const activeFeatureNames: string[] = EXTRACTORS[ACTIVE].names;
