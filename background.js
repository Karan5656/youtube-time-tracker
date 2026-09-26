// Adds up YouTube time from content-script heartbeats and stores it per day.
//
// Storage layout (chrome.storage.local):
//   days: { "YYYY-MM-DD": seconds, ... }
//
// A heartbeat arrives every ~5s from each visible YouTube tab. Rather than
// adding a fixed 5s per heartbeat (which would double count two visible
// YouTube windows), we credit the wall-clock time since the previous
// heartbeat, capped at MAX_GAP_S so gaps (tab hidden, browser closed) are
// never counted.

const MAX_GAP_S = 6;
const IDLE_THRESHOLD_S = 120;

chrome.idle.setDetectionInterval(IDLE_THRESHOLD_S);

function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function addTime(seconds) {
  const key = dateKey();
  const { days = {} } = await chrome.storage.local.get("days");
  days[key] = (days[key] || 0) + seconds;
  await chrome.storage.local.set({ days });
  updateBadge(days[key]);
}

function updateBadge(todaySeconds) {
  const minutes = Math.floor(todaySeconds / 60);
  const text = minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`;
  chrome.action.setBadgeText({ text: todaySeconds > 0 ? text : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#cc0000" });
}

// Serialize heartbeats so concurrent read-modify-write cycles can't lose time.
let queue = Promise.resolve();

async function handleHeartbeat(playing) {
  // Away from the keyboard and nothing playing: don't count it.
  const state = await chrome.idle.queryState(IDLE_THRESHOLD_S);
  if (state !== "active" && !playing) return;

  const now = Date.now();
  // Session storage survives service-worker restarts but not browser restarts.
  const { lastBeat } = await chrome.storage.session.get("lastBeat");
  await chrome.storage.session.set({ lastBeat: now });

  // First heartbeat after a gap: credit one interval's worth.
  const elapsed = lastBeat ? (now - lastBeat) / 1000 : 5;
  const credit = Math.min(Math.max(elapsed, 0), MAX_GAP_S);
  if (credit > 0) await addTime(credit);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "heartbeat") {
    queue = queue.then(() => handleHeartbeat(!!msg.playing)).catch(console.error);
  }
});

async function refreshBadge() {
  const { days = {} } = await chrome.storage.local.get("days");
  updateBadge(days[dateKey()] || 0);
}

chrome.runtime.onStartup.addListener(refreshBadge);
chrome.runtime.onInstalled.addListener(refreshBadge);
chrome.storage.onChanged.addListener((changes, area) => {
  // Keep the badge right after a reset from the popup.
  if (area === "local" && "days" in changes) refreshBadge();
});
