// Shared by the background worker, the content script and the popup.
//
// Where data lives:
//   chrome.storage.local  days: { "YYYY-MM-DD": seconds }  this device's own time
//                         deviceId, resetSeen
//   chrome.storage.sync   dev_<deviceId>: { d, older, since, pushedAt }
//                           each device's recent days (last SYNC_DAYS), with
//                           anything older rolled up into `older`
//                         settings: { limitMinutes, blockWhenOver, reminderMinutes }
//                         resetAt: when Reset was last pressed on any device
//
// Every device only ever writes its own dev_ item, so devices never
// overwrite each other's time. Chrome sync needs the person signed in to
// Chrome with sync on; without it, chrome.storage.sync just stays local.

const DEFAULT_SETTINGS = {
  limitMinutes: 120, // daily limit; 0 turns it off
  blockWhenOver: false, // cover YouTube once the limit is reached
  reminderMinutes: 60, // break reminder every N minutes of watching; 0 turns it off
};

const DEVICE_PREFIX = "dev_";
const SYNC_DAYS = 90;

function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function getSettings() {
  const { settings = {} } = await chrome.storage.sync.get("settings");
  return { ...DEFAULT_SETTINGS, ...settings };
}

async function saveSettings(patch) {
  const settings = await getSettings();
  await chrome.storage.sync.set({ settings: { ...settings, ...patch } });
}

// Combined YouTube time across devices: this device's own record (always the
// freshest) plus the latest copy every other device has synced.
async function getUsage() {
  const { days = {}, deviceId } = await chrome.storage.local.get(["days", "deviceId"]);
  const synced = await chrome.storage.sync.get(null);
  const resetAt = synced.resetAt || 0;

  const combined = { ...days };
  let older = 0;
  let since = Object.keys(days).sort()[0];
  let devices = 1;
  for (const [key, item] of Object.entries(synced)) {
    if (!key.startsWith(DEVICE_PREFIX) || key === DEVICE_PREFIX + deviceId) continue;
    if ((item.pushedAt || 0) < resetAt) continue; // from before the last Reset
    devices++;
    for (const [day, seconds] of Object.entries(item.d || {})) {
      combined[day] = (combined[day] || 0) + seconds;
    }
    older += item.older || 0;
    if (item.since && (!since || item.since < since)) since = item.since;
  }
  const total = older + Object.values(combined).reduce((a, b) => a + b, 0);
  return { days: combined, total, since, devices };
}

// Erases tracked time on this device and, through sync, on every other one.
async function resetEverywhere() {
  const now = Date.now();
  await chrome.storage.local.set({ days: {}, resetSeen: now });
  const synced = await chrome.storage.sync.get(null);
  await chrome.storage.sync.remove(Object.keys(synced).filter((k) => k.startsWith(DEVICE_PREFIX)));
  await chrome.storage.sync.set({ resetAt: now });
}

function formatDuration(seconds) {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${s % 60}s`;
}
