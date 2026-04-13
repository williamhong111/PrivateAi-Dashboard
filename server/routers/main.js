/* ── Tab switching ── */
const TAB_NAMES = { overview: 'Overview', users: 'Users', timeline: 'Timeline', keys: 'API Keys' };

function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('tab-' + name)?.classList.add('active');
  document.querySelector(`[data-tab="${name}"]`)?.classList.add('active');
  document.getElementById('page-title').textContent = TAB_NAMES[name] || name;
  if (window._data) renderTab(name, window._data);
}

document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', () => showTab(el.dataset.tab));
});

/* ── Status ── */
function setStatus(ok, time) {
  const dot = document.getElementById('dot');
  dot.className = 'dot' + (ok ? '' : ' err');
  document.getElementById('status-txt').textContent = ok ? 'Connected' : 'Disconnected';
  if (time) document.getElementById('updated-at').textContent = '· ' + time;
}

/* ── Fetch stats ── */
async function fetchStats() {
  try {
    const res = await fetch('/stats');
    if (!res.ok) throw new Error('bad response');
    const data = await res.json();
    window._data = data;
    setStatus(true, data.generated_at);
    const active = document.querySelector('.nav-item.active');
    renderTab(active?.dataset.tab || 'overview', data);
  } catch (e) {
    setStatus(false);
  }
}

/* ── Fetch model stats from /stats/models ── */
async function fetchModelStats() {
  try {
    const res = await fetch('/stats/models');
    if (!res.ok) return;
    const data = await res.json();
    window._modelStats = data;
    renderModelStats(data);
    // Also re-render overview model charts if we're on overview
    const active = document.querySelector('.nav-item.active');
    if ((active?.dataset.tab || 'overview') === 'overview' && window._data) {
      renderModelCharts(data);
    }
  } catch(e) {
    console.warn('Could not fetch model stats', e);
  }
}

/* ── Render dispatcher ── */
function renderTab(tab, data) {
  if (tab === 'overview') { renderOverview(data); fetchModelStats(); }
  if (tab === 'users')    renderUsers(data);
  if (tab === 'timeline') renderTimeline(data);
  if (tab === 'keys')     renderKeys(data);
}

/* ── Chart helpers ── */
const COLORS = ['#f5c518', '#7c7cdd', '#22c55e', '#ef4444', '#ff9500', '#06b6d4'];
const MODEL_COLORS = { 'Kimi K2.5': '#f5c518', 'DeepSeek V3.1': '#7c7cdd', 'Qwen3 235B': '#22c55e' };
const _charts = {};

function mkChart(id, type, labels, datasets, extra = {}) {
  if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
  const ctx = document.getElementById(id)?.getContext('2d');
  if (!ctx) return;
  _charts[id] = new Chart(ctx, {
    type,
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#555', font: { size: 11 } } } },
      scales: type !== 'doughnut' && type !== 'pie' ? {
        x: { ticks: { color: '#444', font: { size: 11 } }, grid: { color: '#161616' } },
        y: { ticks: { color: '#444', font: { size: 11 } }, grid: { color: '#161616' }, beginAtZero: true }
      } : undefined,
      ...extra
    }
  });
}

function modelShortName(model) {
  if (!model) return 'Kimi K2.5';
  if (model.includes('Kimi'))        return 'Kimi K2.5';
  if (model.includes('DeepSeek'))    return 'DeepSeek V3.1';
  if (model.includes('Qwen3.5'))     return 'Qwen3.5 397B';
  return model.split('/').pop().slice(0, 16);
}

function modelColor(shortName, idx) {
  return MODEL_COLORS[shortName] || COLORS[idx % COLORS.length];
}

