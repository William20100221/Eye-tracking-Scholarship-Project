// Runs in the background, independent of any webpage.
// Right now it just logs when the extension is installed.

chrome.runtime.onInstalled.addListener(() => {
  console.log("Reading Comprehension Assistant installed");
});