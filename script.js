const API = (window.API_BASE_URL || "").replace(/\/$/, "");
const $ = (id) => document.getElementById(id);
let priceChart, volChart;

function setStatus(msg, isError = false) {
  const el = $("status");
  el.hidden = !msg;
  el.textContent = msg || "";
  el.className = "status" + (isError ? " error" : "");
}

// Render's free server sleeps when idle; the first request can take ~50 seconds.
async function api(path, options = {}, timeoutMs = 90000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(API + path, { ...options, signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed (" + res.status + ")");
    return data;
  } catch (e) {
    if (e.name === "AbortError") throw new Error("The server took too long to respond. Please try again.");
    if (e instanceof TypeError) throw new Error("Cannot reach the server. Check API_BASE_URL in config.js.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const money = (n) => "$" + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function drawCharts(c) {
  if (priceChart) priceChart.destroy();
  if (volChart) volChart.destroy();
  const opts = (fmt) => ({
    responsive: true,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { labels: { color: "#e2e8f0" } } },
    scales: {
      x: { ticks: { color: "#94a3b8", maxTicksLimit: 8 }, grid: { color: "#1e293b" } },
      y: { ticks: { color: "#94a3b8", callback: fmt }, grid: { color: "#334155" } },
    },
  });
  priceChart = new Chart($("priceChart"), {
    type: "line",
    data: { labels: c.dates, datasets: [
      { label: "Close", data: c.close, borderColor: "#38bdf8", pointRadius: 0, borderWidth: 2 },
      { label: "20-day average", data: c.ma20, borderColor: "#f59e0b", pointRadius: 0, borderWidth: 2, borderDash: [6, 4] },
    ] },
    options: opts((v) => "$" + v),
  });
  volChart = new Chart($("volChart"), {
    type: "line",
    data: { labels: c.dates, datasets: [
      { label: "Rolling volatility", data: c.vol20.map((v) => (v == null ? null : +(v * 100).toFixed(2))),
        borderColor: "#a78bfa", backgroundColor: "rgba(167,139,250,.15)", fill: true, pointRadius: 0, borderWidth: 2 },
    ] },
    options: opts((v) => v + "%"),
  });
}

function showResult(r) {
  $("result").classList.remove("hidden");
  $("r-last").textContent = money(r.last_close);
  $("r-date").textContent = "as of " + r.as_of_date;
  $("r-pred").textContent = money(r.predicted_close);
  const ch = $("r-change");
  ch.textContent = (r.predicted_change_pct >= 0 ? "▲ +" : "▼ ") + r.predicted_change_pct + "%";
  $("r-pred").className = r.predicted_change_pct >= 0 ? "up" : "down";
  $("r-vol").textContent = (r.predicted_volatility * 100).toFixed(2) + "%";
  $("r-annual").textContent = "≈ " + (r.annualized_volatility * 100).toFixed(1) + "% annualized";
  $("r-level").textContent = r.volatility_level;
  $("r-saved").textContent = r.saved_to_db ? "saved to database" : "database unavailable - not saved";
  drawCharts(r.chart);
}

async function loadHistory() {
  const body = $("history");
  try {
    const rows = await api("/api/history?limit=15", {}, 30000);
    if (!rows.length) { body.innerHTML = '<tr><td colspan="6">No predictions yet.</td></tr>'; return; }
    body.innerHTML = rows.map((r) => `
      <tr><td>${r.created_at}</td><td><b>${r.ticker}</b></td><td>${money(r.last_close)}</td>
      <td>${money(r.predicted_close)}</td>
      <td class="${r.predicted_change_pct >= 0 ? "up" : "down"}">${r.predicted_change_pct}%</td>
      <td>${(r.predicted_volatility * 100).toFixed(2)}% (${r.volatility_level})</td></tr>`).join("");
  } catch (e) {
    body.innerHTML = `<tr><td colspan="6">${e.message}</td></tr>`;
  }
}

$("predict-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const ticker = $("ticker").value.trim().toUpperCase();
  if (!ticker) return;
  $("go").disabled = true;
  setStatus("Fetching Yahoo Finance data and predicting... (the first request may take up to a minute while the free server wakes up)");
  try {
    const r = await api("/api/predict", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker }),
    });
    setStatus("");
    showResult(r);
    loadHistory();
  } catch (e) {
    setStatus(e.message, true);
  } finally {
    $("go").disabled = false;
  }
});

$("chips").addEventListener("click", (e) => {
  if (e.target.tagName === "SPAN") { $("ticker").value = e.target.textContent; $("predict-form").requestSubmit(); }
});
$("refresh").addEventListener("click", loadHistory);
loadHistory();
