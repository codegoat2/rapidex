/**
 * Renders the premium exchanger dashboard HTML.
 * Single-file SPA with inline CSS and JS.
 */

export function renderExchangerShell(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>RapidEx — Exchanger Portal</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  :root{
    --bg:#06060b;--surface:#0f0f1a;--surface2:#1a1a2e;--border:#2a2a3a;
    --accent:#6366f1;--accent2:#a855f7;--success:#22c55e;--warning:#f59e0b;
    --danger:#ef4444;--info:#3b82f6;--text:#f1f5f9;--muted:#64748b;--subtle:#94a3b8;
    --radius:14px;--sidebar:260px
  }
  body{background:var(--bg);color:var(--text);font-family:'Inter',system-ui,-apple-system,sans-serif;
       font-size:14px;display:flex;min-height:100vh;overflow-x:hidden}
  a{color:var(--accent);text-decoration:none}
  button{cursor:pointer;font-family:inherit}
  input,select,textarea{font-family:inherit;font-size:14px}
  ::-webkit-scrollbar{width:5px;height:5px}
  ::-webkit-scrollbar-track{background:var(--bg)}
  ::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}

  /* Sidebar */
  #sidebar{
    width:var(--sidebar);min-height:100vh;background:var(--surface);
    border-right:1px solid var(--border);display:flex;flex-direction:column;
    position:fixed;left:0;top:0;z-index:100;backdrop-filter:blur(20px)
  }
  .sidebar-logo{padding:28px 22px 20px;border-bottom:1px solid var(--border)}
  .sidebar-logo h2{font-size:22px;font-weight:800;
    background:linear-gradient(135deg,var(--accent),var(--accent2));
    -webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-.02em}
  .sidebar-logo span{font-size:11px;color:var(--muted);display:block;margin-top:3px;font-weight:500}
  nav{flex:1;padding:14px 12px;overflow-y:auto}
  .nav-section{font-size:10px;color:var(--muted);text-transform:uppercase;
    letter-spacing:.12em;padding:14px 12px 8px;font-weight:700}
  .nav-item{display:flex;align-items:center;gap:11px;padding:10px 14px;
    border-radius:var(--radius);color:var(--subtle);margin-bottom:3px;
    transition:.15s;cursor:pointer;border:none;background:none;width:100%;text-align:left;
    font-size:13px;font-weight:500}
  .nav-item:hover{background:var(--surface2);color:var(--text)}
  .nav-item.active{background:linear-gradient(135deg,rgba(99,102,241,.15),rgba(168,85,247,.15));
    color:var(--accent);font-weight:700;border:1px solid rgba(99,102,241,.2)}
  .nav-item .icon{font-size:15px;width:22px;text-align:center;flex-shrink:0}
  .sidebar-footer{padding:18px 22px;border-top:1px solid var(--border)}
  .sidebar-footer a{color:var(--muted);font-size:12px;display:flex;align-items:center;gap:8px;
    font-weight:500;transition:.15s}
  .sidebar-footer a:hover{color:var(--danger)}

  /* Main */
  #main{margin-left:var(--sidebar);flex:1;display:flex;flex-direction:column;min-width:0}
  #topbar{height:64px;background:rgba(15,15,26,.8);border-bottom:1px solid var(--border);
    display:flex;align-items:center;padding:0 32px;gap:16px;position:sticky;top:0;z-index:50;
    backdrop-filter:blur(20px)}
  #topbar h1{font-size:20px;font-weight:700;flex:1;letter-spacing:-.01em}
  #page{padding:32px;flex:1;overflow-y:auto}

  /* Cards & Grids */
  .card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:24px;
    transition:.2s}
  .card:hover{border-color:rgba(99,102,241,.3);box-shadow:0 8px 32px rgba(0,0,0,.2)}
  .card-title{font-size:12px;color:var(--muted);font-weight:700;text-transform:uppercase;
    letter-spacing:.08em;margin-bottom:18px;display:flex;align-items:center;gap:10px}
  .stats-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:18px;margin-bottom:28px}
  .stat-card{background:linear-gradient(135deg,var(--surface),var(--surface2));
    border:1px solid var(--border);border-radius:var(--radius);padding:22px;position:relative;
    overflow:hidden;transition:.2s}
  .stat-card:hover{transform:translateY(-2px);box-shadow:0 12px 40px rgba(0,0,0,.3)}
  .stat-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;
    background:linear-gradient(90deg,var(--accent),var(--accent2))}
  .stat-card.green::before{background:linear-gradient(90deg,var(--success),#10b981)}
  .stat-card.yellow::before{background:linear-gradient(90deg,var(--warning),#fbbf24)}
  .stat-card.red::before{background:linear-gradient(90deg,var(--danger),#f87171)}
  .stat-label{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;font-weight:700}
  .stat-value{font-size:34px;font-weight:800;margin:10px 0 4px;letter-spacing:-.02em;
    background:linear-gradient(135deg,var(--text),var(--subtle));
    -webkit-background-clip:text;-webkit-text-fill-color:transparent}
  .stat-sub{font-size:12px;color:var(--muted);font-weight:500}

  /* Tables */
  .table-wrap{overflow-x:auto;border-radius:var(--radius)}
  table{width:100%;border-collapse:collapse;font-size:13px}
  thead tr{background:var(--surface2)}
  th{padding:12px 16px;text-align:left;font-size:10px;font-weight:700;color:var(--muted);
    text-transform:uppercase;letter-spacing:.08em;white-space:nowrap;
    border-bottom:1px solid var(--border)}
  td{padding:12px 16px;border-bottom:1px solid rgba(42,42,58,.5);vertical-align:middle}
  tr:hover td{background:rgba(99,102,241,.03)}
  tr:last-child td{border-bottom:none}
  .truncate{max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .mono{font-family:'JetBrains Mono','Fira Code',monospace;font-size:12px}

  /* Badges */
  .badge{display:inline-flex;align-items:center;padding:4px 12px;border-radius:999px;
    font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
  .badge-open{background:rgba(34,197,94,.12);color:#4ade80}
  .badge-claimed,.badge-fiat_pending{background:rgba(59,130,246,.12);color:#60a5fa}
  .badge-fiat_sent,.badge-release_pending{background:rgba(245,158,11,.12);color:#fbbf24}
  .badge-crypto_sent{background:rgba(139,92,246,.12);color:#a78bfa}
  .badge-completed{background:rgba(34,197,94,.15);color:#22c55e}
  .badge-cancelled,.badge-expired,.badge-failed{background:rgba(239,68,68,.12);color:#f87171}
  .badge-disputed{background:rgba(239,68,68,.18);color:#fca5a5}
  .badge-active{background:rgba(34,197,94,.12);color:#4ade80}
  .badge-banned{background:rgba(239,68,68,.15);color:#f87171}
  .badge-pending{background:rgba(245,158,11,.12);color:#fbbf24}
  .badge-processed{background:rgba(34,197,94,.12);color:#4ade80}

  /* Buttons */
  .btn{padding:9px 18px;border-radius:10px;border:none;font-size:13px;font-weight:600;
    transition:.15s;display:inline-flex;align-items:center;gap:7px}
  .btn:hover{transform:translateY(-1px);opacity:.92}
  .btn-primary{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff}
  .btn-success{background:linear-gradient(135deg,var(--success),#10b981);color:#fff}
  .btn-danger{background:linear-gradient(135deg,var(--danger),#f87171);color:#fff}
  .btn-ghost{background:var(--surface2);color:var(--text);border:1px solid var(--border)}
  .btn-sm{padding:6px 12px;font-size:12px}

  /* Forms */
  .form-grid{display:grid;gap:18px}
  .form-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
  .form-group label{display:block;font-size:12px;color:var(--subtle);margin-bottom:6px;font-weight:600}
  .form-group input,.form-group select,.form-group textarea{
    width:100%;padding:10px 14px;background:var(--bg);border:1px solid var(--border);
    border-radius:10px;color:var(--text);outline:none;transition:.15s}
  .form-group input:focus,.form-group select:focus,.form-group textarea:focus{
    border-color:var(--accent);box-shadow:0 0 0 3px rgba(99,102,241,.12)}
  .form-group select option{background:var(--surface)}
  .form-hint{font-size:11px;color:var(--muted);margin-top:5px}

  /* Modals */
  .modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.75);
    z-index:200;align-items:center;justify-content:center;backdrop-filter:blur(8px)}
  .modal-overlay.open{display:flex}
  .modal{background:var(--surface);border:1px solid var(--border);border-radius:18px;
    padding:32px;width:100%;max-width:540px;max-height:90vh;overflow-y:auto;
    box-shadow:0 24px 80px rgba(0,0,0,.5)}
  .modal h3{font-size:18px;font-weight:700;margin-bottom:22px;display:flex;
    align-items:center;gap:10px}
  .modal-footer{display:flex;gap:12px;justify-content:flex-end;margin-top:26px;
    padding-top:18px;border-top:1px solid var(--border)}

  /* Toasts */
  #toast-container{position:fixed;bottom:24px;right:24px;z-index:999;display:flex;
    flex-direction:column;gap:10px}
  .toast{padding:14px 20px;border-radius:12px;font-size:13px;font-weight:600;
    display:flex;align-items:center;gap:10px;min-width:300px;max-width:420px;
    box-shadow:0 10px 40px rgba(0,0,0,.5);animation:slideIn .25s ease;
    backdrop-filter:blur(20px)}
  @keyframes slideIn{from{transform:translateX(80px);opacity:0}to{transform:translateX(0);opacity:1}}
  .toast-success{background:rgba(22,101,52,.9);border:1px solid var(--success);color:#bbf7d0}
  .toast-error{background:rgba(127,29,29,.9);border:1px solid var(--danger);color:#fecaca}
  .toast-info{background:rgba(30,58,95,.9);border:1px solid var(--info);color:#bfdbfe}

  /* Misc */
  .section-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:22px}
  .section-header h2{font-size:22px;font-weight:700;letter-spacing:-.01em}
  .filters{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}
  .filters input,.filters select{padding:8px 14px;background:var(--bg);
    border:1px solid var(--border);border-radius:10px;color:var(--text);outline:none}
  .filters input:focus,.filters select:focus{border-color:var(--accent)}
  .pagination{display:flex;gap:10px;align-items:center;padding:18px 0}
  .loader{text-align:center;padding:48px;color:var(--muted);font-size:13px}
  .empty{text-align:center;padding:72px;color:var(--muted)}
  .empty-icon{font-size:40px;display:block;margin-bottom:14px;opacity:.5}
  hr{border:none;border-top:1px solid var(--border);margin:22px 0}
  .text-gradient{background:linear-gradient(135deg,var(--accent),var(--accent2));
    -webkit-background-clip:text;-webkit-text-fill-color:transparent}
  .chart-container{position:relative;height:260px;margin-top:16px}
  .chart-container canvas{width:100%!important;height:100%!important}
</style>
</head>
<body>

<div id="sidebar">
  <div class="sidebar-logo">
    <h2>RapidEx</h2>
    <span>Exchanger Portal</span>
  </div>
  <nav id="nav">
    <div class="nav-section">Main</div>
    <button class="nav-item active" data-page="overview"><span class="icon">-</span>Overview</button>
    <button class="nav-item" data-page="trades"><span class="icon">-</span>My Trades</button>
    <button class="nav-item" data-page="withdrawals"><span class="icon">-</span>Withdrawals</button>

    <div class="nav-section">Finance</div>
    <button class="nav-item" data-page="ledger"><span class="icon">-</span>Ledger</button>
    <button class="nav-item" data-page="addresses"><span class="icon">-</span>Addresses</button>

    <div class="nav-section">Account</div>
    <button class="nav-item" data-page="settings"><span class="icon">-</span>Settings</button>
  </nav>
  <div class="sidebar-footer">
    <a href="https://discord.gg/v9EuzwQB5w" target="_blank">Discord Support</a>
    <a href="/exchanger/logout" style="margin-left:auto">Sign Out</a>
    <span style="margin-left:auto;font-size:10px;color:var(--muted)">v1.0</span>
  </div>
</div>

<div id="main">
  <div id="topbar">
    <h1 id="topbar-title">Overview</h1>
    <div id="topbar-actions"></div>
  </div>
  <div id="page"></div>
</div>

<div id="toast-container"></div>
<div class="modal-overlay" id="modal-overlay">
  <div class="modal" id="modal-content"></div>
</div>

<script>
const $ = id => document.getElementById(id);
const page = $('page');
const topbar = $('topbar-title');
const actions = $('topbar-actions');

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[char]));
}

function toast(msg, type='info') {
  const el = document.createElement('div');
  el.className = 'toast toast-'+type;
  el.innerHTML = (type==='success'?'✓':type==='error'?'✕':'ℹ')+' <span>'+msg+'</span>';
  $('toast-container').appendChild(el);
  setTimeout(()=>el.remove(), 4000);
}

async function api(path, opts={}) {
  const res = await fetch('/exchanger/api'+path, {
    headers:{'Content-Type':'application/json',...(opts.headers||{})},
    ...opts
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error||'API error');
  return json.data;
}

function badge(val) {
  const cls = String(val ?? '').toLowerCase().replace(/[^a-z0-9_-]/g,'-');
  return '<span class="badge badge-'+cls+'">'+esc(val)+'</span>';
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

function loading() { page.innerHTML='<div class="loader">Loading...</div>'; }
function empty(msg='No data') {
  return '<div class="empty"><span class="empty-icon">∅</span>'+msg+'</div>';
}

function pager(current, total, limit, cb) {
  const pages = Math.ceil(total/limit);
  if(pages<=1) return '';
  let html='<div class="pagination"><span style="color:var(--muted);font-size:12px">Page '+(current+1)+' of '+pages+'</span>';
  if(current>0) html+='<button class="btn btn-ghost btn-sm" onclick="('+cb+')('+(current-1)+')">← Prev</button>';
  if(current<pages-1) html+='<button class="btn btn-ghost btn-sm" onclick="('+cb+')('+(current+1)+')">Next →</button>';
  return html+'</div>';
}

// ─────────────────────────────────────────────────────────────
// OVERVIEW
// ─────────────────────────────────────────────────────────────
let overviewInterval;
async function loadOverview() {
  topbar.textContent='Overview'; actions.innerHTML='';
  loading();
  const d = await api('/profile');
  const ex = d.exchanger;
  const bals = d.balances;
  const stats = d.stats;

  const totalBalance = Object.values(bals).reduce((sum, b) => sum + parseFloat(b.available) + parseFloat(b.escrow), 0);

  page.innerHTML=\`
  <div class="stats-grid">
    <div class="stat-card"><div class="stat-label">Status</div><div class="stat-value" style="font-size:22px;margin-top:12px">\${esc(ex.is_banned ? 'BANNED' : ex.is_active ? 'ACTIVE' : 'INACTIVE')}</div></div>
    <div class="stat-card green"><div class="stat-label">Total Balance</div><div class="stat-value">\${num(totalBalance, 4)}</div><div class="stat-sub">all assets</div></div>
    <div class="stat-card yellow"><div class="stat-label">Available</div><div class="stat-value">\${num(Object.values(bals).reduce((s,b)=>s+parseFloat(b.available),0), 4)}</div><div class="stat-sub">free to use</div></div>
    <div class="stat-card red"><div class="stat-label">In Escrow</div><div class="stat-value">\${num(Object.values(bals).reduce((s,b)=>s+parseFloat(b.escrow),0), 4)}</div><div class="stat-sub">locked trades</div></div>
    <div class="stat-card"><div class="stat-label">Completed</div><div class="stat-value">\${stats.completedTrades}</div><div class="stat-sub">successful</div></div>
    <div class="stat-card"><div class="stat-label">Disputed</div><div class="stat-value">\${stats.disputedTrades}</div><div class="stat-sub">needs attention</div></div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:24px">
    <div class="card">
      <div class="card-title">Balances by Asset</div>
      \${Object.entries(bals).length===0?'<p style="color:var(--muted)">No balances yet</p>':
        Object.entries(bals).map(([asset,b])=>\`
          <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border)">
            <div>
              <div style="font-weight:700;font-size:13px">\${asset}</div>
              <div style="font-size:11px;color:var(--muted);margin-top:2px">Avail: \${num(b.available)} · Escrow: \${num(b.escrow)}</div>
            </div>
            <div style="text-align:right">
              <div style="font-weight:700;font-size:14px">\${num(b.total)}</div>
            </div>
          </div>
        \`).join('')}
    </div>
    <div class="card">
      <div class="card-title">Trade Statistics</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div style="padding:14px;background:var(--bg);border-radius:10px">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700;letter-spacing:.08em">Completed</div>
          <div style="font-size:28px;font-weight:800;margin-top:6px;color:var(--success)">\${stats.completedTrades}</div>
        </div>
        <div style="padding:14px;background:var(--bg);border-radius:10px">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700;letter-spacing:.08em">Disputed</div>
          <div style="font-size:28px;font-weight:800;margin-top:6px;color:var(--danger)">\${stats.disputedTrades}</div>
        </div>
        <div style="padding:14px;background:var(--bg);border-radius:10px">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700;letter-spacing:.08em">Cancelled</div>
          <div style="font-size:28px;font-weight:800;margin-top:6px;color:var(--warning)">\${stats.cancelledTrades}</div>
        </div>
        <div style="padding:14px;background:var(--bg);border-radius:10px">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700;letter-spacing:.08em">Total Volume</div>
          <div style="font-size:28px;font-weight:800;margin-top:6px;color:var(--accent)">\${Object.values(stats.totalVolume).reduce((a,b)=>a+parseFloat(b||0),0).toFixed(4)}</div>
        </div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">Recent Activity</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>ID</th><th>Asset</th><th>Amount</th><th>Direction</th><th>Status</th><th>Created</th></tr></thead>
        <tbody>
        \${(d.recentTrades||[]).map(t=>\`<tr>
          <td><span class="mono">\${esc(t.id.slice(0,8))}…</span></td>
          <td><strong>\${esc(t.asset)}</strong></td>
          <td class="mono">\${num(t.amount)}</td>
          <td>\${t.direction==='BUY'?'Buy':'Sell'}</td>
          <td>\${badge(t.status)}</td>
          <td>\${ts(t.created_at)}</td>
        </tr>\`).join('') || '<tr><td colspan="6">'+empty('No trades')+'</td></tr>'}
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
  tradePage=p; topbar.textContent='My Trades'; actions.innerHTML='';
  loading();
  const status = tradeFilter||'';
  const d = await api(\`/trades?status=\${status}&page=\${p}&limit=50\`);
  page.innerHTML=\`
  <div class="section-header">
    <h2>My Trades</h2>
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
        <thead><tr><th>ID</th><th>Asset</th><th>Amount</th><th>Fiat</th><th>Direction</th><th>Status</th><th>Created</th><th></th></tr></thead>
        <tbody>
        \${d.trades.map(t=>\`<tr>
          <td><span class="mono">\${esc(t.id.slice(0,8))}…</span></td>
          <td><strong>\${esc(t.asset)}</strong></td>
          <td class="mono">\${num(t.amount)}</td>
          <td>\${esc(t.fiat_currency)} / \${esc(t.fiat_method.replace(/_/g,' '))}</td>
          <td>\${t.direction==='BUY'?'Buy':'Sell'}</td>
          <td>\${badge(t.status)}</td>
          <td>\${ts(t.created_at)}</td>
          <td><button class="btn btn-ghost btn-sm" onclick="loadTradeDetail('\${esc(t.id)}')">View</button></td>
        </tr>\`).join('') || '<tr><td colspan="8">'+empty('No trades')+'</td></tr>'}
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
  <h3>Trade \${esc(t.id.slice(0,8))}…</h3>
  <div class="form-grid">
    \${[['Status',badge(t.status)],['Asset',t.asset],['Amount',num(t.amount)],
       ['Direction',t.direction],['Fiat',t.fiat_currency+' / '+t.fiat_method],
       ['Wallet',t.user_wallet_address||'—'],['TX ID',t.tx_id||'—'],
       ['Created',ts(t.created_at)],['Updated',ts(t.updated_at)]
    ].map(([l,v])=>\`<div style="display:flex;justify-content:space-between;padding:8px 0;
      border-bottom:1px solid var(--border);font-size:13px">
      <span style="color:var(--muted)">\${esc(l)}</span><span>\${typeof v==='string' ? esc(v) : v}</span></div>\`).join('')}
  </div>
  <hr>
  <div class="card-title" style="margin-top:0">State History</div>
  <div style="font-size:12px">
    \${d.logs.map(l=>\`<div style="padding:6px 0;display:flex;gap:14px;border-bottom:1px solid rgba(42,42,58,.3)">
      <span style="color:var(--muted);white-space:nowrap">\${ts(l.created_at)}</span>
      <span>\${esc(l.from_status||'—')} → <strong>\${esc(l.to_status)}</strong></span>
      \${l.note?'<span style="color:var(--subtle)">'+esc(l.note)+'</span>':''}
    </div>\`).join('')}
  </div>
  <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Close</button></div>
  \`);
}

// ─────────────────────────────────────────────────────────────
// WITHDRAWALS
// ─────────────────────────────────────────────────────────────
let wdPage=0;
async function loadWithdrawals(p=0) {
  wdPage=p; topbar.textContent='Withdrawals'; actions.innerHTML='';
  loading();
  const d = await api(\`/withdrawals?page=\${p}&limit=50\`);
  page.innerHTML=\`
  <div class="section-header"><h2>Withdrawal History</h2></div>
  <div class="card">
    <div class="table-wrap">
      <table>
        <thead><tr><th>ID</th><th>Asset</th><th>Amount</th><th>Destination</th><th>Status</th><th>TX ID</th><th>Created</th></tr></thead>
        <tbody>
        \${d.map(w=>\`<tr>
          <td><span class="mono">\${esc(w.id.slice(0,8))}…</span></td>
          <td><strong>\${esc(w.asset)}</strong></td>
          <td class="mono">\${num(w.amount)}</td>
          <td class="mono truncate" style="max-width:220px">\${esc(w.destination)}</td>
          <td>\${badge(w.status)}</td>
          <td class="mono truncate" style="max-width:180px">\${esc(w.tx_id||'—')}</td>
          <td>\${ts(w.created_at)}</td>
        </tr>\`).join('') || '<tr><td colspan="7">'+empty('No withdrawals')+'</td></tr>'}
        </tbody>
      </table>
    </div>
    \${pager(p, parseInt(d.total||0), 50, 'loadWithdrawals')}
  </div>
  \`;
}

// ─────────────────────────────────────────────────────────────
// LEDGER
// ─────────────────────────────────────────────────────────────
let ledgerPage=0, ledgerAsset='';
async function loadLedger(p=0) {
  ledgerPage=p; topbar.textContent='Ledger'; actions.innerHTML='';
  loading();
  const d = await api(\`/ledger?page=\${p}&limit=100&asset=\${ledgerAsset}\`);
  page.innerHTML=\`
  <div class="section-header"><h2>Ledger Entries</h2></div>
  <div class="filters">
    <select onchange="ledgerAsset=this.value;loadLedger(0)">
      <option value="">All Assets</option>
      \${['BTC','LTC','ETH','USDT_ERC20','USDC_ERC20','USDC_SPL'].map(a=>\`<option \${ledgerAsset===a?'selected':''} value="\${a}">\${a}</option>\`).join('')}
    </select>
  </div>
  <div class="card">
    <div class="table-wrap">
      <table>
        <thead><tr><th>Time</th><th>Type</th><th>Asset</th><th>Amount</th><th>Balance After</th><th>Reference</th></tr></thead>
        <tbody>
        \${d.entries.map(e=>\`<tr>
          <td style="white-space:nowrap">\${ts(e.created_at)}</td>
          <td>\${badge(e.type)}</td>
          <td><strong>\${esc(e.asset)}</strong></td>
          <td class="mono">\${num(e.amount)}</td>
          <td class="mono">\${num(e.balance_after)}</td>
          <td class="truncate" style="max-width:220px;font-size:11px;color:var(--subtle)">\${esc(e.reference)}</td>
        </tr>\`).join('') || '<tr><td colspan="6">'+empty('No entries')+'</td></tr>'}
        </tbody>
      </table>
    </div>
    \${pager(p, parseInt(d.total||0), 100, 'loadLedger')}
  </div>
  \`;
}

// ─────────────────────────────────────────────────────────────
// ADDRESSES
// ─────────────────────────────────────────────────────────────
async function loadAddresses() {
  topbar.textContent='Deposit Addresses'; actions.innerHTML='';
  loading();
  const rows = await api('/addresses');
  page.innerHTML=\`
  <div class="card">
    <div class="card-title">Your Deposit Addresses</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Asset</th><th>Chain</th><th>Address</th><th>Derivation Path</th></tr></thead>
        <tbody>
        \${rows.map(r=>\`<tr>
          <td><strong>\${esc(r.asset)}</strong></td>
          <td>\${esc(r.chain)}</td>
          <td class="mono truncate" style="max-width:300px">\${esc(r.address)}</td>
          <td class="mono" style="font-size:11px;color:var(--muted)">\${esc(r.derivation_path)}</td>
        </tr>\`).join('') || '<tr><td colspan="4">'+empty('No addresses')+'</td></tr>'}
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
  topbar.textContent='Settings'; actions.innerHTML='';
  loading();
  const d = await api('/terms');
  page.innerHTML=\`
  <div class="section-header"><h2>Account Settings</h2></div>
  <div class="card" style="margin-bottom:18px">
    <div class="card-title">Change Dashboard Password</div>
    <div class="form-grid">
      <div class="form-group"><label>New Password</label><input id="new-pass" type="password" placeholder="Min 8 characters"></div>
      <div class="form-group"><label>Confirm Password</label><input id="confirm-pass" type="password" placeholder="Repeat password"></div>
    </div>
    <div style="margin-top:18px">
      <button class="btn btn-primary" onclick="changePassword()">Update Password</button>
    </div>
    <p class="form-hint" style="margin-top:10px">Use the /setpass command in Discord to set your password initially.</p>
  </div>
  <div class="card">
    <div class="card-title">My Terms & Conditions</div>
    <div class="form-grid">
      <div class="form-group"><label>Terms for Buyers</label>
        <textarea id="terms-text" rows="6" placeholder="Set your terms for buyers...">\${esc(d.terms||'')}</textarea>
      </div>
    </div>
    <div style="margin-top:18px">
      <button class="btn btn-primary" onclick="saveTerms()">Save Terms</button>
    </div>
  </div>
  \`;
}

async function changePassword() {
  const pass = $('new-pass').value;
  const confirm = $('confirm-pass').value;
  if (!pass || pass.length < 8) { toast('Password must be at least 8 characters','error'); return; }
  if (pass !== confirm) { toast('Passwords do not match','error'); return; }
  try {
    await api('/settings/password',{method:'POST',body:JSON.stringify({password:pass})});
    toast('Password updated!','success');
    $('new-pass').value=''; $('confirm-pass').value='';
  } catch(e){ toast(e.message,'error'); }
}

async function saveTerms() {
  try {
    await api('/terms',{method:'POST',body:JSON.stringify({terms:$('terms-text').value})});
    toast('Terms saved!','success');
  } catch(e){ toast(e.message,'error'); }
}

// ─────────────────────────────────────────────────────────────
// ROUTER
// ─────────────────────────────────────────────────────────────
const pages = {
  overview:    loadOverview,
  trades:      loadTrades,
  withdrawals: loadWithdrawals,
  ledger:      loadLedger,
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

loadOverview().catch(console.error);
</script>
</body>
</html>`;
}
