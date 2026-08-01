// src/popup.ts
// Checks camera permission, toggles the gaze dot, opens the other pages.

export {}; // <- IMPORTANT. Makes esbuild treat this as a module.

function init() {
  const btn = document.getElementById("enable") as HTMLButtonElement | null;
  const dotBtn = document.getElementById("dotBtn") as HTMLButtonElement | null;
  const calBtn = document.getElementById(
    "calibrate"
  ) as HTMLButtonElement | null;
  const dbgBtn = document.getElementById("debug") as HTMLButtonElement | null;
  const statusEl = document.getElementById("status") as HTMLElement | null;
  const calibEl = document.getElementById("calib") as HTMLElement | null;

  if (!btn || !dotBtn || !calBtn || !statusEl || !calibEl) {
    console.error("[eye] popup elements not found");
    return;
  }

  function openTab(page: string) {
    chrome.tabs.create({ url: chrome.runtime.getURL(page) });
    window.close();
  }

  calBtn.addEventListener("click", () => openTab("calibrate.html"));
  if (dbgBtn) dbgBtn.addEventListener("click", () => openTab("debug.html"));

  // ---------- the gaze dot on/off switch ----------

  function paintDotBtn(on: boolean) {
    dotBtn!.textContent = on ? "Gaze dot: on" : "Gaze dot: off";
    dotBtn!.className = on ? "on" : "";
  }

  // Read the current setting. Default is ON.
  chrome.storage.local.get("showDot", (r: any) => {
    paintDotBtn(r.showDot !== false);
  });

  dotBtn.addEventListener("click", () => {
    chrome.storage.local.get("showDot", (r: any) => {
      const next = r.showDot === false; // flip it
      chrome.storage.local.set({ showDot: next });
      paintDotBtn(next);
      // Content scripts notice the change themselves. No reload needed.
    });
  });

  // ---------- calibration info ----------

  chrome.storage.local.get(["gazeModel", "gazeAccuracy"], (r: any) => {
    if (!r.gazeModel) {
      calibEl!.textContent = "Not calibrated yet.";
      return;
    }

    const acc = r.gazeAccuracy;
    calibEl!.textContent = acc
      ? `Calibrated. Vertical error ~${Math.round(acc.errY)} px ` +
        `(${acc.improvement}% better than guessing).`
      : "Calibrated.";
    calBtn!.textContent = "Calibrate again";
  });

  // ---------- camera permission ----------

  async function check() {
    try {
      const perm = await navigator.permissions.query({
        name: "camera" as PermissionName,
      });

      if (perm.state === "granted") {
        statusEl!.textContent = "Eye tracking is on.";
        btn!.textContent = "Tracking active";
        btn!.disabled = true;
        chrome.runtime.sendMessage({ type: "START_TRACKING" });
      } else if (perm.state === "denied") {
        statusEl!.textContent =
          "Camera was blocked. Open browser settings > Camera and allow it.";
        btn!.textContent = "Blocked";
        btn!.disabled = true;
        calBtn!.disabled = true;
      } else {
        statusEl!.textContent = "Camera is off.";
        btn!.onclick = () => openTab("permission.html");
        calBtn!.disabled = true;
      }
    } catch {
      statusEl!.textContent = "Camera is off.";
      btn!.onclick = () => openTab("permission.html");
    }
  }

  check();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}