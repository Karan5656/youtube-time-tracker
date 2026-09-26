function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDuration(seconds) {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s % 60}s`;
}

async function render() {
  const { days = {} } = await chrome.storage.local.get("days");
  const today = new Date();

  document.getElementById("today").textContent = formatDuration(days[dateKey(today)] || 0);
  const total = Object.values(days).reduce((a, b) => a + b, 0);
  document.getElementById("total").textContent = formatDuration(total);

  const recorded = Object.keys(days).sort();
  document.getElementById("since").textContent = recorded.length ? `Tracking since ${recorded[0]}` : "No time tracked yet";

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

document.getElementById("reset").addEventListener("click", async () => {
  if (!confirm("Erase all tracked YouTube time?")) return;
  await chrome.storage.local.set({ days: {} });
  render();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && "days" in changes) render();
});

render();
