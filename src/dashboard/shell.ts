/**
 * Renders the full single-page admin dashboard HTML.
 * All JS is inline — no build step, no CDN dependency.
 */

export function renderShell(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>RapidEx Admin Dashboard</title>
<style>
/* ── Reset & Base ──────────────────────────────────────────── */
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0f1117;--surface:#1a1d2e;--surface2:#222640;--border:#2d3154;
  --accent:#6366f1;--accent2:#8b5cf6;--success:#22c55e;--warning:#f59e0b;
  --danger:#ef4444;--info:#3b82f6;--text:#e2e8f0;--muted:#64748b;--subtle:#94a3b8;
  --radius:10px;--sidebar:240px
}
body{background:var(--bg);color:var(--text);font-family:'Inter',system-ui,sans-serif;
     font-size:14px;display:flex;min-height:100vh;overflow-x:hidden}
a{color:var(--accent);text-decoration:none}
button{cursor:pointer;font-family:inherit}
input,select,textarea{font-family:inherit;font-size:14px}
::-webkit-scrollbar{width:6px;height:6px}
::-webkit-scrollbar-track{background:var(--bg)}
::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}

/* ── Sidebar ───────────────────────────────────────────────── */
#sidebar{
  width:var(--sidebar);min-height:100vh;background:var(--surface);
  border-right:1px solid var(--border);display:flex;flex-direction:column;
  position:fixed;left:0;top:0;z-index:100
}
.sidebar-logo{padding:24px 20px 16px;border-bottom:1px solid var(--border)}
.sidebar-logo h2{font-size:20px;font-weight:700;
  background:linear-gradient(135deg,var(--accent),var(--accent2));
  -webkit-background-clip:text;-webkit-text-fill-color:transparent}
.sidebar-logo span{font-size:11px;color:var(--muted);display:block;margin-top:2px}
nav{flex:1;padding:12px 10px;overflow-y:auto}
.nav-section{font-size:10px;color:var(--muted);text-transform:uppercase;
  letter-spacing:.1em;padding:12px 10px 6px;font-weight:600}
.nav-item{display:flex;align-items:center;gap:10px;padding:9px 12px;
  border-radius:var(--radius);color:var(--subtle);margin-bottom:2px;
  transition:.15s;cursor:pointer;border:none;background:none;width:100%;text-align:left}
.nav-item:hover{background:var(--surface2);color:var(--text)}
.nav-item.active{background:rgba(99,102,241,.15);color:var(--accent);font-weight:600}
.nav-item .icon{font-size:16px;width:20px;text-align:center;flex-shrink:0}
.sidebar-footer{padding:16px 20px;border-top:1px solid var(--border)}
.sidebar-footer a{color:var(--muted);font-size:12px;display:flex;align-items:center;gap:6px}
.sidebar-footer a:hover{color:var(--danger)}

/* ── Main ──────────────────────────────────────────────────── */
#main{margin-left:var(--sidebar);flex:1;display:flex;flex-direction:column;min-width:0}
#topbar{height:58px;background:var(--surface);border-bottom:1px solid var(--border);
  display:flex;align-items:center;padding:0 28px;gap:12px;position:sticky;top:0;z-index:50}
#topbar h1{font-size:18px;font-weight:600;flex:1}
#page{padding:28px;flex:1;overflow-y:auto}

/* ── Cards & Grids ─────────────────────────────────────────── */
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px}
.card-title{font-size:13px;color:var(--muted);font-weight:600;text-transform:uppercase;
  letter-spacing:.05em;margin-bottom:16px;display:flex;align-items:center;gap:8px}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-bottom:24px}
.stat-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
  padding:20px;position:relative;overflow:hidden}
.stat-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:var(--accent)}
.stat-card.green::before{background:var(--success)}
.stat-card.yellow::before{background:var(--warning)}
.stat-card.red::before{background:var(--danger)}
.stat-card.blue::before{background:var(--info)}
.stat-label{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;font-weight:600}
.stat-value{font-size:32px;font-weight:700;margin:8px 0 4px}
.stat-sub{font-size:12px;color:var(--muted)}

/* ── Tables ────────────────────────────────────────────────── */
.table-wrap{overflow-x:auto;border-radius:var(--radius)}
table{width:100%;border-collapse:collapse;font-size:13px}
thead tr{background:var(--surface2)}
th{padding:11px 14px;text-align:left;font-size:11px;font-weight:700;color:var(--muted);
   text-transform:uppercase;letter-spacing:.07em;white-space:nowrap;
   border-bottom:1px solid var(--border)}
