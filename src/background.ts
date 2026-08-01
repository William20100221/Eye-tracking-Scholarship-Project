// src/background.ts
// The service worker. It is the POST OFFICE of the extension.
//
// Why it must be: an offscreen document may only use chrome.runtime, and
// broadcast messages do not reliably reach other extension pages. So the
// worker keeps the newest reading, and pages ASK for it. Asking always works.

export {}; // <- IMPORTANT. Makes esbuild treat this as a module.

const OFFSCREEN_PATH = "offscreen.html";

/** The newest eye reading from the hidden page. */
let latestGaze: any = null;

/** The newest full face (478 points). Only collected while someone watches. */
let latestFace: any = null;

/** Time until which the debug page counts as "watching". */
let watchUntil = 0;
let streaming = false;

/** Counters, so the worker console can prove data is arriving. */
let received = 0;
let asked = 0;

async function ensureOffscreen(): Promise<void> {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType],
  });
  if (existing.length > 0) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ["USER_MEDIA" as chrome.offscreen.Reason],
    justification: "Webcam eye tracking to detect which lines were read.",
  });
  console.log("[eye] offscreen page created");
}

chrome.runtime.onInstalled.addListener(ensureOffscreen);
chrome.runtime.onStartup.addListener(ensureOffscreen);

setInterval(() => {
  console.log(`[eye] worker: gaze received=${received} asked=${asked}`);
  received = 0;
  asked = 0;
}, 5000);

/**
 * Turn the heavy face stream on only while the debug page is open.
 * Sending 478 points many times a second is not free.
 */
setInterval(() => {
  const shouldStream = Date.now() < watchUntil;
  if (shouldStream === streaming) return;

  streaming = shouldStream;
  if (!streaming) latestFace = null;

  chrome.runtime
    .sendMessage({ type: "FACE_STREAM", on: streaming })
    .catch(() => {});
  console.log("[eye] face stream:", streaming ? "ON" : "OFF");
}, 500);

chrome.runtime.onMessage.addListener((msg: any, _sender, sendResponse) => {
  // --- the hidden page asking for the saved calibration ---
  if (msg?.type === "GET_MODEL") {
    chrome.storage.local.get("gazeModel", (r: any) => {
      sendResponse(r.gazeModel ?? null);
    });
    return true; // answer is coming later - keep the channel open
  }

  // --- a page asking for the newest eye reading ---
  if (msg?.type === "GET_LATEST") {
    asked++;
    sendResponse(latestGaze);
    return;
  }

  // --- the debug page saying "I am open" ---
  if (msg?.type === "WATCH_FACE") {
    watchUntil = Date.now() + 2000;
    return;
  }

  // --- the debug page asking for the newest face ---
  if (msg?.type === "GET_FACE") {
    sendResponse(latestFace);
    return;
  }

  // --- the hidden page delivering a full face ---
  if (msg?.type === "FACE") {
    latestFace = msg;
    return;
  }

  // --- the hidden page delivering a new reading ---
  if (msg?.type === "GAZE") {
    received++;
    latestGaze = msg;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab?.id != null) {
        chrome.tabs.sendMessage(tab.id, msg).catch(() => {
          // Extension page or edge:// page - no content script. Fine.
        });
      }
    });
    return;
  }

  if (msg?.type === "START_TRACKING") {
    ensureOffscreen();
  }
});

// When calibration saves a new model, tell the hidden page.
chrome.storage.onChanged.addListener((changes: any) => {
  if (!changes.gazeModel) return;
  chrome.runtime
    .sendMessage({ type: "MODEL", model: changes.gazeModel.newValue })
    .catch(() => {});
});