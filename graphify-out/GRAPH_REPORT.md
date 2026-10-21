# Graph Report - Eye-tracking-Scholarship-Project  (2026-10-07)

## Corpus Check
- 34 files · ~129,849 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: .wasm 3, (none) 1)

## Summary
- 1072 nodes · 1511 edges · 103 communities (43 shown, 60 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 98 edges (avg confidence: 0.84)
- Token cost: 62,544 input · 0 output

## Community Hubs (Navigation)
- MediaPipe WASM Runtime (SIMD)
- MediaPipe WASM Runtime (NoSIMD)
- MediaPipe WASM Module Factory
- Gaze Calibration & Ridge Model
- Synthetic Face Test Harness
- Vertical Accuracy Design Docs
- npm Package Config
- Gaze Marker & Smoothing
- Vertical Landmark Measurements
- Feature Extractor Variants
- Face Debug Visualizer
- WASM Module Node Shims
- WASM Instantiation (SIMD)
- WASM Instantiation (NoSIMD)
- Chrome Extension Manifest
- WASM Exception Info (SIMD)
- WASM Exception Info (NoSIMD)
- Active Extractor & Frame Quality
- TypeScript Config
- Legacy Feature Ridge Model
- Offscreen Gaze Tracker
- Popup Power Controls
- WASM Lazy File FS (SIMD)
- WASM Lazy File FS (NoSIMD)
- Module WASM Instantiation
- Background Tracking Lifecycle
- WASM makeBufferEntry (SIMD)
- WASM abort (Module)
- WASM makeBufferEntry (Module)
- WASM makeBufferEntry (NoSIMD)
- WASM init (SIMD)
- WASM initRuntime (SIMD)
- WASM makeBlendComponent (SIMD)
- WASM makeVertexAttribute (SIMD)
- WASM initRuntime (Module)
- WASM makeBlendComponent (Module)
- WASM makeVertexAttribute (Module)
- WASM init (NoSIMD)
- WASM initRuntime (NoSIMD)
- WASM makeBlendComponent (NoSIMD)
- WASM makeVertexAttribute (NoSIMD)
- WASM getFullscreenElement (SIMD)
- WASM ioctl_tcgets (SIMD)
- WASM makeColorAttachment (SIMD)
- WASM makeColorAttachment (Module)
- WASM getFullscreenElement (NoSIMD)
- WASM ioctl_tcgets (NoSIMD)
- WASM makeColorAttachment (NoSIMD)
- Python Scratch Script
- WASM msync (SIMD)
- WASM syncfs (SIMD)
- WASM msync (NoSIMD)
- WASM syncfs (NoSIMD)
- WASM close (SIMD)
- WASM convertReturnValue (SIMD)
- WASM custom_emscripten_dbgn (SIMD)
- WASM EmscriptenEH (SIMD)
- WASM ExitStatus (SIMD)
- WASM fromWireType (SIMD)
- WASM lookupPath (SIMD)
- WASM makeDepthStencilState (SIMD)
- WASM registerType (SIMD)
- WASM statfs (SIMD)
- WASM convertReturnValue (Module)
- WASM custom_emscripten_dbgn (Module)
- WASM doCallback (Module)
- WASM fullscreenChange (Module)
- WASM makeDepthStencilState (Module)
- WASM registerType (Module)
- WASM close (NoSIMD)
- WASM convertReturnValue (NoSIMD)
- WASM custom_emscripten_dbgn (NoSIMD)
- WASM EmscriptenEH (NoSIMD)
- WASM ExitStatus (NoSIMD)
- WASM fromWireType (NoSIMD)
- WASM lookupPath (NoSIMD)
- WASM makeDepthStencilState (NoSIMD)
- WASM registerType (NoSIMD)
- WASM statfs (NoSIMD)
- Smoothing Idea (Docs)
- WASM getUserMedia (SIMD)
- WASM ioctl (SIMD)
- WASM llseek (SIMD)
- WASM lookup (SIMD)
- WASM mknod (SIMD)
- WASM mount (SIMD)
- WASM readdir (SIMD)
- WASM rename (SIMD)
- WASM rmdir (SIMD)
- WASM symlink (SIMD)
- WASM unlink (SIMD)
- WASM getUserMedia (NoSIMD)
- WASM ioctl (NoSIMD)
- WASM llseek (NoSIMD)
- WASM lookup (NoSIMD)
- WASM mknod (NoSIMD)
- WASM mount (NoSIMD)
- WASM readdir (NoSIMD)
- WASM rename (NoSIMD)
- WASM rmdir (NoSIMD)
- WASM symlink (NoSIMD)
- WASM unlink (NoSIMD)

## God Nodes (most connected - your core abstractions)
1. `ModuleFactory()` - 122 edges
2. `GazeEstimator` - 19 edges
3. `Point2` - 15 edges
4. `renderFace()` - 14 edges
5. `StandardizedRidgeEstimator` - 13 edges
6. `Sample` - 13 edges
7. `ExceptionInfo` - 13 edges
8. `ExceptionInfo` - 13 edges
9. `measure()` - 12 edges
10. `CalibrationSession` - 11 edges

## Surprising Connections (you probably didn't know these)
- `score()` --calls--> `leaveOneDotOut()`  [EXTRACTED]
  test/run.ts → src/core/Validation.ts
- `Face view debug page (debug.html)` --references--> `active.ts activeExtractor switch`  [INFERRED]
  debug.html → VERTICAL-ACCURACY.md
- `Offscreen eye worker (offscreen.html)` --references--> `loadModel extractorName mismatch guard`  [INFERRED]
  offscreen.html → VERTICAL-ACCURACY.md
- `Offscreen eye worker (offscreen.html)` --shares_data_with--> `Frame quality score (blink filtering)`  [INFERRED]
  offscreen.html → VERTICAL-ACCURACY.md
- `Reading Assistant popup (popup.html)` --references--> `Face view debug page (debug.html)`  [INFERRED]
  popup.html → debug.html

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Landmark additions fixing vertical gaze accuracy** — vertical_accuracy_iris_ring_ruler, vertical_accuracy_eye_corner_zero_line, vertical_accuracy_eyelid_openness_feature, vertical_accuracy_face_midline_pitch, vertical_accuracy_verticalleanextractor [EXTRACTED 1.00]
- **Calibration training and validation flow** — calibrate_calibrate_page, vertical_accuracy_standardizedridgeestimator, vertical_accuracy_validation_ts, vertical_accuracy_frame_quality_score, vertical_accuracy_gazeestimator [INFERRED 0.85]
- **Reading Assistant extension pages** — popup_reading_assistant_popup, calibrate_calibrate_page, debug_face_view_page, offscreen_eye_worker_page, permission_enable_camera_page [INFERRED 0.85]

## Communities (103 total, 60 thin omitted)

### Community 3 - "Gaze Calibration & Ridge Model"
Cohesion: 0.05
Nodes (28): advice, againBtn, CalibrationSession, dot, finish(), hud, intro, result (+20 more)

### Community 4 - "Synthetic Face Test Harness"
Cohesion: 0.11
Nodes (29): add(), CAM, Camera, CANTHUS, cross(), EYEBALL_C, gauss(), HEAD_PTS (+21 more)

### Community 5 - "Vertical Accuracy Design Docs"
Cohesion: 0.08
Nodes (22): Calibrate page (calibrate.html), #detail calibration small-print, Face view debug page (debug.html), Offscreen eye worker (offscreen.html), Enable camera permission page (permission.html), Reading Assistant popup (popup.html), Eye-tracking Scholarship Project, active.ts activeExtractor switch (+14 more)

### Community 6 - "npm Package Config"
Cohesion: 0.07
Nodes (26): author, bugs, url, dependencies, @mediapipe/tasks-vision, description, devDependencies, esbuild (+18 more)

### Community 7 - "Gaze Marker & Smoothing"
Cohesion: 0.13
Nodes (8): GazeMarker, marker, smoother, ExponentialSmoother, MedianSmoother, NoSmoother, Smoother, Point2

### Community 8 - "Vertical Landmark Measurements"
Cohesion: 0.18
Nodes (22): at(), CAMERA_ASPECT, centroid(), EYE_L, EYE_R, EyeLandmarks, EYES, hasIris() (+14 more)

### Community 9 - "Feature Extractor Variants"
Cohesion: 0.16
Nodes (9): activeExtractor, FeatureExtractor, IrisRelativeExtractor, LM, RawIrisExtractor, Point, VerticalFullExtractor, VerticalLeanExtractor (+1 more)

### Community 10 - "Face Debug Visualizer"
Cohesion: 0.14
Nodes (17): camState, dots(), drawFace(), faceCv, featTable, fpsEl, LEFT_EYE_RING, LEFT_IRIS (+9 more)

### Community 12 - "WASM Instantiation (SIMD)"
Cohesion: 0.12
Nodes (17): abort(), assert(), assignWasmExports(), createWasm(), receiveInstance(), receiveInstantiationResult(), findWasmBinary(), forceLoadFile() (+9 more)

### Community 13 - "WASM Instantiation (NoSIMD)"
Cohesion: 0.12
Nodes (17): abort(), assert(), assignWasmExports(), createWasm(), receiveInstance(), receiveInstantiationResult(), findWasmBinary(), forceLoadFile() (+9 more)

### Community 14 - "Chrome Extension Manifest"
Cohesion: 0.13
Nodes (14): action, default_popup, background, service_worker, content_scripts, content_security_policy, extension_pages, description (+6 more)

### Community 17 - "Active Extractor & Frame Quality"
Cohesion: 0.20
Nodes (9): @mediapipe/tasks-vision, ACTIVE, activeExtractor, activeFeatureNames, EXTRACTORS, frameQuality(), VERTICAL_FULL_FEATURE_NAMES, VERTICAL_LEAN_FEATURE_NAMES (+1 more)

### Community 18 - "TypeScript Config"
Cohesion: 0.18
Nodes (10): compilerOptions, lib, module, moduleResolution, outDir, skipLibCheck, strict, target (+2 more)

### Community 19 - "Legacy Feature Ridge Model"
Cohesion: 0.29
Nodes (8): dot(), GazeModel, N_FEATURES, Point, predict(), ridge(), solve(), trainModel()

### Community 21 - "Popup Power Controls"
Cohesion: 0.36
Nodes (6): ask(), init(), check(), openTab(), paintPower(), wirePowerButton()

### Community 22 - "WASM Lazy File FS (SIMD)"
Cohesion: 0.31
Nodes (7): createLazyFile(), stream_ops, writeChunks(), get_char(), mmap(), position(), read()

### Community 23 - "WASM Lazy File FS (NoSIMD)"
Cohesion: 0.31
Nodes (7): createLazyFile(), stream_ops, writeChunks(), get_char(), mmap(), position(), read()

### Community 24 - "Module WASM Instantiation"
Cohesion: 0.29
Nodes (8): assignWasmExports(), createWasm(), receiveInstance(), receiveInstantiationResult(), findWasmBinary(), getWasmImports(), locateFile(), updateMemoryViews()

### Community 25 - "Background Tracking Lifecycle"
Cohesion: 0.52
Nodes (6): broadcastToTabs(), ensureOffscreen(), isRunning(), startTracking(), stopTracking(), wantsTracking()

### Community 26 - "WASM makeBufferEntry (SIMD)"
Cohesion: 0.33
Nodes (6): makeBufferEntry(), makeEntries(), makeEntry(), makeSamplerEntry(), makeStorageTextureEntry(), makeTextureEntry()

### Community 27 - "WASM abort (Module)"
Cohesion: 0.33
Nodes (6): abort(), assert(), getBinarySync(), getWasmBinary(), instantiateArrayBuffer(), instantiateAsync()

### Community 28 - "WASM makeBufferEntry (Module)"
Cohesion: 0.33
Nodes (6): makeBufferEntry(), makeEntries(), makeEntry(), makeSamplerEntry(), makeStorageTextureEntry(), makeTextureEntry()

### Community 29 - "WASM makeBufferEntry (NoSIMD)"
Cohesion: 0.33
Nodes (6): makeBufferEntry(), makeEntries(), makeEntry(), makeSamplerEntry(), makeStorageTextureEntry(), makeTextureEntry()

### Community 31 - "WASM initRuntime (SIMD)"
Cohesion: 0.40
Nodes (5): initRuntime(), postRun(), preRun(), run(), doRun()

### Community 32 - "WASM makeBlendComponent (SIMD)"
Cohesion: 0.40
Nodes (5): makeBlendComponent(), makeBlendState(), makeColorState(), makeColorStates(), makeFragmentState()

### Community 33 - "WASM makeVertexAttribute (SIMD)"
Cohesion: 0.40
Nodes (5): makeVertexAttribute(), makeVertexAttributes(), makeVertexBuffer(), makeVertexBuffers(), makeVertexState()

### Community 34 - "WASM initRuntime (Module)"
Cohesion: 0.40
Nodes (5): initRuntime(), postRun(), preRun(), run(), doRun()

### Community 35 - "WASM makeBlendComponent (Module)"
Cohesion: 0.40
Nodes (5): makeBlendComponent(), makeBlendState(), makeColorState(), makeColorStates(), makeFragmentState()

### Community 36 - "WASM makeVertexAttribute (Module)"
Cohesion: 0.40
Nodes (5): makeVertexAttribute(), makeVertexAttributes(), makeVertexBuffer(), makeVertexBuffers(), makeVertexState()

### Community 38 - "WASM initRuntime (NoSIMD)"
Cohesion: 0.40
Nodes (5): initRuntime(), postRun(), preRun(), run(), doRun()

### Community 39 - "WASM makeBlendComponent (NoSIMD)"
Cohesion: 0.40
Nodes (5): makeBlendComponent(), makeBlendState(), makeColorState(), makeColorStates(), makeFragmentState()

### Community 40 - "WASM makeVertexAttribute (NoSIMD)"
Cohesion: 0.40
Nodes (5): makeVertexAttribute(), makeVertexAttributes(), makeVertexBuffer(), makeVertexBuffers(), makeVertexState()

### Community 41 - "WASM getFullscreenElement (SIMD)"
Cohesion: 0.50
Nodes (4): getFullscreenElement(), requestFullscreen(), fullscreenChange(), updateCanvasDimensions()

### Community 42 - "WASM ioctl_tcgets (SIMD)"
Cohesion: 0.50
Nodes (4): ioctl_tcgets(), ioctl_tcsets(), ioctl_tiocgwinsz(), ___syscall_ioctl()

### Community 43 - "WASM makeColorAttachment (SIMD)"
Cohesion: 0.50
Nodes (4): makeColorAttachment(), makeColorAttachments(), makeDepthStencilAttachment(), makeRenderPassDescriptor()

### Community 44 - "WASM makeColorAttachment (Module)"
Cohesion: 0.50
Nodes (4): makeColorAttachment(), makeColorAttachments(), makeDepthStencilAttachment(), makeRenderPassDescriptor()

### Community 45 - "WASM getFullscreenElement (NoSIMD)"
Cohesion: 0.50
Nodes (4): getFullscreenElement(), requestFullscreen(), fullscreenChange(), updateCanvasDimensions()

### Community 46 - "WASM ioctl_tcgets (NoSIMD)"
Cohesion: 0.50
Nodes (4): ioctl_tcgets(), ioctl_tcsets(), ioctl_tiocgwinsz(), ___syscall_ioctl()

### Community 47 - "WASM makeColorAttachment (NoSIMD)"
Cohesion: 0.50
Nodes (4): makeColorAttachment(), makeColorAttachments(), makeDepthStencilAttachment(), makeRenderPassDescriptor()

### Community 49 - "WASM msync (SIMD)"
Cohesion: 0.67
Nodes (3): msync(), put_char(), write()

### Community 50 - "WASM syncfs (SIMD)"
Cohesion: 1.00
Nodes (3): syncfs(), doCallback(), done()

### Community 51 - "WASM msync (NoSIMD)"
Cohesion: 0.67
Nodes (3): msync(), put_char(), write()

### Community 52 - "WASM syncfs (NoSIMD)"
Cohesion: 1.00
Nodes (3): syncfs(), doCallback(), done()

## Knowledge Gaps
- **104 isolated node(s):** `manifest_version`, `name`, `description`, `version`, `permissions` (+99 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 618 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **60 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ModuleFactory()` connect `MediaPipe WASM Module Factory` to `WASM convertReturnValue (Module)`, `WASM custom_emscripten_dbgn (Module)`, `WASM doCallback (Module)`, `WASM fullscreenChange (Module)`, `WASM initRuntime (Module)`, `WASM makeBlendComponent (Module)`, `WASM makeDepthStencilState (Module)`, `WASM makeVertexAttribute (Module)`, `WASM registerType (Module)`, `WASM Module Node Shims`, `WASM makeColorAttachment (Module)`, `Module WASM Instantiation`, `WASM abort (Module)`, `WASM makeBufferEntry (Module)`?**
  _High betweenness centrality (0.141) - this node is a cross-community bridge._
- **Are the 61 inferred relationships involving `ModuleFactory()` (e.g. with `__asyncjs__mediapipe_map_buffer_jspi()` and `BeginGlQueryTiming()`) actually correct?**
  _`ModuleFactory()` has 61 INFERRED edges - model-reasoned connections that need verification._
- **What connects `manifest_version`, `name`, `description` to the rest of the system?**
  _104 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `MediaPipe WASM Runtime (SIMD)` be split into smaller, more focused modules?**
  _Cohesion score 0.010810810810810811 - nodes in this community are weakly interconnected._
- **Why does `ExceptionInfo` connect `WASM Exception Info (SIMD)` to `MediaPipe WASM Runtime (SIMD)`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Should `MediaPipe WASM Runtime (NoSIMD)` be split into smaller, more focused modules?**
  _Cohesion score 0.010869565217391304 - nodes in this community are weakly interconnected._
- **Why does `ExceptionInfo` connect `WASM Exception Info (NoSIMD)` to `MediaPipe WASM Runtime (NoSIMD)`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._