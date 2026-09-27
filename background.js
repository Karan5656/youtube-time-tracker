// Adds up YouTube time from content-script heartbeats and stores it per day.
//
// Storage layout (chrome.storage.local):
//   days: { "YYYY-MM-DD": seconds, ... }
//   settings: { limitMinutes, blockWhenOver }  (see common.js for defaults)
//
// A heartbeat arrives every ~5s from each visible YouTube tab. Rather than
// adding a fixed 5s per heartbeat (which would double count two visible
// YouTube windows), we credit the wall-clock time since the previous
// heartbeat, capped at MAX_GAP_S so gaps (tab hidden, browser closed) are
// never counted.

importScripts("common.js");

const MAX_GAP_S = 6;
const IDLE_THRESHOLD_S = 120;

chrome.idle.setDetectionInterval(IDLE_THRESHOLD_S);

async function addTime(seconds) {
  const key = dateKey();
  const { days = {} } = await chrome.storage.local.get("days");
  const before = days[key] || 0;
  days[key] = before + seconds;
  await chrome.storage.local.set({ days });

  const { limitMinutes } = await getSettings();
  const limit = limitMinutes * 60;
  updateBadge(days[key], limit);

  if (limit > 0 && before < limit && days[key] >= limit) {
    notifyLimit(limitMinutes);
    return; // don't stack an hourly reminder on top of this one
  }
  const hours = Math.floor(days[key] / 3600);
  if (hours > Math.floor(before / 3600)) notifyHour(hours);
}

function notifyLimit(limitMinutes) {
  chrome.notifications.create(`limit-${dateKey()}`, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "Daily YouTube limit reached",
    message: `You've hit your limit of ${formatDuration(limitMinutes * 60)} for today.`,
    priority: 2,
    requireInteraction: true,
  });
}

// Shown each time today's YouTube time crosses another full hour.
function notifyHour(hours) {
  chrome.notifications.create(`hour-${dateKey()}-${hours}`, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "Time for a break?",
    message: `You've spent ${hours} hour${hours === 1 ? "" : "s"} on YouTube today.`,
    priority: 2,
    requireInteraction: true,
  });
}

// Grey while under the daily limit, red once it's reached (or always red
// when no limit is set).
function updateBadge(todaySeconds, limitSeconds) {
  const minutes = Math.floor(todaySeconds / 60);
  const text = minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`;
  const under = limitSeconds > 0 && todaySeconds < limitSeconds;
  chrome.action.setBadgeText({ text: todaySeconds > 0 ? text : "" });
  chrome.action.setBadgeBackgroundColor({ color: under ? "#606060" : "#cc0000" });
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
  const { limitMinutes } = await getSettings();
  updateBadge(days[dateKey()] || 0, limitMinutes * 60);
}

chrome.runtime.onStartup.addListener(refreshBadge);
chrome.runtime.onInstalled.addListener(refreshBadge);
chrome.storage.onChanged.addListener((changes, area) => {
  // Keep the badge right after a reset or a limit change from the popup.
  if (area === "local" && ("days" in changes || "settings" in changes)) refreshBadge();
});
