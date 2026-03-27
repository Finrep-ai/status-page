const OWNER = "Finrep-ai";
const REPO = "status-page";

const overallStatusEl = document.getElementById("overall-status");
const metricsEl = document.getElementById("metrics");
const servicesEl = document.getElementById("services");
const timelinesEl = document.getElementById("timelines");
const lastRefreshEl = document.getElementById("last-refresh");
const summaryLinkEl = document.getElementById("summary-link");
const refreshBtn = document.getElementById("refresh-btn");
const cardTemplate = document.getElementById("service-card-template");

async function getDefaultBranch() {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}`;
  const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) {
    return "master";
  }
  const repo = await res.json();
  return repo.default_branch || "master";
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Request failed: ${res.status} (${url})`);
  return res.json();
}

function parseSimpleYaml(text) {
  const map = {};
  text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .forEach((line) => {
      const idx = line.indexOf(":");
      if (idx === -1) return;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      map[key] = value;
    });
  return map;
}

function fmtRelative(isoString) {
  const date = new Date(isoString);
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (Number.isNaN(mins)) return "Unknown";
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function badgeClass(status) {
  if (status === "up") return "badge-up";
  if (status === "degraded") return "badge-degraded";
  return "badge-down";
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function setMetrics(summary) {
  const upCount = summary.filter((s) => s.status === "up").length;
  const avgResponse = Math.round(summary.reduce((acc, s) => acc + (s.time || 0), 0) / summary.length);
  const avgUptime = (
    summary.reduce((acc, s) => acc + parseFloat(String(s.uptime).replace("%", "")), 0) / summary.length
  ).toFixed(2);
  const degradedOrDown = summary.filter((s) => s.status !== "up").length;

  metricsEl.innerHTML = "";
  const metrics = [
    { label: "Services Up", value: `${upCount}/${summary.length}` },
    { label: "Avg Response", value: `${avgResponse} ms` },
    { label: "Avg Uptime", value: `${avgUptime}%` },
    { label: "Attention", value: degradedOrDown === 0 ? "None" : String(degradedOrDown) },
  ];

  for (const metric of metrics) {
    const item = document.createElement("div");
    item.className = "metric";
    item.innerHTML = `<div class="metric-label">${metric.label}</div><div class="metric-value">${metric.value}</div>`;
    metricsEl.appendChild(item);
  }
}

function setOverall(summary) {
  const down = summary.filter((s) => s.status === "down").length;
  const degraded = summary.filter((s) => s.status === "degraded").length;
  if (down > 0) {
    overallStatusEl.textContent = `${down} service${down > 1 ? "s are" : " is"} currently down.`;
    return;
  }
  if (degraded > 0) {
    overallStatusEl.textContent = `${degraded} service${degraded > 1 ? "s are" : " is"} degraded.`;
    return;
  }
  overallStatusEl.textContent = "All monitored systems are operational.";
}

function buildLast90Days() {
  const days = [];
  const today = new Date();
  for (let i = 89; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function timelineLevel(minutesDown) {
  if (!minutesDown) return "normal";
  if (minutesDown <= 5) return "minor";
  if (minutesDown <= 30) return "major";
  return "critical";
}

function renderTimelines(summary) {
  timelinesEl.innerHTML = "";
  const dates = buildLast90Days();

  for (const service of summary) {
    const article = document.createElement("article");
    article.className = "timeline-card";

    const totalDownMinutes = Object.values(service.dailyMinutesDown || {}).reduce((acc, val) => acc + Number(val || 0), 0);
    const incidentDays = Object.keys(service.dailyMinutesDown || {}).length;

    const bars = dates
      .map((date) => {
        const minutesDown = Number((service.dailyMinutesDown || {})[date] || 0);
        const level = timelineLevel(minutesDown);
        const latencyMs = Number(service.timeDay || service.timeWeek || service.time || 0);
        const tooltip = `${service.name} on ${date}: ${latencyMs} ms latency`;
        return `<button type="button" class="timeline-bar" data-level="${level}" title="${tooltip}" aria-label="${tooltip}"></button>`;
      })
      .join("");

    article.innerHTML = `
      <div class="timeline-head">
        <h3 class="timeline-service">${service.name}</h3>
        <span class="timeline-status">Current: ${capitalize(service.status)}</span>
      </div>
      <div class="timeline-bars">${bars}</div>
      <div class="timeline-meta">
        <span>90 days ago</span>
        <span>${incidentDays} incident day(s), ${totalDownMinutes} min down</span>
        <span>Today</span>
      </div>
    `;

    timelinesEl.appendChild(article);
  }
}

function renderCards(summary, historyBySlug) {
  servicesEl.innerHTML = "";

  for (const service of summary) {
    const node = cardTemplate.content.firstElementChild.cloneNode(true);
    const history = historyBySlug[service.slug] || {};

    node.querySelector(".service-name").textContent = service.name;

    const urlEl = node.querySelector(".service-url");
    urlEl.href = service.url;
    urlEl.textContent = new URL(service.url).host;

    const badge = node.querySelector(".service-badge");
    badge.textContent = capitalize(service.status);
    badge.classList.add(badgeClass(service.status));

    const pills = [
      `24h uptime ${service.uptimeDay}`,
      `7d uptime ${service.uptimeWeek}`,
      `30d uptime ${service.uptimeMonth}`,
      `1y uptime ${service.uptimeYear}`,
      `RT ${service.timeWeek} ms`,
    ];

    const pillsEl = node.querySelector(".pills");
    for (const text of pills) {
      const pill = document.createElement("span");
      pill.className = "pill";
      pill.textContent = text;
      pillsEl.appendChild(pill);
    }

    node.querySelector(".meta-code").textContent = `HTTP ${history.code || service.code || "--"}`;
    node.querySelector(".meta-update").textContent = `Updated ${fmtRelative(history.lastUpdated)}`;

    servicesEl.appendChild(node);
  }
}

async function loadStatus() {
  refreshBtn.disabled = true;
  refreshBtn.textContent = "Refreshing...";

  try {
    const branch = await getDefaultBranch();
    const base = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${branch}`;
    const summaryUrl = `${base}/history/summary.json`;

    const summary = await fetchJson(summaryUrl);
    const historyEntries = await Promise.all(
      summary.map(async (service) => {
        const text = await fetch(`${base}/history/${service.slug}.yml`, { cache: "no-store" }).then((r) => r.text());
        return [service.slug, parseSimpleYaml(text)];
      })
    );

    const historyBySlug = Object.fromEntries(historyEntries);

    setOverall(summary);
    setMetrics(summary);
    renderCards(summary, historyBySlug);
    renderTimelines(summary);

    summaryLinkEl.href = summaryUrl;
    lastRefreshEl.textContent = `Last refresh: ${new Date().toLocaleString()}`;
  } catch (err) {
    overallStatusEl.textContent = "Could not load live status data right now.";
    servicesEl.innerHTML = `<article class="service-card"><strong>Data fetch failed</strong><p>${err.message}</p></article>`;
    timelinesEl.innerHTML = "";
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "Refresh";
  }
}

refreshBtn.addEventListener("click", loadStatus);

loadStatus();
setInterval(loadStatus, 120000);
