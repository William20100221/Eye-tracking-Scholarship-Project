// The popup cannot ask for the camera - it closes when the permission box
// appears. So it just opens a real tab that CAN ask.

const btn = document.getElementById("enable") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLElement;

btn.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("permission.html") });
  statusEl.textContent = "Opened the camera page.";
});
