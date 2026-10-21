// src/offscreen.ts
// Runs inside the hidden offscreen page.
// The ONLY file that touches the camera and MediaPipe.
//
// TWO Chrome rules matter here:
//  1. An offscreen document may ONLY use chrome.runtime. No chrome.storage.
//     So we ask background.ts for the saved model by message.
//  2. This page is NEVER drawn on screen, so requestAnimationFrame never
//     fires. We drive the loop from the video instead.

import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { activeExtractor } from "./core/active";
import { frameQuality } from "./core/VerticalFeatureExtractor";
import { GazeEstimator } from "./core/GazeEstimator";

class GazeTracker {
  private landmarker: FaceLandmarker | null = null;
  private video: HTMLVideoElement;
  private estimator: GazeEstimator | null = null;

  private lastVideoTime = -1;
  private lastSend = 0;
  private readonly sendEveryMs = 50; // ~20 messages a second

  // Face-point streaming for the debug view. Off unless asked for.
  private streamFace = false;
  private lastFaceSend = 0;
  private readonly faceEveryMs = 66; // ~15 a second is plenty to look at

  // Counters, so we can see what is happening in the console.
  private frames = 0;
  private faces = 0;

  constructor(video: HTMLVideoElement) {
    this.video = video;
    this.listenForModel();
  }

  /**
   * Rebuild a saved calibration, but ONLY if it was trained on the features
   * we are producing now.
   *
   * This guard matters. A saved model is a list of weights, one per feature.
   * Swap the extractor and the old weight list is the wrong length - and
   * because dot() walks the feature list, the extra features get multiplied
   * by `undefined` and every prediction comes out NaN. Nothing would throw;
   * the dot would just quietly stop moving.
   */
  private loadModel(json: any): GazeEstimator | null {
    const est = GazeEstimator.fromJSON(json);
    if (!est) return null;

    if (est.extractorName !== activeExtractor.name) {
      console.warn(
        `[eye] ignoring saved calibration: it was trained on ` +
          `"${est.extractorName || "unknown"}" but we are now producing ` +
          `"${activeExtractor.name}". Please calibrate again.`
      );
      return null;
    }
    return est;
  }

  /** Get the saved calibration from the service worker, and stay updated. */
  private listenForModel(): void {
    chrome.runtime.sendMessage({ type: "GET_MODEL" }, (json: any) => {
      if (chrome.runtime.lastError) return; // worker asleep, no problem
      if (json) {
        this.estimator = this.loadModel(json);
        if (this.estimator) console.log("[eye] loaded saved calibration");
      }
    });

    chrome.runtime.onMessage.addListener((msg: any) => {
      if (msg?.type === "MODEL") {
        if (msg.model == null) {
          // Calibration was cleared from the popup. Drop it here too, or we
          // would keep predicting from a model the user just deleted.
          this.estimator = null;
          console.log("[eye] calibration cleared - predictions stopped");
        } else {
          this.estimator = this.loadModel(msg.model);
          console.log("[eye] calibration updated");
        }
      }

      // The debug face view turns this on and off. Sending 478 points
      // is expensive, so we only do it while somebody is looking.
      if (msg?.type === "FACE_STREAM") {
        this.streamFace = !!msg.on;
        console.log("[eye] face stream:", this.streamFace ? "ON" : "OFF");
      }
    });
  }

  private async loadModel(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(
      chrome.runtime.getURL("wasm")
    );

    this.landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: chrome.runtime.getURL("models/face_landmarker.task"),
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numFaces: 1,
    });

    console.log("[eye] model loaded, using", activeExtractor.describe());
  }

  /** Keep trying until the camera is free. Teams/Zoom may be holding it. */
  private async openCamera(): Promise<void> {
    for (;;) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
        });
        this.video.srcObject = stream;
        await this.video.play();
        chrome.runtime.sendMessage({ type: "CAM_OK" }).catch(() => {});
        console.log("[eye] camera on");
        return;
      } catch (err: any) {
        console.warn("[eye] camera busy (" + err.name + "), retrying...");
        chrome.runtime
          .sendMessage({ type: "CAM_ERROR", name: err.name })
          .catch(() => {});
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  public async start(): Promise<void> {
    console.log("[eye] offscreen starting...");
    await this.loadModel();
    await this.openCamera();
    this.startLoop();
    this.startHeartbeat();
  }

  /**
   * Drive the loop from the CAMERA, not from the screen.
   *
   * requestAnimationFrame is tied to drawing. This page is never drawn,
   * so rAF would fire once and then stop forever.
   * requestVideoFrameCallback fires when a new camera frame is ready.
   */
  private startLoop(): void {
    // A plain timer. Boring on purpose.
    // requestAnimationFrame needs drawing (never happens here).
    // requestVideoFrameCallback needs the video to be rendered (also risky).
    // setInterval depends on nothing. ~30 times a second.
    setInterval(() => {
      try {
        this.processFrame();
      } catch (err) {
        console.error("[eye] frame failed:", err);
      }
    }, 33);
    console.log("[eye] loop started (setInterval 33ms)");
  }

  /** Every 3 seconds, say what is happening. Makes problems obvious. */
  private startHeartbeat(): void {
    setInterval(() => {
      console.log(
        `[eye] frames=${this.frames} faces=${this.faces}` +
          (this.faces === 0 ? "  <-- NO FACE FOUND (light? camera covered?)" : "")
      );
      this.frames = 0;
      this.faces = 0;
    }, 3000);
  }

  private processFrame(): void {
    if (!this.landmarker) return;
    if (this.video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = this.video.currentTime;
    this.frames++;

    const result = this.landmarker.detectForVideo(
      this.video,
      performance.now()
    );

    if (result.faceLandmarks.length === 0) return;
    this.faces++;

    this.handleFace(result.faceLandmarks[0] as any);
  }

  private handleFace(face: any): void {
    const now = performance.now();

    // --- the light message: the feature row, always ---
    if (now - this.lastSend >= this.sendEveryMs) {
      this.lastSend = now;

      const features = activeExtractor.extract(face);

      // How trustworthy is this frame? Near 0 during a blink, or when the two
      // eyes disagree because one was mis-detected. Calibration throws these
      // away - otherwise the model learns that a shut eye means "bottom left".
      const quality = frameQuality(face);

      const msg: any = { type: "GAZE", features, quality };

      if (this.estimator) {
        const p = this.estimator.predict(features);
        msg.sx = p.x;
        msg.sy = p.y;
      }

      chrome.runtime.sendMessage(msg).catch(() => {});
    }

    // --- the heavy message: 478 points, only for the debug view ---
    if (this.streamFace && now - this.lastFaceSend >= this.faceEveryMs) {
      this.lastFaceSend = now;

      // Drop z and round hard. Halves the size, and 3 decimals is far
      // more precision than a 640px picture can show anyway.
      const points = face.map((p: any) => ({
        x: Math.round(p.x * 1000) / 1000,
        y: Math.round(p.y * 1000) / 1000,
      }));

      const features = activeExtractor.extract(face);
      const msg: any = { type: "FACE", points, features, quality: frameQuality(face) };

      if (this.estimator) {
        const p = this.estimator.predict(features);
        msg.sx = p.x;
        msg.sy = p.y;
      }

      chrome.runtime.sendMessage(msg).catch(() => {});
    }
  }
}

const video = document.getElementById("cam") as HTMLVideoElement;
new GazeTracker(video)
  .start()
  .catch((err) => console.error("[eye] offscreen FAILED:", err));