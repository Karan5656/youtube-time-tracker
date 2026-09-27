# YouTube Time Tracker

A Chrome extension (Manifest V3) that tracks how much time you spend on YouTube.

The toolbar badge shows today's time, and the popup shows today, your all-time
total, and a bar chart of the last 7 days.

Every time today's YouTube time passes another full hour (1h, 2h, 3h, ...), a
desktop notification pops up. It stays on screen until you dismiss it. If you
don't see it, check that notifications for Chrome are allowed in your
operating system's settings.

## Daily limit

Pick a daily limit in the popup (15 minutes to 5 hours, or Off; the default is
2 hours). The popup shows how much time you have left, and the toolbar badge
is grey while you're under the limit and turns red once you reach it. You also
get a notification when you hit it.

Tick **Block YouTube when I reach it** to cover every YouTube tab with a
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

- A YouTube tab counts only while it is visible (the active tab of a window that isn't minimized).
- If you've been away from the keyboard for 2 minutes, time stops counting, unless a video is playing.
- Two YouTube windows open side by side count as wall-clock time, not double.

All data stays on your machine in `chrome.storage.local`. **Reset** in the popup erases it.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | Extension manifest |
| `common.js` | Helpers and default settings shared by the scripts below |
| `content.js` | Runs on youtube.com, sends a heartbeat every 5s while the tab is visible, and shows the block screen |
| `background.js` | Service worker that adds up time per day and updates the badge |
| `popup.html` / `popup.css` / `popup.js` | The toolbar popup |
| `make_icons.py` | Regenerates the icons in `icons/` (standard library only) |
