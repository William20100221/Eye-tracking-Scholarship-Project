// Runs on a REAL tab, so the Chrome permission box can appear properly.
// A popup would close and cancel the request.

export {}; // <- IMPORTANT. Makes esbuild treat this as a module.

function init() {
  const btn = document.getElementById("enable") as HTMLButtonElement | null;
  const msg = document.getElementById("msg") as HTMLElement | null;

  if (!btn || !msg) {
    console.error("[eye] button or msg element not found in permission.html");
    return;
  }

  console.log("[eye] permission page ready");

  btn.addEventListener("click", async () => {
    msg.className = "";
    msg.textContent = "Asking...";

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });

      // We only wanted the permission. Release the camera again.
      stream.getTracks().forEach((t) => t.stop());

      msg.textContent = "Camera allowed. You can close this tab.";
      chrome.runtime.sendMessage({ type: "START_TRACKING" });
    } catch (err: any) {
      msg.className = "err";

      if (err.name === "NotReadableError") {
        msg.textContent =
          "The camera is being used by another app (Teams, Zoom...). " +
          "Close it and try again.";
      } else if (err.name === "NotAllowedError") {
        msg.textContent =
          "Permission was refused. Click the camera icon in the address bar " +
          "and choose Allow.";
      } else if (err.name === "NotFoundError") {
        msg.textContent = "No camera was found on this computer.";
      } else {
        msg.textContent = "Error: " + err.name + " - " + err.message;
      }

      console.error(err);
    }
  });
}

// Run now if the page is ready, otherwise wait for it.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}