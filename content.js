// Runs on YouTube pages (after common.js). Every few seconds, tells the
// background worker the page is being watched, but only while the tab is
// actually visible. Once the daily limit is reached and blocking is on, it
// covers the page and pauses playback instead.
const HEARTBEAT_MS = 5000;
const OVERLAY_ID = "ytt-limit-overlay";

function isVideoPlaying() {
  const video = document.querySelector("video");
  return !!video && !video.paused && !video.ended;
}

async function isBlocked() {
  const { limitMinutes, blockWhenOver } = await getSettings();
  if (!blockWhenOver || limitMinutes <= 0) return false;
  const { days = {} } = await chrome.storage.local.get("days");
  return (days[dateKey()] || 0) >= limitMinutes * 60;
}

function showOverlay(limitMinutes) {
  document.querySelectorAll("video").forEach((v) => v.pause());
  if (document.getElementById(OVERLAY_ID)) return;

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.style.cssText = [
    "position:fixed", "inset:0", "z-index:2147483647", "display:flex",
    "flex-direction:column", "align-items:center", "justify-content:center",
    "gap:12px", "background:#0f0f0f", "color:#f1f1f1",
    "font:16px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
    "text-align:center", "padding:24px",
  ].join(";");
  const title = document.createElement("div");
  title.style.cssText = "font-size:28px;font-weight:700";
  title.textContent = "Daily YouTube limit reached";
  const body = document.createElement("div");
  body.style.cssText = "color:#aaa;max-width:420px";
  body.textContent = `You've used your ${formatDuration(limitMinutes * 60)} for today. YouTube unlocks again tomorrow, or you can raise the limit from the extension's popup.`;
  overlay.append(title, body);
  document.documentElement.appendChild(overlay);
}

function hideOverlay() {
  document.getElementById(OVERLAY_ID)?.remove();
}

// Shows or hides the block screen; returns whether YouTube is blocked.
async function updateBlock() {
  if (await isBlocked()) {
    showOverlay((await getSettings()).limitMinutes);
    return true;
  }
  hideOverlay();
  return false;
}

async function tick() {
  try {
    // Time spent looking at the block screen doesn't count.
    if (await updateBlock()) return;
    if (document.visibilityState !== "visible") return;
    await chrome.runtime.sendMessage({ type: "heartbeat", playing: isVideoPlaying() });
  } catch {
    // Extension was reloaded or updated; this old content script is orphaned.
    clearInterval(timer);
  }
}

const timer = setInterval(tick, HEARTBEAT_MS);
tick();
// React straight away when the limit is hit or the settings change.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && ("days" in changes || "settings" in changes)) updateBlock().catch(() => {});
});
