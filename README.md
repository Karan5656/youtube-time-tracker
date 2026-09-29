# YouTube Time Tracker

A Chrome extension (Manifest V3) that tracks how much time you spend on YouTube.

The toolbar badge shows today's time. The popup shows today's time against
your daily limit, this week's total and daily average, your all-time total,
and a chart of the last 7 days. The gear icon opens the settings.

## Break reminders

A desktop notification pops up each time today's YouTube time passes another
reminder interval: every hour by default, or every 15, 30 or 45 minutes, 1.5 or
2 hours, or never, as set under **Settings > Break reminders**. It stays on
screen until you dismiss it.

If reminders never show up, press **Send a test** in the same section. If the
test doesn't appear either, allow notifications for Google Chrome in your
computer's system settings (on a Mac: System Settings > Notifications > Google
Chrome), and check that Do Not Disturb or Focus is off.

## Daily limit

Pick a daily limit under **Settings** (15 minutes to 5 hours, or Off; the default is
2 hours). The popup shows how much time you have left, and the toolbar badge
is grey while you're under the limit and turns red once you reach it. You also
get a notification when you hit it.

Turn on **Block YouTube at the limit** to cover every YouTube tab with a
"Daily YouTube limit reached" screen and pause the video for the rest of the
day. It lifts automatically at midnight, or as soon as you raise or turn off
the limit.

## Install (unpacked)

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select this folder (the one containing `manifest.json`).
5. Pin the extension from the puzzle-piece menu so the badge is visible.

## What counts as time on YouTube

- A YouTube tab counts while it is visible (the active tab of a window that isn't minimized), or while its video is playing in a picture-in-picture window, even if you've switched to another tab.
- If you've been away from the keyboard for 2 minutes, time stops counting, unless a video is playing.
- Two YouTube windows open side by side count as wall-clock time, not double.

## Syncing between devices

If you're signed in to Chrome with sync turned on, the extension syncs through
your Chrome account (not your YouTube or Google login inside the page):

- Today, Total, the 7-day chart and the daily limit all count your combined
  time from every device.
- The limit and the block setting are shared, so changing them on one device
  changes them everywhere.
- **Erase** (under Settings > Data) erases the time on all your devices.

Each device sends its time about once a minute, so another device's latest
minute may not show up straight away. If Chrome sync is off, everything still
works, just on that device alone.

The `key` in `manifest.json` gives the extension the same ID wherever it's
loaded from, which is what lets Chrome match it up across devices. Don't
remove it.

Nothing is sent anywhere except through Chrome's own sync.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | Extension manifest |
| `common.js` | Helpers, default settings and the combined cross-device totals |
| `content.js` | Runs on youtube.com, sends a heartbeat every 5s while the tab is visible, and shows the block screen |
| `background.js` | Service worker that adds up time per day, syncs it and updates the badge |
| `popup.html` / `popup.css` / `popup.js` | The toolbar popup |
| `make_icons.py` | Regenerates the icons in `icons/` (standard library only) |
