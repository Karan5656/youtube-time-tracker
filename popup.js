const $ = (id) => document.getElementById(id);

async function render() {
  const { days, total, since, devices } = await getUsage();
  const settings = await getSettings();
  const today = new Date();
  const todaySeconds = days[dateKey(today)] || 0;

  renderToday(todaySeconds, settings);

  const week = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    week.push({ d, seconds: days[dateKey(d)] || 0 });
  }
  const weekTotal = week.reduce((a, w) => a + w.seconds, 0);
  $("week-total").textContent = formatDuration(weekTotal);
  $("week-avg").textContent = formatDuration(weekTotal / 7);
  $("total").textContent = formatDuration(total);
  renderChart(week);

  if (since) {
    const sinceText = new Date(`${since}T00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    $("since").textContent = `Tracking since ${sinceText}${devices > 1 ? ` · synced across ${devices} devices` : ""}`;
  } else {
    $("since").textContent = "No time tracked yet";
  }

  renderSettings(settings);
}

function renderToday(todaySeconds, { limitMinutes, reminderMinutes }) {
  $("today").textContent = formatDuration(todaySeconds);
  const hero = document.querySelector(".hero");
  const limit = limitMinutes * 60;
  const over = limit > 0 && todaySeconds >= limit;
  hero.classList.toggle("over", over);

  const pill = $("limit-pill");
  pill.classList.toggle("over", over);
  pill.textContent = limit > 0 ? `${formatDuration(limit)} limit` : "";

  $("limit-bar").hidden = limit === 0;
  $("limit-fill").style.width = limit > 0 ? `${Math.min(todaySeconds / limit, 1) * 100}%` : "0";

  const parts = [];
  if (over) parts.push("Daily limit reached");
  else if (limit > 0) parts.push(`${formatDuration(limit - todaySeconds)} left today`);
  if (reminderMinutes > 0 && !over) {
    const interval = reminderMinutes * 60;
    const next = (Math.floor(todaySeconds / interval) + 1) * interval;
    parts.push(`next reminder at ${formatDuration(next)}`);
  }
  const text = parts.join(", ");
  $("hero-sub").textContent = text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function renderChart(week) {
  const max = Math.max(...week.map((w) => w.seconds), 1);
  $("chart").replaceChildren(
    ...week.map(({ d, seconds }, i) => {
      const col = document.createElement("div");
      col.className = i === week.length - 1 ? "col today" : "col";
      col.title = `${d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}: ${formatDuration(seconds)}`;
      const val = document.createElement("span");
      val.className = "val";
      val.textContent = seconds >= 60 ? formatShort(seconds) : "";
      const slot = document.createElement("div");
      slot.className = "slot";
      const fill = document.createElement("div");
      fill.className = "fill";
      fill.style.height = `${(seconds / max) * 100}%`;
      slot.appendChild(fill);
      const day = document.createElement("span");
      day.className = "day";
      day.textContent = d.toLocaleDateString(undefined, { weekday: "narrow" });
      col.append(val, slot, day);
      return col;
    })
  );
}

// Compact label for the chart columns: "45m", "2h", "2.5h".
function formatShort(seconds) {
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.round((seconds / 3600) * 10) / 10;
  return `${h}h`;
}

function selectValue(select, minutes) {
  // Keep a custom value (set outside the popup) selectable.
  if (![...select.options].some((o) => Number(o.value) === minutes)) {
    select.add(new Option(formatDuration(minutes * 60), minutes));
  }
  select.value = String(minutes);
}

function renderSettings({ limitMinutes, blockWhenOver, reminderMinutes }) {
  selectValue($("limit"), limitMinutes);
  selectValue($("reminder"), reminderMinutes);
  $("block").checked = blockWhenOver;
  $("block").disabled = limitMinutes === 0;
  $("block-row").classList.toggle("disabled", limitMinutes === 0);
}

function showSettings(show) {
  $("main-view").hidden = show;
  $("settings-view").hidden = !show;
}

$("open-settings").addEventListener("click", () => showSettings(true));
$("close-settings").addEventListener("click", () => showSettings(false));

$("limit").addEventListener("change", (e) => saveSettings({ limitMinutes: Number(e.target.value) }));
$("block").addEventListener("change", (e) => saveSettings({ blockWhenOver: e.target.checked }));
$("reminder").addEventListener("change", (e) => saveSettings({ reminderMinutes: Number(e.target.value) }));

$("test-notification").addEventListener("click", async () => {
  const level = await chrome.notifications.getPermissionLevel();
  const hint = $("notify-hint");
  if (level !== "granted") {
    hint.classList.add("warn");
    hint.textContent = "Chrome is blocking notifications from this extension. Remove and re-add it in chrome://extensions to allow them.";
    return;
  }
  chrome.runtime.sendMessage({ type: "test-notification" });
  $("test-notification").textContent = "Sent";
  setTimeout(() => ($("test-notification").textContent = "Send a test"), 2000);
});

$("reset").addEventListener("click", async () => {
  if (!confirm("Erase all tracked YouTube time on all your devices?")) return;
  await resetEverywhere(); // keeps the settings
  render();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" || (area === "local" && "days" in changes)) render();
});

render();