td{padding:11px 14px;border-bottom:1px solid rgba(45,49,84,.5);vertical-align:middle}
tr:hover td{background:rgba(255,255,255,.02)}
tr:last-child td{border-bottom:none}
.truncate{max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mono{font-family:'JetBrains Mono','Fira Code',monospace;font-size:12px}

/* ── Badges ────────────────────────────────────────────────── */
.badge{display:inline-flex;align-items:center;padding:3px 10px;border-radius:999px;
  font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
.badge-open{background:rgba(34,197,94,.12);color:#4ade80}
.badge-claimed,.badge-fiat_pending{background:rgba(59,130,246,.12);color:#60a5fa}
.badge-fiat_sent,.badge-release_pending{background:rgba(245,158,11,.12);color:#fbbf24}
.badge-crypto_sent{background:rgba(139,92,246,.12);color:#a78bfa}
.badge-completed{background:rgba(34,197,94,.15);color:#22c55e}
.badge-cancelled,.badge-expired,.badge-failed{background:rgba(239,68,68,.12);color:#f87171}
.badge-disputed{background:rgba(239,68,68,.18);color:#fca5a5}
.badge-active{background:rgba(34,197,94,.12);color:#4ade80}
.badge-banned{background:rgba(239,68,68,.15);color:#f87171}
.badge-true,.badge-processed{background:rgba(34,197,94,.12);color:#4ade80}
.badge-false,.badge-pending{background:rgba(245,158,11,.12);color:#fbbf24}

/* ── Buttons ───────────────────────────────────────────────── */
.btn{padding:8px 16px;border-radius:8px;border:none;font-size:13px;font-weight:600;
  transition:.15s;display:inline-flex;align-items:center;gap:6px}
.btn:hover{transform:translateY(-1px);opacity:.92}
.btn-primary{background:var(--accent);color:#fff}
.btn-success{background:var(--success);color:#fff}
.btn-danger{background:var(--danger);color:#fff}
.btn-ghost{background:var(--surface2);color:var(--text);border:1px solid var(--border)}
.btn-sm{padding:5px 10px;font-size:12px}

/* ── Forms ─────────────────────────────────────────────────── */
.form-grid{display:grid;gap:16px}
.form-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.form-group label{display:block;font-size:12px;color:var(--subtle);margin-bottom:5px;font-weight:600}
.form-group input,.form-group select,.form-group textarea{
  width:100%;padding:9px 12px;background:var(--bg);border:1px solid var(--border);
  border-radius:8px;color:var(--text);outline:none;transition:.15s}
.form-group input:focus,.form-group select:focus,.form-group textarea:focus{
  border-color:var(--accent);box-shadow:0 0 0 3px rgba(99,102,241,.12)}
.form-group select option{background:var(--surface)}
.form-hint{font-size:11px;color:var(--muted);margin-top:4px}

/* ── Modals ────────────────────────────────────────────────── */
.modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);
  z-index:200;align-items:center;justify-content:center}
.modal-overlay.open{display:flex}
.modal{background:var(--surface);border:1px solid var(--border);border-radius:14px;
  padding:28px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto}
.modal h3{font-size:17px;font-weight:700;margin-bottom:20px;display:flex;
  align-items:center;gap:8px}
.modal-footer{display:flex;gap:10px;justify-content:flex-end;margin-top:24px;
  padding-top:16px;border-top:1px solid var(--border)}

/* ── Alerts ────────────────────────────────────────────────── */
#toast-container{position:fixed;bottom:24px;right:24px;z-index:999;display:flex;
  flex-direction:column;gap:8px}
.toast{padding:12px 18px;border-radius:10px;font-size:13px;font-weight:600;
  display:flex;align-items:center;gap:10px;min-width:280px;max-width:400px;
  box-shadow:0 8px 32px rgba(0,0,0,.4);animation:slideIn .2s ease}
@keyframes slideIn{from{transform:translateX(60px);opacity:0}to{transform:translateX(0);opacity:1}}
.toast-success{background:#166534;border:1px solid #22c55e;color:#bbf7d0}
.toast-error{background:#7f1d1d;border:1px solid #ef4444;color:#fecaca}
.toast-info{background:#1e3a5f;border:1px solid #3b82f6;color:#bfdbfe}

/* ── Misc ──────────────────────────────────────────────────── */
.section-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}
.section-header h2{font-size:20px;font-weight:700}
.filters{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}
.filters input,.filters select{padding:7px 12px;background:var(--bg);
  border:1px solid var(--border);border-radius:8px;color:var(--text);outline:none}
.filters input:focus,.filters select:focus{border-color:var(--accent)}
.pagination{display:flex;gap:8px;align-items:center;padding:16px 0}
.loader{text-align:center;padding:40px;color:var(--muted);font-size:13px}
.empty{text-align:center;padding:60px;color:var(--muted)}
.empty-icon{font-size:36px;display:block;margin-bottom:12px}
hr{border:none;border-top:1px solid var(--border);margin:20px 0}
.settings-cat{font-size:11px;color:var(--muted);text-transform:uppercase;
  letter-spacing:.1em;font-weight:700;padding:10px 0 6px;margin-top:12px}
.setting-row{display:grid;grid-template-columns:1fr 1.2fr auto;gap:12px;
  align-items:center;padding:10px 0;border-bottom:1px solid rgba(45,49,84,.4)}
.setting-row:last-child{border-bottom:none}
.setting-info .key{font-weight:600;font-size:13px;font-family:monospace}
.setting-info .desc{font-size:11px;color:var(--muted);margin-top:2px}
.setting-input input,.setting-input select{width:100%;padding:7px 10px;
  background:var(--bg);border:1px solid var(--border);border-radius:7px;
  color:var(--text);outline:none}
.setting-input input:focus{border-color:var(--accent)}
</style>
</head>
<body>

<!-- Sidebar -->
<div id="sidebar">
  <div class="sidebar-logo">
    <h2>⚡ RapidEx</h2>
    <span>Admin Dashboard</span>
  </div>
  <nav id="nav">
    <div class="nav-section">Main</div>
    <button class="nav-item active" data-page="overview"><span class="icon">📊</span>Overview</button>
    <button class="nav-item" data-page="trades"><span class="icon">💱</span>Trades</button>
    <button class="nav-item" data-page="exchangers"><span class="icon">👤</span>Exchangers</button>

    <div class="nav-section">Finance</div>
    <button class="nav-item" data-page="ledger"><span class="icon">📒</span>Ledger</button>
    <button class="nav-item" data-page="fees"><span class="icon">💸</span>Fee Config</button>
    <button class="nav-item" data-page="hot-wallets"><span class="icon">🏦</span>Hot Wallets</button>

    <div class="nav-section">Monitoring</div>
    <button class="nav-item" data-page="webhooks"><span class="icon">🔗</span>Webhook Events</button>
    <button class="nav-item" data-page="audit"><span class="icon">📜</span>Audit Log</button>
    <button class="nav-item" data-page="addresses"><span class="icon">📬</span>Deposit Addresses</button>

    <div class="nav-section">Config</div>
    <button class="nav-item" data-page="settings"><span class="icon">⚙️</span>Settings</button>
  </nav>
  <div class="sidebar-footer"><a href="/dashboard/logout">🚪 Sign Out</a></div>
</div>

<!-- Main -->
<div id="main">
  <div id="topbar">
    <h1 id="topbar-title">Overview</h1>
    <div id="topbar-actions"></div>
  </div>
  <div id="page"></div>
</div>

<!-- Toast container -->
<div id="toast-container"></div>

<!-- Modals -->
<div class="modal-overlay" id="modal-overlay">
  <div class="modal" id="modal-content"></div>
</div>

<script>
// ─────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const page   = $('page');
const topbar = $('topbar-title');
const actions= $('topbar-actions');

function toast(msg, type='info') {
  const el = document.createElement('div');
  el.className = 'toast toast-'+type;
  el.innerHTML = (type==='success'?'✅':type==='error'?'❌':'ℹ️')+' <span>'+msg+'</span>';
  $('toast-container').appendChild(el);
  setTimeout(()=>el.remove(), 4000);
}

async function api(path, opts={}) {
  const res = await fetch('/dashboard/api'+path, {
    headers:{'Content-Type':'application/json',...(opts.headers||{})},
    ...opts
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error||'API error');
  return json.data;
}

function badge(val, map) {
  const cls = map ? map[val] : val;
  return '<span class="badge badge-'+String(val).toLowerCase().replace(' ','-')+'">'+val+'</span>';
}

function ts(d) {
  if(!d) return '—';
  return new Date(d).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
}

function num(n, dec=8) { return parseFloat(n||0).toFixed(dec); }

function modal(html) {
  $('modal-content').innerHTML = html;
  $('modal-overlay').classList.add('open');
}
function closeModal() { $('modal-overlay').classList.remove('open'); }
$('modal-overlay').addEventListener('click', e => { if(e.target===$('modal-overlay')) closeModal(); });

function loading() { page.innerHTML='<div class="loader">⏳ Loading...</div>'; }
function empty(msg='No data') {
  return '<div class="empty"><span class="empty-icon">📭</span>'+msg+'</div>';
}

function pager(current, total, limit, cb) {
  const pages = Math.ceil(total/limit);
  if(pages<=1) return '';
  let html='<div class="pagination"><span style="color:var(--muted);font-size:12px">Page '+(current+1)+' of '+pages+'</span>';
  if(current>0) html+='<button class="btn btn-ghost btn-sm" onclick="('+cb+')('+（current-1)+')">← Prev</button>';
  if(current<pages-1) html+='<button class="btn btn-ghost btn-sm" onclick="('+cb+')('+（current+1)+')">Next →</button>';
  return html+'</div>';
}

// ─────────────────────────────────────────────────────────────
// OVERVIEW
// ─────────────────────────────────────────────────────────────
async function loadOverview() {
  topbar.textContent='Overview'; actions.innerHTML='';
  loading();
  const d = await api('/overview');
  const counts = {};
  d.tradeCounts.forEach(r=>counts[r.status]=parseInt(r.count));
  const total = Object.values(counts).reduce((a,b)=>a+b,0);
  const active = (counts.OPEN||0)+(counts.CLAIMED||0)+(counts.FIAT_PENDING||0)+(counts.FIAT_SENT||0)+(counts.RELEASE_PENDING||0);

  // Build asset summary from ledger totals
  const assetMap={};
  d.ledgerTotals.forEach(r=>{
    if(!assetMap[r.asset]) assetMap[r.asset]={dep:0,with:0,fee:0};
    if(r.type==='DEPOSIT')    assetMap[r.asset].dep  +=parseFloat(r.total);
    if(r.type==='WITHDRAWAL') assetMap[r.asset].with +=parseFloat(r.total);
    if(r.type==='FEE')        assetMap[r.asset].fee  +=parseFloat(r.total);
  });

  page.innerHTML=\`
  <div class="stats-grid">
    <div class="stat-card blue"><div class="stat-label">Total Trades</div><div class="stat-value">\${total}</div><div class="stat-sub">all time</div></div>
    <div class="stat-card yellow"><div class="stat-label">Active Trades</div><div class="stat-value">\${active}</div><div class="stat-sub">in progress</div></div>
    <div class="stat-card green"><div class="stat-label">Completed</div><div class="stat-value">\${counts.COMPLETED||0}</div><div class="stat-sub">successfully settled</div></div>
    <div class="stat-card"><div class="stat-label">Exchangers</div><div class="stat-value">\${d.exchangerCount}</div><div class="stat-sub">active & verified</div></div>
    <div class="stat-card red"><div class="stat-label">Disputed</div><div class="stat-value">\${counts.DISPUTED||0}</div><div class="stat-sub">need attention</div></div>
    <div class="stat-card"><div class="stat-label">Webhooks</div><div class="stat-value">\${d.webhookCount}</div><div class="stat-sub">processed events</div></div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
    <div class="card">
      <div class="card-title">📊 Trade Status Breakdown</div>
      \${Object.entries(counts).map(([s,c])=>
        \`<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border)">
          <span>\${badge(s)}</span><strong>\${c}</strong></div>\`
      ).join('')}
    </div>
    <div class="card">
      <div class="card-title">💰 Ledger Summary</div>
      \${Object.entries(assetMap).length===0?'<p style="color:var(--muted)">No ledger data</p>':
        Object.entries(assetMap).map(([a,v])=>
          \`<div style="padding:7px 0;border-bottom:1px solid var(--border)">
            <strong>\${a}</strong>
            <div style="font-size:11px;color:var(--muted);margin-top:3px">
              In: <span style="color:var(--success)">\${v.dep.toFixed(8)}</span> &nbsp;
              Out: <span style="color:var(--danger)">\${v.with.toFixed(8)}</span> &nbsp;
              Fees: <span style="color:var(--warning)">\${v.fee.toFixed(8)}</span>
            </div>
          </div>\`
        ).join('')
      }
    </div>
  </div>

  <div class="card">
    <div class="card-title">⏱ Recent Trades</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>ID</th><th>User</th><th>Asset</th><th>Amount</th><th>Status</th><th>Created</th></tr></thead>
        <tbody>
        \${d.recentTrades.map(t=>\`<tr>
          <td><span class="mono truncate" style="max-width:80px">\${t.id.slice(0,8)}…</span></td>
          <td><span class="mono">\${t.user_discord_id}</span></td>
          <td><strong>\${t.asset}</strong></td>
          <td class="mono">\${num(t.amount)}</td>
          <td>\${badge(t.status)}</td>
          <td>\${ts(t.created_at)}</td>
        </tr>\`).join('')}
        </tbody>
      </table>
    </div>
  </div>
  \`;
}

// ─────────────────────────────────────────────────────────────
// TRADES
// ─────────────────────────────────────────────────────────────
let tradeFilter='', tradePage=0;
async function loadTrades(p=0) {
  tradePage=p; topbar.textContent='Trades';
  actions.innerHTML='';
  loading();
  const status = tradeFilter||'';
  const d = await api(\`/trades?status=\${status}&page=\${p}&limit=50\`);
  page.innerHTML=\`
  <div class="section-header">
    <h2>All Trades</h2>
    <div class="filters">
      <select id="trade-status-filter" onchange="tradeFilter=this.value;loadTrades(0)">
        <option value="">All Statuses</option>
        \${['OPEN','CLAIMED','FIAT_PENDING','FIAT_SENT','RELEASE_PENDING','CRYPTO_SENT',
            'COMPLETED','CANCELLED','DISPUTED','EXPIRED','FAILED']
          .map(s=>\`<option \${tradeFilter===s?'selected':''} value="\${s}">\${s}</option>\`).join('')}
      </select>
    </div>
  </div>
  <div class="card">
    <div class="table-wrap">
      <table>
        <thead><tr><th>ID</th><th>User</th><th>Exchanger</th><th>Asset</th><th>Amount</th><th>Fiat</th><th>Direction</th><th>Status</th><th>Created</th><th></th></tr></thead>
        <tbody>
        \${d.trades.map(t=>\`<tr>
          <td><span class="mono">\${t.id.slice(0,8)}…</span></td>
          <td><span class="mono">\${t.user_discord_id}</span></td>
          <td><span class="mono">\${t.exchanger_id?t.exchanger_id.slice(0,8)+'…':'—'}</span></td>
          <td><strong>\${t.asset}</strong></td>
          <td class="mono">\${num(t.amount)}</td>
          <td>\${t.fiat_currency} / \${t.fiat_method.replace(/_/g,' ')}</td>
          <td>\${t.direction==='BUY'?'🟢 Buy':'🔴 Sell'}</td>
          <td>\${badge(t.status)}</td>
          <td>\${ts(t.created_at)}</td>
          <td><button class="btn btn-ghost btn-sm" onclick="loadTradeDetail('\${t.id}')">View</button></td>
        </tr>\`).join('') || '<tr><td colspan="10">'+empty('No trades')+'</td></tr>'}
        </tbody>
      </table>
    </div>
    \${pager(p, parseInt(d.total), 50, 'loadTrades')}
  </div>
  \`;
}

async function loadTradeDetail(id) {
  const d = await api('/trades/'+id);
  const t = d.trade;
  modal(\`
  <h3>💱 Trade \${t.id.slice(0,8)}…</h3>
  <div class="form-grid">
    \${[['ID',t.id],['Status',badge(t.status)],['User',t.user_discord_id],
       ['Exchanger',t.exchanger_id||'—'],['Asset',t.asset],['Amount',num(t.amount)],
       ['Direction',t.direction],['Fiat',t.fiat_currency+' / '+t.fiat_method],
       ['Wallet',t.user_wallet_address||'—'],['TX ID',t.tx_id||'—'],
       ['Created',ts(t.created_at)],['Updated',ts(t.updated_at)]
    ].map(([l,v])=>\`<div style="display:flex;justify-content:space-between;padding:7px 0;
      border-bottom:1px solid var(--border);font-size:13px">
      <span style="color:var(--muted)">\${l}</span><span>\${v}</span></div>\`).join('')}
  </div>
  <hr>
  <div class="card-title" style="margin-top:0">State History</div>
  <div style="font-size:12px">
    \${d.logs.map(l=>\`<div style="padding:5px 0;display:flex;gap:12px;border-bottom:1px solid rgba(45,49,84,.3)">
      <span style="color:var(--muted);white-space:nowrap">\${ts(l.created_at)}</span>
      <span>\${l.from_status||'—'} → <strong>\${l.to_status}</strong></span>
      <span style="color:var(--muted)">\${l.actor_discord_id}</span>
      \${l.note?'<span style="color:var(--subtle)">'+l.note+'</span>':''}
    </div>\`).join('')}
  </div>
  <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Close</button></div>
  \`);
}

// ─────────────────────────────────────────────────────────────
// EXCHANGERS
// ─────────────────────────────────────────────────────────────
async function loadExchangers() {
  topbar.textContent='Exchangers';
  actions.innerHTML=\`<button class="btn btn-primary" onclick="openVerifyModal()">+ Verify Exchanger</button>\`;
  loading();
  const exchangers = await api('/exchangers');
  page.innerHTML=\`
  <div class="card">
    <div class="card-title">👤 Verified Exchangers</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Username</th><th>Discord ID</th><th>Status</th><th>Verified By</th><th>Verified At</th><th></th></tr></thead>
        <tbody>
        \${exchangers.map(e=>\`<tr>
          <td><strong>\${e.discord_username}</strong></td>
          <td class="mono">\${e.discord_id}</td>
          <td>\${badge(e.is_banned?'BANNED':e.is_active?'ACTIVE':'INACTIVE')}</td>
          <td class="mono">\${e.verified_by_discord_id}</td>
          <td>\${ts(e.verified_at)}</td>
          <td style="display:flex;gap:6px">
            <button class="btn btn-ghost btn-sm" onclick="loadExchangerDetail('\${e.id}')">View</button>
            \${!e.is_banned?'<button class="btn btn-danger btn-sm" onclick="openBanModal(\\'\${e.discord_id}\\',\\'\${e.discord_username}\\')">Ban</button>':''}
          </td>
        </tr>\`).join('') || '<tr><td colspan="6">'+empty('No exchangers')+'</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>
  \`;
}

async function loadExchangerDetail(id) {
  const d = await api('/exchangers/'+id);
  const e = d.exchanger;
  const bals = Object.values(d.balances).filter(b=>parseFloat(b.available)>0||parseFloat(b.escrow)>0);
  modal(\`
  <h3>👤 \${e.discord_username}</h3>
  <div style="font-size:12px;margin-bottom:16px">
    \${[['ID',e.id],['Discord ID',e.discord_id],['Status',badge(e.is_banned?'BANNED':'ACTIVE')],
       ['Verified',ts(e.verified_at)],['Ban reason',e.ban_reason||'—']
    ].map(([l,v])=>\`<div style="display:flex;justify-content:space-between;padding:6px 0;
      border-bottom:1px solid var(--border)">
      <span style="color:var(--muted)">\${l}</span><span>\${v}</span></div>\`).join('')}
  </div>
  <div class="card-title">💰 Balances</div>
  \${bals.length===0?'<p style="color:var(--muted);font-size:12px">No balances</p>':
    bals.map(b=>\`<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;display:flex;justify-content:space-between">
      <strong>\${b.asset}</strong>
      <span>Avail: <span style="color:var(--success)">\${num(b.available)}</span>  Escrow: <span style="color:var(--warning)">\${num(b.escrow)}</span></span>
    </div>\`).join('')}
  <div class="card-title" style="margin-top:16px">🔑 Deposit Addresses</div>
  \${d.addresses.map(a=>\`<div style="padding:5px 0;font-size:11px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between">
    <strong>\${a.asset}</strong><span class="mono">\${a.address}</span></div>\`).join('')}
  <hr>
  <div style="display:flex;gap:10px">
    <button class="btn btn-primary btn-sm" onclick="closeModal();openCreditModal('\${e.id}','\${e.discord_username}')">Credit</button>
    <button class="btn btn-danger btn-sm" onclick="closeModal();openDebitModal('\${e.id}','\${e.discord_username}')">Debit</button>
  </div>
  <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Close</button></div>
  \`);
}

function openVerifyModal() {
  modal(\`
  <h3>✅ Verify Exchanger</h3>
  <div class="form-grid">
    <div class="form-group"><label>Discord ID</label><input id="v-did" placeholder="123456789012345678"></div>
    <div class="form-group"><label>Username</label><input id="v-uname" placeholder="user#0000"></div>
  </div>
  <div class="modal-footer">
    <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="doVerify()">Verify</button>
  </div>
  \`);
}

async function doVerify() {
  try {
    await api('/exchangers/verify',{method:'POST',body:JSON.stringify({
      targetDiscordId:$('v-did').value.trim(),
      targetUsername:$('v-uname').value.trim()
    })});
    closeModal(); toast('Exchanger verified!','success'); loadExchangers();
  } catch(e){ toast(e.message,'error'); }
}

function openBanModal(discordId, username) {
  modal(\`
  <h3>⛔ Ban \${username}</h3>
  <div class="form-group"><label>Reason</label><input id="ban-reason" placeholder="Reason for ban"></div>
  <div class="modal-footer">
    <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    <button class="btn btn-danger" onclick="doBan('\${discordId}')">Confirm Ban</button>
  </div>
  \`);
}

async function doBan(discordId) {
  try {
    await api('/exchangers/ban',{method:'POST',body:JSON.stringify({targetDiscordId:discordId,reason:$('ban-reason').value})});
    closeModal(); toast('Exchanger banned','success'); loadExchangers();
  } catch(e){ toast(e.message,'error'); }
}

function openCreditModal(id, name) {
  modal(\`
  <h3>💰 Credit — \${name}</h3>
  \${ledgerForm(id,'credit')}
  \`);
}
function openDebitModal(id, name) {
  modal(\`
  <h3>💸 Debit — \${name}</h3>
  \${ledgerForm(id,'debit')}
  \`);
}
function ledgerForm(id, type) {
  return \`<div class="form-grid">
    <div class="form-group"><label>Asset</label><select id="lf-asset">
      \${['BTC','LTC','ETH','USDT_ERC20','USDC_ERC20','USDC_SPL'].map(a=>'<option>'+a+'</option>').join('')}
    </select></div>
    <div class="form-group"><label>Amount</label><input id="lf-amount" placeholder="0.00000000"></div>
    <div class="form-group"><label>Reason</label><input id="lf-reason" placeholder="Admin adjustment"></div>
  </div>
  <div class="modal-footer">
    <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
    <button class="btn \${type==='credit'?'btn-success':'btn-danger'}" onclick="doLedger('\${id}','\${type}')">Apply</button>
  </div>\`;
}

async function doLedger(id, type) {
  try {
    await api('/ledger/'+type,{method:'POST',body:JSON.stringify({
      exchangerId:id, asset:$('lf-asset').value, amount:$('lf-amount').value, reason:$('lf-reason').value
    })});
    closeModal(); toast(type==='credit'?'Credit applied!':'Debit applied!','success');
  } catch(e){ toast(e.message,'error'); }
}

// ─────────────────────────────────────────────────────────────
// LEDGER
// ─────────────────────────────────────────────────────────────
let ledgerPage=0, ledgerAsset='', ledgerExchId='';
async function loadLedger(p=0) {
  ledgerPage=p; topbar.textContent='Ledger'; actions.innerHTML='';
  loading();
  const d = await api(\`/ledger?page=\${p}&limit=100&asset=\${ledgerAsset}&exchanger_id=\${ledgerExchId}\`);
  page.innerHTML=\`
  <div class="section-header"><h2>Ledger Entries</h2></div>
  <div class="filters">
    <select onchange="ledgerAsset=this.value;loadLedger(0)">
      <option value="">All Assets</option>
      \${['BTC','LTC','ETH','USDT_ERC20','USDC_ERC20','USDC_SPL'].map(a=>\`<option \${ledgerAsset===a?'selected':''} value="\${a}">\${a}</option>\`).join('')}
    </select>
    <input placeholder="Exchanger ID filter" value="\${ledgerExchId}"
      onchange="ledgerExchId=this.value;loadLedger(0)">
  </div>
  <div class="card">
    <div class="table-wrap">
      <table>
        <thead><tr><th>Time</th><th>Exchanger</th><th>Type</th><th>Asset</th><th>Amount</th><th>Bal Before</th><th>Bal After</th><th>Reference</th></tr></thead>
        <tbody>
        \${d.entries.map(e=>\`<tr>
          <td style="white-space:nowrap">\${ts(e.created_at)}</td>
          <td>\${e.discord_username||e.exchanger_id.slice(0,8)}</td>
          <td>\${badge(e.type)}</td>
          <td><strong>\${e.asset}</strong></td>
          <td class="mono">\${num(e.amount)}</td>
          <td class="mono">\${num(e.balance_before)}</td>
          <td class="mono">\${num(e.balance_after)}</td>
          <td class="truncate" style="max-width:200px;font-size:11px;color:var(--subtle)">\${e.reference}</td>
        </tr>\`).join('') || '<tr><td colspan="8">'+empty('No entries')+'</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>
  \`;
}

// ─────────────────────────────────────────────────────────────
// FEES
// ─────────────────────────────────────────────────────────────
async function loadFees() {
  topbar.textContent='Fee Config'; actions.innerHTML='';
  loading();
  const fees = await api('/fees');
  page.innerHTML=\`
  <div class="section-header"><h2>Fee Configuration</h2></div>
  <div class="card">
    <div class="card-title">Per-asset fee settings</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Asset</th><th>Fee %</th><th>Min Fee</th><th>Updated By</th><th>Updated</th><th></th></tr></thead>
        <tbody>
        \${fees.map(f=>\`<tr>
          <td><strong>\${f.asset}</strong></td>
          <td><input id="fee-pct-\${f.asset}" class="mono" value="\${f.fee_percentage}" style="width:80px;padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text)"></td>
          <td><input id="fee-min-\${f.asset}" class="mono" value="\${f.min_fee_amount}" style="width:120px;padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text)"></td>
          <td class="mono">\${f.updated_by_discord_id}</td>
          <td>\${ts(f.updated_at)}</td>
          <td><button class="btn btn-primary btn-sm" onclick="saveFee('\${f.asset}')">Save</button></td>
        </tr>\`).join('')}
        </tbody>
      </table>
    </div>
  </div>
  \`;
}

async function saveFee(asset) {
  try {
    await api('/fees',{method:'POST',body:JSON.stringify({
      asset, fee_percentage:$('fee-pct-'+asset).value, min_fee_amount:$('fee-min-'+asset).value
    })});
    toast('Fee updated for '+asset,'success');
  } catch(e){ toast(e.message,'error'); }
}

// ─────────────────────────────────────────────────────────────
// HOT WALLETS
// ─────────────────────────────────────────────────────────────
async function loadHotWallets() {
  topbar.textContent='Hot Wallets'; actions.innerHTML='';
  loading();
  const wallets = await api('/hot-wallets');
  page.innerHTML=\`
  <div class="card">
    <div class="card-title">🏦 Hot Wallet Balances</div>
    \${wallets.length===0?empty('No hot wallet data recorded yet'):
      '<div class="table-wrap"><table><thead><tr><th>Asset</th><th>Address</th><th>Balance</th><th>Last Checked</th></tr></thead><tbody>'+
      wallets.map(w=>\`<tr>
        <td><strong>\${w.asset}</strong></td>
        <td class="mono truncate">\${w.address}</td>
        <td class="mono">\${num(w.balance)}</td>
        <td>\${ts(w.last_checked_at)}</td>
      </tr>\`).join('')+'</tbody></table></div>'}
  </div>
  \`;
}

// ─────────────────────────────────────────────────────────────
// WEBHOOKS
// ─────────────────────────────────────────────────────────────
let whPage=0;
async function loadWebhooks(p=0) {
  whPage=p; topbar.textContent='Webhook Events'; actions.innerHTML='';
  loading();
  const d = await api('/webhooks?page='+p+'&limit=50');
  page.innerHTML=\`
  <div class="card">
    <div class="card-title">🔗 Incoming Webhook Events</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Time</th><th>Provider</th><th>Event ID</th><th>Status</th><th>Error</th></tr></thead>
        <tbody>
        \${d.events.map(e=>\`<tr>
          <td>\${ts(e.created_at)}</td>
          <td>\${badge(e.provider)}</td>
          <td class="mono truncate" style="max-width:200px">\${e.event_id}</td>
          <td>\${badge(e.processed?'processed':'pending')}</td>
          <td style="font-size:11px;color:var(--danger)">\${e.error||''}</td>
        </tr>\`).join('') || '<tr><td colspan="5">'+empty('No events')+'</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>
  \`;
}

// ─────────────────────────────────────────────────────────────
// AUDIT LOG
// ─────────────────────────────────────────────────────────────
let auditPage=0, auditAction='';
async function loadAudit(p=0) {
  auditPage=p; topbar.textContent='Audit Log'; actions.innerHTML='';
  loading();
  const d = await api('/audit?page='+p+'&limit=100&action='+auditAction);
  page.innerHTML=\`
  <div class="filters">
    <select onchange="auditAction=this.value;loadAudit(0)">
      <option value="">All Actions</option>
      \${['EXCHANGER_VERIFIED','EXCHANGER_BANNED','MANUAL_CREDIT','MANUAL_DEBIT',
         'FORCE_RELEASE','FORCE_CANCEL','FEE_CONFIG_UPDATED','TRADE_DISPUTED',
         'DISPUTE_RESOLVED','PANEL_DEPLOYED','WEBHOOK_REGISTERED','SYSTEM_ACTION']
        .map(a=>\`<option \${auditAction===a?'selected':''} value="\${a}">\${a}</option>\`).join('')}
    </select>
  </div>
  <div class="card">
    <div class="table-wrap">
      <table>
        <thead><tr><th>Time</th><th>Actor</th><th>Target</th><th>Action</th><th>Entity</th><th>Metadata</th></tr></thead>
        <tbody>
        \${d.entries.map(e=>\`<tr>
          <td style="white-space:nowrap">\${ts(e.created_at)}</td>
          <td class="mono">\${e.actor_discord_id}</td>
          <td class="mono">\${e.target_discord_id||'—'}</td>
          <td>\${badge(e.action)}</td>
          <td style="font-size:11px">\${e.entity_type||''} \${e.entity_id?e.entity_id.slice(0,8)+'…':''}</td>
          <td style="font-size:11px;color:var(--muted)" class="truncate">\${e.metadata?JSON.stringify(e.metadata):''}</td>
        </tr>\`).join('') || '<tr><td colspan="6">'+empty('No entries')+'</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>
  \`;
}

// ─────────────────────────────────────────────────────────────
// DEPOSIT ADDRESSES
// ─────────────────────────────────────────────────────────────
async function loadAddresses() {
  topbar.textContent='Deposit Addresses'; actions.innerHTML='';
  loading();
  const rows = await api('/addresses');
  page.innerHTML=\`
  <div class="card">
    <div class="card-title">📬 All Deposit Addresses</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Exchanger</th><th>Asset</th><th>Chain</th><th>Address</th><th>Path</th></tr></thead>
        <tbody>
        \${rows.map(r=>\`<tr>
          <td>\${r.discord_username||r.exchanger_id.slice(0,8)}</td>
          <td><strong>\${r.asset}</strong></td>
          <td>\${r.chain}</td>
          <td class="mono truncate" style="max-width:260px">\${r.address}</td>
          <td class="mono" style="font-size:11px;color:var(--muted)">\${r.derivation_path}</td>
        </tr>\`).join('') || '<tr><td colspan="5">'+empty()+'</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>
  \`;
}

// ─────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────
async function loadSettings() {
  topbar.textContent='Settings';
  actions.innerHTML='<button class="btn btn-primary" onclick="saveAllSettings()">💾 Save All Changes</button>';
  loading();
  const settings = await api('/settings');

  // Group by category
  const cats = {};
  settings.forEach(s => {
    if(!cats[s.category]) cats[s.category]=[];
    cats[s.category].push(s);
  });

  const BOOL_KEYS   = ['MAINTENANCE_MODE'];
  const SELECT_KEYS = {
    NETWORK: ['mainnet','testnet'],
  };

  page.innerHTML=\`
  <div class="section-header">
    <h2>Bot Settings</h2>
    <span style="font-size:12px;color:var(--muted)">Changes are applied within 60 seconds. Click "Save All Changes" to persist.</span>
  </div>

  \${Object.entries(cats).map(([cat, items])=>\`
  <div class="card" style="margin-bottom:16px">
    <div class="card-title">\${{
      discord:'🎮 Discord Role & Channel IDs',
      timeouts:'⏱ Trade Timeouts',
      limits:'🚦 Rate Limits',
      thresholds:'🔔 Hot Wallet Alert Thresholds',
      fees:'💸 Default Fees',
      network:'🌐 Network',
      general:'⚙️ General'
    }[cat]||cat.toUpperCase()}</div>
    \${items.map(s=>\`
    <div class="setting-row" id="row-\${s.key}">
      <div class="setting-info">
        <div class="key">\${s.key}</div>
        <div class="desc">\${s.description}</div>
      </div>
      <div class="setting-input">
        \${BOOL_KEYS.includes(s.key)?
          \`<select id="setting-\${s.key}">
            <option value="false" \${s.value!=='true'?'selected':''}>false</option>
            <option value="true"  \${s.value==='true'?'selected':''}>true</option>
           </select>\`:
          SELECT_KEYS[s.key]?
          \`<select id="setting-\${s.key}">
            \${SELECT_KEYS[s.key].map(v=>\`<option value="\${v}" \${s.value===v?'selected':''}>\${v}</option>\`).join('')}
           </select>\`:
          \`<input id="setting-\${s.key}" value="\${s.value}" placeholder="\${s.description}">\`
        }
      </div>
      <div>
        <button class="btn btn-ghost btn-sm" onclick="saveSetting('\${s.key}')">Save</button>
      </div>
    </div>
    \`).join('')}
  </div>
  \`).join('')}
  \`;
}

async function saveSetting(key) {
  try {
    const el = $('setting-'+key);
    await api('/settings/'+key,{method:'POST',body:JSON.stringify({value:el.value})});
    toast(key+' saved','success');
  } catch(e){ toast(e.message,'error'); }
}

async function saveAllSettings() {
  try {
    const all = document.querySelectorAll('[id^="setting-"]');
    const updates = {};
    all.forEach(el => { updates[el.id.replace('setting-','')] = el.value; });
    await api('/settings',{method:'POST',body:JSON.stringify(updates)});
    toast('All settings saved!','success');
  } catch(e){ toast(e.message,'error'); }
}

// ─────────────────────────────────────────────────────────────
// ROUTER
// ─────────────────────────────────────────────────────────────
const pages = {
  overview:    loadOverview,
  trades:      loadTrades,
  exchangers:  loadExchangers,
  ledger:      loadLedger,
  fees:        loadFees,
  'hot-wallets': loadHotWallets,
  webhooks:    loadWebhooks,
  audit:       loadAudit,
  addresses:   loadAddresses,
  settings:    loadSettings,
};

document.querySelectorAll('.nav-item[data-page]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const fn = pages[btn.dataset.page];
    if(fn) fn().catch(e=>{ page.innerHTML='<div class="loader" style="color:var(--danger)">Error: '+e.message+'</div>'; });
  });
});

// Load default page
loadOverview().catch(console.error);

// Auto-refresh overview every 30s
setInterval(()=>{
  if(document.querySelector('.nav-item[data-page="overview"]')?.classList.contains('active')){
    loadOverview().catch(()=>{});
  }
},30000);
</script>
</body>
</html>`;
}
