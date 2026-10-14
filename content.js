// Runs on YouTube pages (after common.js). Every few seconds, tells the
// background worker the page is being watched, but only while the tab is
// actually visible or its video is playing in picture-in-picture. Once the
// daily limit is reached and blocking is on, it covers the page and pauses
// playback instead. It also draws the break screen and the limit pop-up.
const HEARTBEAT_MS = 5000;
const OVERLAY_ID = "ytt-limit-overlay";
const POPUP_ID = "ytt-alert-popup";
const ALERT_MAX_AGE_MS = 10 * 60 * 1000; // don't show stale reminders

function isVideoPlaying() {
  const video = document.querySelector("video");
  return !!video && !video.paused && !video.ended;
}

// A video popped out into a picture-in-picture window stays on screen while
// you use other tabs. Covers the browser's own PiP (which PiP extensions
// use) and the newer Document PiP window.
function isPictureInPicturePlaying() {
  const pip = document.pictureInPictureElement;
  if (pip) return !pip.paused && !pip.ended;
  const pipWindow = window.documentPictureInPicture?.window;
  if (pipWindow) {
    const video = pipWindow.document.querySelector("video") || document.querySelector("video");
    return !!video && !video.paused && !video.ended;
  }
  return false;
}

async function isBlocked() {
  const { limitMinutes, blockWhenOver } = await getSettings();
  if (!blockWhenOver || limitMinutes <= 0) return false;
  const { days } = await getUsage();
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

// --- Break screen and limit pop-up ------------------------------------------

function removePopup() {
  document.getElementById(POPUP_ID)?.remove();
}

const BREAK_HTML = `
    <style>
      .screen { position: fixed; inset: 0; z-index: 2147483646; display: flex; align-items: center;
        justify-content: center; padding: 24px; background: #0f0f0f; color: #f1f1f1;
        font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; animation: in .3s ease-out; }
      @keyframes in { from { opacity: 0; } }
      .card { max-width: 560px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 18px; }
      .title { font-size: 15px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #ff4e45; }
      .msg { color: #aaa; margin-top: -10px; }
      blockquote { margin: 8px 0 0; font-size: 30px; line-height: 1.3; font-weight: 600; letter-spacing: -.01em; }
      blockquote::before { content: "“"; display: block; font-size: 64px; line-height: .6; color: #ff4e45; margin-bottom: 8px; }
      .author { color: #aaa; font-size: 15px; }
      .author::before { content: "— "; }
      button { margin-top: 12px; font: inherit; font-weight: 700; border: 0; border-radius: 24px;
        padding: 11px 36px; background: #cc0000; color: #fff; cursor: pointer; }
      button:hover { background: #e00000; }
      button:focus-visible { outline: 3px solid #fff; outline-offset: 3px; }
    </style>
    <div class="screen" role="alertdialog" aria-labelledby="t" aria-describedby="q">
      <div class="card">
        <div class="title" id="t"></div>
        <div class="msg"></div>
        <blockquote id="q"></blockquote>
        <div class="author"></div>
        <button type="button">OK</button>
      </div>
    </div>`;

function showPopup(alert) {
  removePopup();
  const host = document.createElement("div");
  host.id = POPUP_ID;
  host.dataset.alertId = alert.id;
  // Shadow DOM keeps YouTube's styles out and ours in.
  const root = host.attachShadow({ mode: "open" });
  if (alert.kind === "break") {
    root.innerHTML = BREAK_HTML;
    root.querySelector("blockquote").textContent = alert.quote;
    root.querySelector(".author").textContent = alert.author;
    // The break screen stops the video; it's up to you to start it again.
    document.querySelectorAll("video").forEach((v) => v.pause());
  } else root.innerHTML = `
    <style>
      .box { position: fixed; top: 72px; right: 24px; z-index: 2147483646; width: 320px;
        background: #fff; color: #0f0f0f; border-radius: 14px; padding: 16px 16px 14px;
        box-shadow: 0 8px 28px rgba(0,0,0,.28); border-left: 5px solid #cc0000;
        font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        animation: in .25s ease-out; }
      @media (prefers-color-scheme: dark) { .box { background: #212121; color: #f1f1f1; } .msg { color: #bbb; } }
      @keyframes in { from { opacity: 0; transform: translateY(-8px); } }
      .title { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
      .msg { color: #555; margin-bottom: 12px; }
      button { font: inherit; font-weight: 600; border: 0; border-radius: 18px; padding: 7px 16px;
        background: #cc0000; color: #fff; cursor: pointer; }
      button:hover { background: #a80000; }
    </style>
    <div class="box" role="alertdialog" aria-labelledby="t">
      <div class="title" id="t"></div>
      <div class="msg"></div>
      <button type="button">OK</button>
    </div>`;
  root.querySelector(".title").textContent = alert.title;
  root.querySelector(".msg").textContent = alert.message;
  // Dismissing it here dismisses it in every YouTube tab.
  const ok = root.querySelector("button");
  ok.addEventListener("click", () => {
    removePopup();
    chrome.storage.local.set({ alertDismissed: alert.id }).catch(() => {});
  });
  popupParent().appendChild(host);
  if (alert.kind === "break") ok.focus();
}

function isBreakScreenUp() {
  return !!document.getElementById(POPUP_ID)?.shadowRoot?.querySelector(".screen");
}

// In fullscreen only the fullscreen element is drawn, so the pop-up has to
// live inside it (YouTube's player) to be seen.
function popupParent() {
  return document.fullscreenElement || document.documentElement;
}

document.addEventListener("fullscreenchange", () => {
  const host = document.getElementById(POPUP_ID);
  if (host) popupParent().appendChild(host);
});

// Shows the latest alert if it's recent and not dismissed. The break screen
// goes up in every YouTube tab at once (so a picture-in-picture video in a
// background tab pauses too); the limit pop-up only in a tab that's on
// screen, and a background tab picks it up when you return.
async function syncPopup() {
  const { alert, alertDismissed } = await chrome.storage.local.get(["alert", "alertDismissed"]);
  const current = document.getElementById(POPUP_ID)?.dataset.alertId;
  if (!alert || alert.id === alertDismissed || Date.now() - alert.at > ALERT_MAX_AGE_MS) {
    if (current) removePopup();
    return;
  }
  const onScreen = document.visibilityState === "visible" || alert.kind === "break";
  if (onScreen && current !== alert.id) showPopup(alert);
}

document.addEventListener("visibilitychange", () => syncPopup().catch(() => {}));

async function tick() {
  try {
    // Time spent looking at the block or break screen doesn't count.
    if (await updateBlock()) return;
    if (isBreakScreenUp()) return;
    if (document.visibilityState !== "visible" && !isPictureInPicturePlaying()) return;
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
  if (area === "sync" || (area === "local" && "days" in changes)) updateBlock().catch(() => {});
  if (area === "local" && ("alert" in changes || "alertDismissed" in changes)) syncPopup().catch(() => {});
});
