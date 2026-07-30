// Runs on the web page. No camera, no MediaPipe here.
// It only receives eye positions and (later) does the reading logic.

export {}; // <- IMPORTANT. Makes esbuild treat this as a module.

let count = 0;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== "GAZE") return;

  // Print about twice a second so the console stays readable.
  count++;
  if (count % 5 === 0) {
    console.log("[eye] x:", msg.x.toFixed(3), " y:", msg.y.toFixed(3));
  }
});

console.log("[eye] content script ready, waiting for eye data...");