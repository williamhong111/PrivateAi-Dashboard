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

/* ── Fetch ── */
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

/* ── Render dispatcher ── */
function renderTab(tab, data) {
  if (tab === 'overview') renderOverview(data);
  if (tab === 'users')    renderUsers(data);
  if (tab === 'timeline') renderTimeline(data);
  if (tab === 'keys')     renderKeys(data);
}

/* ── Chart helpers ── */
const COLORS = ['#f5c518', '#7c7cdd', '#22c55e', '#ef4444', '#ff9500', '#06b6d4'];
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
      scales: type !== 'doughnut' ? {
        x: { ticks: { color: '#444', font: { size: 11 } }, grid: { color: '#161616' } },
        y: { ticks: { color: '#444', font: { size: 11 } }, grid: { color: '#161616' }, beginAtZero: true }
      } : undefined,
      ...extra
    }
  });
}

/* ── Overview ── */
function renderOverview(data) {
  const users = data.users;
  const keys  = Object.keys(users);

  // Metrics
  const todayStr = new Date().toISOString().slice(0, 10);
  let todayCount = 0;
  keys.forEach(k => (users[k].history || []).forEach(h => {
    if ((h.created_at || '').slice(0, 10) === todayStr) todayCount++;
  }));

  document.getElementById('metrics').innerHTML = `
    <div class="metric"><div class="metric-val">${data.total_requests.toLocaleString()}</div><div class="metric-lbl">Total Requests</div></div>
    <div class="metric"><div class="metric-val">${data.total_tokens_out.toLocaleString()}</div><div class="metric-lbl">Tokens Generated</div></div>
    <div class="metric"><div class="metric-val">${keys.filter(k => users[k].requests > 0).length}</div><div class="metric-lbl">Active Users</div></div>
    <div class="metric"><div class="metric-val">${todayCount || 0}</div><div class="metric-lbl">Requests Today</div></div>
  `;

  mkChart('chart-users', 'bar',
    keys.map(k => users[k].name || k),
    [{ label: 'Requests', data: keys.map(k => users[k].requests), backgroundColor: COLORS }]
  );

  mkChart('chart-tokens', 'doughnut',
    keys.map(k => users[k].name || k),
    [{ data: keys.map(k => users[k].tokens_out), backgroundColor: COLORS, borderWidth: 0 }]
  );

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
  const dailyCounts = days.map(d => {
    let c = 0;
    keys.forEach(k => (users[k].history || []).forEach(h => {
      if ((h.created_at || '').slice(0, 10) === d) c++;
    }));
    return c;
  });
  mkChart('chart-daily', 'line',
    days.map(d => d.slice(5)),
    [{ label: 'Requests', data: dailyCounts, borderColor: '#f5c518', backgroundColor: 'rgba(245,197,24,0.08)', fill: true, tension: 0.3, pointRadius: 3 }]
  );
}

/* ── Users ── */
function renderUsers(data) {
  const users = data.users;
  document.getElementById('users-body').innerHTML = Object.entries(users).map(([k, u]) => `
    <tr>
      <td>${u.name || k}</td>
      <td><span style="font-family:monospace;color:#555;font-size:12px">${k}</span></td>
      <td><span class="badge badge-${u.role || 'user'}">${u.role || 'user'}</span></td>
      <td>${u.requests.toLocaleString()}</td>
      <td>${u.tokens_in.toLocaleString()}</td>
      <td>${u.tokens_out.toLocaleString()}</td>
      <td style="color:#444">${u.last_used || '—'}</td>
    </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:#333;padding:20px">No users</td></tr>';

  const allH = [];
  Object.entries(users).forEach(([k, u]) => (u.history || []).forEach(h => allH.push({ user: u.name || k, ...h })));
  allH.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  document.getElementById('history-list').innerHTML = allH.slice(0, 40).map(h => `
    <div class="history-item">
      <span class="h-time">${h.created_at || '—'}</span>
      <span class="h-user">${h.user}</span>
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

document.getElementById('timeline-range')?.addEventListener('change', () => {
  if (window._data) renderTimeline(window._data);
});

/* ── API Keys ── */
function renderKeys(data) {
  document.getElementById('keys-list').innerHTML = Object.entries(data.users).map(([k, u]) => `
    <div class="key-item">
      <span class="key-name">${u.name || k}</span>
      <span class="key-val">${k}</span>
      <button class="key-del" onclick="removeUser('${k}')">Remove</button>
    </div>`).join('') || '<p style="color:#333;padding:12px 0">No users</p>';
}

document.getElementById('add-btn')?.addEventListener('click', async () => {
  const key  = document.getElementById('new-key').value.trim();
  const name = document.getElementById('new-name').value.trim();
  if (!key || !name) return alert('Fill both fields');
  await fetch('/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, name }) });
  document.getElementById('new-key').value = '';
  document.getElementById('new-name').value = '';
  fetchStats();
});

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
