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

/** Is the offscreen page - and therefore the camera - alive right now? */
async function isRunning(): Promise<boolean> {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType],
  });
  return existing.length > 0;
}

/**
 * Has the user asked for tracking to be on?
 *
 * Kept in storage rather than in a variable, because this service worker gets
 * killed and restarted constantly. A variable would forget the user's choice
 * within about thirty seconds and the camera would switch itself back on.
 * Default is on, so nothing changes for someone who never touches the button.
 */
async function wantsTracking(): Promise<boolean> {
  const r = await chrome.storage.local.get("trackingOn");
  return r.trackingOn !== false;
}

async function ensureOffscreen(): Promise<void> {
  // Respect the off switch. Without this check the page would come back to
  // life on the next browser restart, or the next time anything called this.
  if (!(await wantsTracking())) {
    console.log("[eye] not starting: tracking is switched off");
    return;
  }
  if (await isRunning()) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ["USER_MEDIA" as chrome.offscreen.Reason],
    justification: "Webcam eye tracking to detect which lines were read.",
  });
  console.log("[eye] offscreen page created");
}

/** Send something to the content script in every tab that has one. */
function broadcastToTabs(msg: any): void {
  chrome.tabs.query({}, (tabs) => {
    for (const t of tabs) {
      if (t.id != null) chrome.tabs.sendMessage(t.id, msg).catch(() => {});
    }
  });
}

/**
 * Really stop. Not "stop drawing the dot" - stop.
 *
 * Closing the offscreen document is what actually releases the webcam and
 * turns its light off. The camera belongs to that page, so while the page
 * exists the camera stays open no matter what else we switch off.
 */
async function stopTracking(): Promise<void> {
  await chrome.storage.local.set({ trackingOn: false });

  if (await isRunning()) {
    try {
      await chrome.offscreen.closeDocument();
      console.log("[eye] offscreen page closed, camera released");
    } catch (err) {
      console.warn("[eye] could not close offscreen page:", err);
    }
  }

  // Throw away stale readings so nothing can serve them to a page later.
  latestGaze = null;
  latestFace = null;
  broadcastToTabs({ type: "TRACKING_OFF" });
}

async function startTracking(): Promise<void> {
  await chrome.storage.local.set({ trackingOn: true });
  await ensureOffscreen();
}

chrome.runtime.onInstalled.addListener(() => {
  ensureOffscreen();
});
chrome.runtime.onStartup.addListener(() => {
  ensureOffscreen();
});

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

  // --- the popup's power switch ---

  if (msg?.type === "START_TRACKING") {
    startTracking().then(() => sendResponse({ ok: true }));
    return true; // answer is coming later - keep the channel open
  }

  if (msg?.type === "STOP_TRACKING") {
    stopTracking().then(() => sendResponse({ ok: true }));
    return true;
  }

  // --- the popup asking what to draw on its buttons ---
  if (msg?.type === "GET_STATE") {
    (async () => {
      sendResponse({ wanted: await wantsTracking(), running: await isRunning() });
    })();
    return true;
  }

  // --- the popup throwing away every saved calibration ---
  if (msg?.type === "CLEAR_CALIBRATION") {
    chrome.storage.local.remove(["gazeModel", "gazeAccuracy"], () => {
      // The storage listener below tells the hidden page to drop the model
      // it is holding in memory. Without that it would keep predicting from
      // the deleted calibration until the browser restarted.
      broadcastToTabs({ type: "TRACKING_OFF" }); // nothing left to point at
      console.log("[eye] calibration cleared");
      sendResponse({ ok: true });
    });
    return true;
  }
});

// When calibration saves a new model - or clears it - tell the hidden page.
chrome.storage.onChanged.addListener((changes: any) => {
  if (!changes.gazeModel) return;
  // On a delete, newValue is undefined. Send null so the hidden page can tell
  // "cleared" apart from "no message arrived".
  const model = changes.gazeModel.newValue ?? null;
  chrome.runtime.sendMessage({ type: "MODEL", model }).catch(() => {});
});