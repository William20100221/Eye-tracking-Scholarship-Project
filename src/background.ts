// The service worker. Two jobs:
//  1. create the hidden offscreen page
//  2. pass eye positions from that page to the content script

const OFFSCREEN_PATH = "offscreen.html";

async function ensureOffscreen() {
  // Don't create it twice.
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

// Start when the extension loads, and when Chrome starts.
chrome.runtime.onInstalled.addListener(ensureOffscreen);
chrome.runtime.onStartup.addListener(ensureOffscreen);

// Relay: hidden page -> content script of the tab the user is looking at.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === "GAZE") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab?.id != null) {
        chrome.tabs.sendMessage(tab.id, msg).catch(() => {
          // Tab has no content script (e.g. chrome:// page). Ignore.
        });
      }
    });
  }

  if (msg?.type === "START_TRACKING") {
    ensureOffscreen();
  }
});