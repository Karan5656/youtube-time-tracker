async function render() {
  const { days, total, since, devices } = await getUsage();
  const today = new Date();

  document.getElementById("today").textContent = formatDuration(days[dateKey(today)] || 0);
  renderLimit(days[dateKey(today)] || 0, await getSettings());

  document.getElementById("total").textContent = formatDuration(total);

  const deviceNote = devices > 1 ? ` on ${devices} devices` : "";
  document.getElementById("since").textContent = since ? `Tracking since ${since}${deviceNote}` : "No time tracked yet";

  const week = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    week.push({ d, seconds: days[dateKey(d)] || 0 });
  }
  const max = Math.max(...week.map((w) => w.seconds), 1);

  const container = document.getElementById("week");
  container.replaceChildren(
    ...week.map(({ d, seconds }) => {
      const row = document.createElement("div");
      row.className = "row";
      const day = document.createElement("span");
      day.className = "day";
      day.textContent = d.toLocaleDateString(undefined, { weekday: "short" });
      const bar = document.createElement("div");
      bar.className = "bar";
      const fill = document.createElement("div");
      fill.style.width = `${(seconds / max) * 100}%`;
      bar.appendChild(fill);
      const time = document.createElement("span");
      time.className = "time";
      time.textContent = formatDuration(seconds);
      row.append(day, bar, time);
      return row;
    })
  );
}

function renderLimit(todaySeconds, { limitMinutes, blockWhenOver }) {
  const select = document.getElementById("limit");
  // Keep a custom value (set outside the popup) selectable.
  if (![...select.options].some((o) => Number(o.value) === limitMinutes)) {
    select.add(new Option(formatDuration(limitMinutes * 60), limitMinutes));
  }
  select.value = String(limitMinutes);

  const block = document.getElementById("block");
  block.checked = blockWhenOver;
  block.disabled = limitMinutes === 0;
  block.parentElement.classList.toggle("disabled", limitMinutes === 0);

  const progress = document.getElementById("limit-progress");
  progress.hidden = limitMinutes === 0;
  if (limitMinutes === 0) return;
  const limit = limitMinutes * 60;
  const over = todaySeconds >= limit;
  progress.classList.toggle("over", over);
  document.getElementById("limit-fill").style.width = `${Math.min(todaySeconds / limit, 1) * 100}%`;
  document.getElementById("limit-text").textContent = over
    ? "Limit reached"
    : `${formatDuration(limit - todaySeconds)} left`;
}

document.getElementById("limit").addEventListener("change", (e) => {
  saveSettings({ limitMinutes: Number(e.target.value) });
});

document.getElementById("block").addEventListener("change", (e) => {
  saveSettings({ blockWhenOver: e.target.checked });
});

document.getElementById("reset").addEventListener("click", async () => {
  if (!confirm("Erase all tracked YouTube time on all your devices?")) return;
  await resetEverywhere(); // keeps the limit settings
  render();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" || (area === "local" && "days" in changes)) render();
});

render();
