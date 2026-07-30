// The popup checks whether we already have camera permission.
//  - already granted -> just start tracking, no tab
//  - not yet asked    -> open the permission tab (a popup cannot ask)
//  - refused before   -> tell the user how to undo it

export {}; // <- IMPORTANT. Makes esbuild treat this as a module.

function init() {
  const btn = document.getElementById("enable") as HTMLButtonElement | null;
  const statusEl = document.getElementById("status") as HTMLElement | null;

  if (!btn || !statusEl) {
    console.error("[eye] popup elements not found");
    return;
  }

  function openPermissionTab() {
    chrome.tabs.create({ url: chrome.runtime.getURL("permission.html") });
    window.close();
  }

  async function check() {
    try {
      const perm = await navigator.permissions.query({
        name: "camera" as PermissionName,
      });

      if (perm.state === "granted") {
        // We already have it. Start straight away.
        statusEl!.textContent = "Eye tracking is on.";
        btn!.textContent = "Tracking active";
        btn!.disabled = true;
        chrome.runtime.sendMessage({ type: "START_TRACKING" });
      } else if (perm.state === "denied") {
        statusEl!.textContent =
          "Camera was blocked. Open browser settings > Camera and allow " +
          "this extension.";
        btn!.textContent = "Blocked";
        btn!.disabled = true;
      } else {
        // "prompt" - never asked yet.
        statusEl!.textContent = "Camera is off.";
        btn!.textContent = "Enable eye tracking";
        btn!.disabled = false;
        btn!.onclick = openPermissionTab;
      }
    } catch {
      // Some browsers cannot query "camera". Fall back to asking.
      statusEl!.textContent = "Camera is off.";
      btn!.onclick = openPermissionTab;
    }
  }

  check();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}