// Adds up YouTube time from content-script heartbeats and stores it per day.
//
// Storage layout and cross-device sync: see common.js.
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
  days[key] = (days[key] || 0) + seconds;
  await chrome.storage.local.set({ days });
  await chrome.storage.session.set({ syncDirty: true });

  // Limits and reminders go by today's time across all devices.
  const usage = await getUsage();
  const after = usage.days[key] || 0;
  const before = after - seconds;
  const { limitMinutes, reminderMinutes } = await getSettings();
  const limit = limitMinutes * 60;
  updateBadge(after, limit);

  if (limit > 0 && before < limit && after >= limit) {
    notifyLimit(limitMinutes);
    return; // don't stack a reminder on top of this one
  }
  const interval = reminderMinutes * 60;
  if (interval > 0 && Math.floor(after / interval) > Math.floor(before / interval)) {
    notifyReminder(Math.floor(after / interval) * interval);
  }
}

// Used for the daily-limit alert. Two channels, because the system
// notification alone is easy to miss: the OS can hide it (macOS notification
// settings, Focus / Do Not Disturb), and nothing tells us. So the alert also
// goes to storage, where the content script shows it as a pop-up on the
// YouTube page itself.
function notify(id, title, message) {
  chrome.notifications.create(id, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message,
    priority: 2,
    requireInteraction: true,
  });
  chrome.storage.local.set({ alert: { id, kind: "popup", title, message, at: Date.now() } });
}

function notifyLimit(limitMinutes) {
  notify(`limit-${dateKey()}`, "Daily YouTube limit reached",
    `You've hit your limit of ${formatDuration(limitMinutes * 60)} for today.`);
}

const QUOTES = [
  ["The key is not to prioritize what's on your schedule, but to schedule your priorities.", "Stephen Covey"],
  ["Lost time is never found again.", "Benjamin Franklin"],
  ["Time is what we want most, but what we use worst.", "William Penn"],
  ["Until we can manage time, we can manage nothing else.", "Peter Drucker"],
  ["Either you run the day or the day runs you.", "Jim Rohn"],
  ["The bad news is time flies. The good news is you're the pilot.", "Michael Altshuler"],
  ["How we spend our days is, of course, how we spend our lives.", "Annie Dillard"],
  ["Don't watch the clock; do what it does. Keep going.", "Sam Levenson"],
  ["You will never find time for anything. If you want time you must make it.", "Charles Buxton"],
  ["It is not that we have a short time to live, but that we waste a lot of it.", "Seneca"],
  ["Time is the most valuable thing a man can spend.", "Theophrastus"],
];

// Break reminders don't use desktop notifications: they cover the YouTube
// page with a full-screen break screen (drawn by content.js) showing a
// time-management quote, until OK is pressed.
function showBreakScreen(id, message) {
  const [quote, author] = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  chrome.storage.local.set({
    alert: { id, kind: "break", title: "Time for a break", message, quote, author, at: Date.now() },
  });
}

// Shown each time today's YouTube time passes another reminder interval
// (every hour by default).
function notifyReminder(seconds) {
  showBreakScreen(`reminder-${dateKey()}-${seconds}`,
    `You've spent ${formatDuration(seconds)} on YouTube today.`);
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
  // "Preview" button in the popup's settings.
  if (msg && msg.type === "preview-break") {
    showBreakScreen(`preview-${Date.now()}`, "This is a preview of your break screen.");
  }
});

async function refreshBadge() {
  const { days } = await getUsage();
  const { limitMinutes } = await getSettings();
  updateBadge(days[dateKey()] || 0, limitMinutes * 60);
}

// --- Cross-device sync -----------------------------------------------------

let deviceIdPromise;
function getDeviceId() {
  deviceIdPromise ??= (async () => {
    let { deviceId } = await chrome.storage.local.get("deviceId");
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      await chrome.storage.local.set({ deviceId });
    }
    return deviceId;
  })();
  return deviceIdPromise;
}

// Publishes this device's time to chrome.storage.sync. Chrome allows about
// 1800 sync writes an hour, so this runs at most once a minute (on the
// alarm below) rather than on every heartbeat.
async function pushToSync() {
  const deviceId = await getDeviceId();
  const { days = {} } = await chrome.storage.local.get("days");
  const cutoff = dateKey(new Date(Date.now() - SYNC_DAYS * 86400 * 1000));
  const d = {};
  let older = 0;
  for (const [day, seconds] of Object.entries(days)) {
    if (day > cutoff) d[day] = Math.round(seconds);
    else older += seconds;
  }
  await chrome.storage.sync.set({
    [DEVICE_PREFIX + deviceId]: {
      d,
      older: Math.round(older),
      since: Object.keys(days).sort()[0] || null,
      pushedAt: Date.now(),
    },
  });
  await chrome.storage.session.set({ syncDirty: false });
}

async function pushIfDirty() {
  const { syncDirty } = await chrome.storage.session.get("syncDirty");
  if (syncDirty) await pushToSync();
}

// Reset pressed on another device: erase this device's time too.
async function applyRemoteReset() {
  const { resetAt = 0 } = await chrome.storage.sync.get("resetAt");
  const { resetSeen = 0 } = await chrome.storage.local.get("resetSeen");
  if (resetAt > resetSeen) {
    await chrome.storage.local.set({ days: {}, resetSeen: resetAt });
  }
}

// Only create the alarm if it's missing: re-creating it on every
// service-worker start would keep pushing it back and it might never fire.
chrome.alarms.get("sync").then((alarm) => {
  if (!alarm) chrome.alarms.create("sync", { periodInMinutes: 1 });
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "sync") queue = queue.then(pushIfDirty).catch(console.error);
});

async function onStart() {
  await applyRemoteReset();
  await pushToSync();
  await refreshBadge();
}

chrome.runtime.onStartup.addListener(() => {
  queue = queue.then(onStart).catch(console.error);
});
chrome.runtime.onInstalled.addListener(() => {
  queue = queue.then(onStart).catch(console.error);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && "resetAt" in changes) {
    queue = queue.then(applyRemoteReset).catch(console.error);
  }
  // Keep the badge right after a reset, a limit change, or new time synced
  // from another device.
  if (area === "sync" || (area === "local" && "days" in changes)) refreshBadge();
});