/* ── Overview ── */
function renderOverview(data) {
  if (!data) return;
  const users = data.users;
  const keys  = Object.keys(users);

  // Set default date to today if not set
  const dateEl = document.getElementById('overview-date');
  const todayStr = new Date().toISOString().slice(0, 10);
  if (!dateEl.value) dateEl.value = todayStr;
  const selectedDate = dateEl.value;

  function onDate(h) { return (h.created_at || '').slice(0, 10) === selectedDate; }

  // Metrics for selected date
  let dayRequests = 0, dayTokens = 0;
  const activeOnDay = new Set();
  keys.forEach(k => {
    (users[k].history || []).forEach(h => {
      if (onDate(h)) {
        dayRequests++;
        dayTokens += h.tokens_out || 0;
        activeOnDay.add(k);
      }
    });
  });

  // All-time totals for comparison
  const allRequests = data.total_requests;
  const allTokens   = data.total_tokens_out;

  document.getElementById('metrics').innerHTML = `
    <div class="metric"><div class="metric-val">${dayRequests.toLocaleString()}</div><div class="metric-lbl">Requests on day</div></div>
    <div class="metric"><div class="metric-val">${dayTokens.toLocaleString()}</div><div class="metric-lbl">Tokens on day</div></div>
    <div class="metric"><div class="metric-val">${activeOnDay.size}</div><div class="metric-lbl">Active users</div></div>
    <div class="metric"><div class="metric-val">${allRequests.toLocaleString()}</div><div class="metric-lbl">All-time requests</div></div>
  `;

  // Requests & tokens by user — filtered to selected date
  const userRequests = keys.map(k => (users[k].history || []).filter(onDate).length);
  const userTokens   = keys.map(k => (users[k].history || []).filter(onDate).reduce((s, h) => s + (h.tokens_out || 0), 0));

  mkChart('chart-users', 'bar',
    keys.map(k => users[k].name || k),
    [{ label: 'Requests', data: userRequests, backgroundColor: COLORS }]
  );
  mkChart('chart-tokens', 'doughnut',
    keys.map(k => users[k].name || k),
    [{ data: userTokens, backgroundColor: COLORS, borderWidth: 0 }]
  );

  // Activity chart — show 7 days centered around selected date
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(selectedDate); d.setDate(d.getDate() - 3 + i);
    return d.toISOString().slice(0, 10);
  });
  const userDatasets = keys.map((k, i) => ({
    label: users[k].name || k,
    data: days.map(d => (users[k].history || []).filter(h => (h.created_at || '').slice(0, 10) === d).length),
    backgroundColor: COLORS[i % COLORS.length],
    stack: 'users',
    type: 'bar',
  }));
  const totals = days.map(d => {
    let c = 0;
    keys.forEach(k => (users[k].history || []).forEach(h => { if ((h.created_at || '').slice(0, 10) === d) c++; }));
    return c;
  });
  mkChart('chart-daily', 'bar', days.map(d => d === selectedDate ? `▶ ${d.slice(5)}` : d.slice(5)), [
    ...userDatasets,
    { label: 'Total', data: totals, borderColor: '#f5c518', backgroundColor: 'rgba(0,0,0,0)', type: 'line', fill: false, tension: 0.3, pointRadius: 4, borderWidth: 2, order: 0 }
  ]);

  // Model charts filtered to selected date
  const modelMap = {};
  keys.forEach(k => {
    (users[k].history || []).filter(onDate).forEach(h => {
      const short = modelShortName(h.model || users[k].model || '');
      if (!modelMap[short]) modelMap[short] = { requests: 0, tokens_out: 0 };
      modelMap[short].requests++;
      modelMap[short].tokens_out += h.tokens_out || 0;
    });
  });
  const entries = Object.entries(modelMap);
  if (entries.length) {
    const labels   = entries.map(([n]) => n);
    const bgColors = labels.map((l, i) => modelColor(l, i));
    mkChart('chart-model-requests', 'doughnut', labels, [{ data: entries.map(([,v]) => v.requests), backgroundColor: bgColors, borderWidth: 0 }]);
    mkChart('chart-model-tokens', 'bar', labels, [{ label: 'Tokens out', data: entries.map(([,v]) => v.tokens_out), backgroundColor: bgColors }]);
  } else if (window._modelStats) {
    renderModelCharts(window._modelStats);
  }
}

