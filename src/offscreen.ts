// Runs inside the hidden offscreen page.
// This is the ONLY file that touches the camera and MediaPipe.

import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// The two iris (eye centre) points in MediaPipe's 478 face points.
const LEFT_IRIS = 468;
const RIGHT_IRIS = 473;

async function start() {
  console.log("[eye] offscreen starting...");

  const vision = await FilesetResolver.forVisionTasks(
    chrome.runtime.getURL("wasm")
  );

  const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: chrome.runtime.getURL("models/face_landmarker.task"),
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numFaces: 1,
  });
  console.log("[eye] model loaded");

  // Camera. No permission popup here - the popup page already asked.
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });

  const video = document.getElementById("cam") as HTMLVideoElement;
  video.srcObject = stream;
  await video.play();
  console.log("[eye] camera on");

  let lastTime = -1;
  let lastSend = 0;

  function loop() {
    if (video.currentTime !== lastTime) {
      lastTime = video.currentTime;

      const result = faceLandmarker.detectForVideo(video, performance.now());

      if (result.faceLandmarks.length > 0) {
        const face = result.faceLandmarks[0];
        const left = face[LEFT_IRIS];
        const right = face[RIGHT_IRIS];

        // Average of both eyes. Range 0..1. Not screen pixels yet.
        const x = (left.x + right.x) / 2;
        const y = (left.y + right.y) / 2;

        // Send about 10 times a second. Sending every frame floods Chrome.
        const now = performance.now();
        if (now - lastSend > 100) {
          lastSend = now;
          chrome.runtime.sendMessage({ type: "GAZE", x, y });
        }
      }
    }

    requestAnimationFrame(loop);
  }

  loop();
}

start().catch((err) => console.error("[eye] offscreen FAILED:", err));