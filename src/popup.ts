// src/popup.ts
// Checks camera permission, starts and stops tracking, toggles the gaze dot,
// clears saved calibrations, opens the other pages.

export {}; // <- IMPORTANT. Makes esbuild treat this as a module.

/** Ask the service worker something and wait for its reply. */
async function ask(msg: any): Promise<any> {
  try {
    return await chrome.runtime.sendMessage(msg);
  } catch {
    // The worker was asleep and the message went nowhere. Not an error worth
    // showing anyone - the caller decides what to do with undefined.
    return undefined;
  }
}

function init() {
  const btn = document.getElementById("enable") as HTMLButtonElement | null;
  const dotBtn = document.getElementById("dotBtn") as HTMLButtonElement | null;
  const calBtn = document.getElementById(
    "calibrate"
  ) as HTMLButtonElement | null;
  const dbgBtn = document.getElementById("debug") as HTMLButtonElement | null;
  const clearBtn = document.getElementById(
    "clearCal"
  ) as HTMLButtonElement | null;
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

  function paintCalibration() {
    chrome.storage.local.get(["gazeModel", "gazeAccuracy"], (r: any) => {
      if (!r.gazeModel) {
        calibEl!.textContent = "Not calibrated yet.";
        calBtn!.textContent = "Calibrate";
        if (clearBtn) clearBtn.disabled = true;
        return;
      }

      const acc = r.gazeAccuracy;
      calibEl!.textContent = acc
        ? `Calibrated. Vertical error ~${Math.round(acc.errY)} px ` +
          `(${acc.improvement}% better than guessing).`
        : "Calibrated.";
      calBtn!.textContent = "Calibrate again";
      if (clearBtn) clearBtn.disabled = false;
    });
  }

  paintCalibration();

  // ---------- clear all saved calibrations ----------

  // Two clicks, not one. There is no undo, and this button sits directly
  // below "Calibrate" where a misclick is easy.
  let armed = false;

  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      if (!armed) {
        armed = true;
        clearBtn.textContent = "Really clear? Click again";
        clearBtn.classList.add("confirm");
        // Disarm on its own, so a forgotten popup is not left loaded.
        setTimeout(() => {
          if (!armed) return;
          armed = false;
          clearBtn.textContent = "Clear all calibrations";
          clearBtn.classList.remove("confirm");
        }, 4000);
        return;
      }

      armed = false;
      clearBtn.classList.remove("confirm");
      clearBtn.disabled = true;
      clearBtn.textContent = "Clearing...";

      await ask({ type: "CLEAR_CALIBRATION" });

      clearBtn.textContent = "Clear all calibrations";
      calibEl!.textContent = "Calibration cleared. The dot stops until you calibrate again.";
      paintCalibration();
    });
  }

  // ---------- the power switch ----------

  /** The popup's idea of whether the camera is running. */
  let running = false;

  function paintPower() {
    btn!.disabled = false;
    btn!.textContent = running ? "Stop eye tracking" : "Start eye tracking";
    btn!.className = running ? "running" : "stopped";
    statusEl!.textContent = running
      ? "Eye tracking is on. The camera is in use."
      : "Stopped. The camera is released.";
  }

  async function wirePowerButton() {
    const state = await ask({ type: "GET_STATE" });

    // If the worker never answered, fall back to the stored preference.
    // Guessing "running" would be worse: the button would claim the camera is
    // on when it is not.
    const wanted = state ? state.wanted : true;
    running = state ? state.running : false;

    // Opening the popup revives tracking if the user wants it and the worker
    // had been asleep. It must NOT revive it if the user pressed stop - which
    // is the whole reason the preference is stored rather than assumed.
    if (wanted && !running) {
      await ask({ type: "START_TRACKING" });
      running = true;
    }

    paintPower();

    btn!.onclick = async () => {
      btn!.disabled = true;
      btn!.textContent = running ? "Stopping..." : "Starting...";
      await ask({ type: running ? "STOP_TRACKING" : "START_TRACKING" });
      running = !running;
      paintPower();
    };
  }

  // ---------- camera permission ----------

  async function check() {
    try {
      const perm = await navigator.permissions.query({
        name: "camera" as PermissionName,
      });

      if (perm.state === "granted") {
        wirePowerButton();
      } else if (perm.state === "denied") {
        statusEl!.textContent =
          "Camera was blocked. Open browser settings > Camera and allow it.";
        btn!.textContent = "Blocked";
        btn!.disabled = true;
        calBtn!.disabled = true;
      } else {
        statusEl!.textContent = "Camera is off.";
        btn!.textContent = "Enable eye tracking";
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