function renderModelCharts(modelStats) {
  if (!modelStats || !modelStats.length) return;
  const labels   = modelStats.map(m => modelShortName(m.model));
  const bgColors = labels.map((l, i) => modelColor(l, i));

  mkChart('chart-model-requests', 'doughnut',
    labels,
    [{ data: modelStats.map(m => m.requests), backgroundColor: bgColors, borderWidth: 0 }]
  );

  mkChart('chart-model-tokens', 'bar',
    labels,
    [{ label: 'Tokens out', data: modelStats.map(m => m.tokens_out), backgroundColor: bgColors }]
  );
}

/* ── Model stats (Models tab) ── */
function renderModelStats(modelStats) {
  const el = document.getElementById('model-stats-list');
  if (!el) return;
  if (!modelStats || !modelStats.length) {
    el.innerHTML = '<p style="color:#444;padding:12px 0">No usage data yet</p>';
    return;
  }
  const total = modelStats.reduce((s, m) => s + m.requests, 0) || 1;
  el.innerHTML = modelStats.map((m, i) => {
    const short = modelShortName(m.model);
    const pct   = ((m.requests / total) * 100).toFixed(1);
    const color = modelColor(short, i);
    return `
      <div class="model-stat-item">
        <div class="model-stat-header">
          <span class="model-stat-name">${short}</span>
          <span class="model-stat-meta">${m.requests.toLocaleString()} requests · ${m.tokens_out.toLocaleString()} tokens out</span>
          <span class="model-stat-pct" style="color:${color}">${pct}%</span>
        </div>
        <div class="model-stat-bar-bg">
          <div class="model-stat-bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
      </div>
    `;
  }).join('');
}

