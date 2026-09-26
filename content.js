// Runs on YouTube pages. Every few seconds, tells the background worker the
// page is being watched, but only while the tab is actually visible.
const HEARTBEAT_MS = 5000;

function isVideoPlaying() {
  const video = document.querySelector("video");
  return !!video && !video.paused && !video.ended;
}

function beat() {
  if (document.visibilityState !== "visible") return;
  chrome.runtime.sendMessage({ type: "heartbeat", playing: isVideoPlaying() }).catch(() => {
    // Extension was reloaded or updated; this old content script is orphaned.
    clearInterval(timer);
  });
}

const timer = setInterval(beat, HEARTBEAT_MS);