/* ── Users ── */
function renderUsers(data) {
  const users = data.users;
  document.getElementById('users-body').innerHTML = Object.entries(users).map(([k, u]) => `
    <tr>
      <td>${u.name || k}</td>
      <td><span style="font-family:monospace;color:#555;font-size:12px">${k}</span></td>
      <td><span class="badge badge-${u.role || 'user'}">${u.role || 'user'}</span></td>
      <td><span class="model-tag">${modelShortName(u.model)}</span></td>
      <td>${u.requests.toLocaleString()}</td>
      <td>${u.tokens_in.toLocaleString()}</td>
      <td>${u.tokens_out.toLocaleString()}</td>
      <td style="color:#444">${u.last_used || '—'}</td>
    </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;color:#333;padding:20px">No users</td></tr>';

  const allH = [];
  Object.entries(users).forEach(([k, u]) => (u.history || []).forEach(h => allH.push({ user: u.name || k, ...h })));
  allH.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  document.getElementById('history-list').innerHTML = allH.slice(0, 40).map(h => `
    <div class="history-item">
      <span class="h-time">${h.created_at || '—'}</span>
      <span class="h-user">${h.user}</span>
      <span class="h-model">${modelShortName(h.model)}</span>
      <span class="h-path">${h.path || 'chat'}</span>
      <span class="h-tok">${h.tokens_out ? h.tokens_out + ' tok' : ''}</span>
    </div>`).join('') || '<p style="color:#333;padding:12px 0">No history yet</p>';
}

/* ── Timeline ── */
function renderTimeline(data) {
  const range = parseInt(document.getElementById('timeline-range')?.value || 7);
  const users = data.users;
  const keys  = Object.keys(users);

  const days = Array.from({ length: range }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (range - 1 - i));
    return d.toISOString().slice(0, 10);
  });

  const totals = days.map(d => {
    let c = 0;
    keys.forEach(k => (users[k].history || []).forEach(h => { if ((h.created_at || '').slice(0, 10) === d) c++; }));
    return c;
  });

  mkChart('chart-timeline', 'line',
    days.map(d => d.slice(5)),
    [{ label: 'Total', data: totals, borderColor: '#f5c518', backgroundColor: 'rgba(245,197,24,0.08)', fill: true, tension: 0.3, pointRadius: 3 }]
  );

  mkChart('chart-stacked', 'bar',
    days.map(d => d.slice(5)),
    keys.map((k, i) => ({
      label: users[k].name || k,
      data: days.map(d => {
        let c = 0;
        (users[k].history || []).forEach(h => { if ((h.created_at || '').slice(0, 10) === d) c++; });
        return c;
      }),
      backgroundColor: COLORS[i % COLORS.length],
      stack: 'a'
    }))
  );

  // Heatmap
  const todayStr = new Date().toISOString().slice(0, 10);
  const hourCounts = Array(24).fill(0);
  keys.forEach(k => (users[k].history || []).forEach(h => {
    if ((h.created_at || '').slice(0, 10) === todayStr) {
      const hr = parseInt((h.created_at || '').slice(11, 13));
      if (!isNaN(hr)) hourCounts[hr]++;
    }
  }));
  const maxH = Math.max(...hourCounts, 1);
  document.getElementById('heatmap').innerHTML = `
    <div class="heatmap-grid">${hourCounts.map((c, i) => `
      <div class="heatmap-cell" style="background:rgba(245,197,24,${c === 0 ? 0.05 : (0.15 + c / maxH * 0.85).toFixed(2)})" title="${i}:00 — ${c} req">${c || ''}</div>
    `).join('')}</div>
    <div class="heatmap-labels">${Array.from({ length: 24 }, (_, i) => `<div class="heatmap-label">${i}</div>`).join('')}</div>
  `;
}


document.addEventListener("change", e => { if (e.target.id === "overview-date" && window._data) renderOverview(window._data); });
document.getElementById('timeline-range')?.addEventListener('change', () => {
  if (window._data) renderTimeline(window._data);
});

/* ── API Keys ── */
function renderKeys(data) {
  document.getElementById('keys-list').innerHTML = Object.entries(data.users).map(([k, u]) => `
    <div class="key-item">
      <span class="model-tag">${modelShortName(u.model)}</span>
      <span class="key-name">${u.name || k}</span>
      <span class="key-val">${k}</span>
      <button class="key-copy" onclick="copyKey('${k}', '${u.model}')">Copy</button>
      <button class="key-del" onclick="removeUser('${k}')">Remove</button>
    </div>`).join('') || '<p style="color:#333;padding:12px 0">No users</p>';
}

document.addEventListener('click', async (e) => {
  if (!e.target.closest('#add-btn')) return;
  const name  = document.getElementById('new-name').value.trim();
  const model = document.getElementById('new-model').value;
  if (!name) return alert('Enter a name');

  const res = await fetch('/admin/users/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, model })
  });
  const data = await res.json();

  const box = document.getElementById('generated-box');
  const ip = data.ip || window.location.hostname;
  const snippet = `model    = "${data.model}"\napi_base = "http://${ip}:8000/v1"\napi_key  = "${data.key}"`;
  document.getElementById('generated-snippet').textContent = snippet;
  document.getElementById('generated-key-name').textContent = data.name;
  box.style.display = 'block';

  document.getElementById('new-name').value = '';
  fetchStats();
});

function copyKey(key, model) {
  const m = model || 'mlx-community/Kimi-K2.5';
  const ip = window.location.hostname;
  const snippet = `api_base = "http://${ip}:8000/v1"\napi_key  = "${key}"\nmodel    = "${m}"`;
  navigator.clipboard.writeText(snippet);
  alert('Copied!');
}

function copyGenerated() {
  const text = document.getElementById('generated-snippet').textContent;
  navigator.clipboard.writeText(text);
  alert('Copied!');
}

function closeGenerated() {
  document.getElementById('generated-box').style.display = 'none';
}

async function removeUser(key) {
  if (!confirm(`Remove "${key}"?`)) return;
  await fetch(`/admin/users/${key}`, { method: 'DELETE' });
  fetchStats();
}

/* ── Auto refresh ── */
let cd = 10;
setInterval(() => {
  cd--;
  const el = document.getElementById('countdown');
  if (el) el.textContent = cd;
  if (cd <= 0) { cd = 10; fetchStats(); }
}, 1000);

fetchStats();
