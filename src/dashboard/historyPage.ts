function escapeHtml(value: unknown): string {
  return String(value ?? '—').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char] ?? char));
}

function formatDate(value: unknown): string {
  if (!value) return '—';
  return `${new Date(String(value)).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  })} UTC`;
}

export function renderExchangeHistoryPage(
  trade: Record<string, any> | null,
  logs: Record<string, any>[],
): string {
  const style = `<style>
    :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0c1426;color:#e8edf7;font:14px/1.6 system-ui,-apple-system,Segoe UI,sans-serif}.wrap{max-width:780px;margin:0 auto;padding:56px 20px 80px}.hero{text-align:center;margin-bottom:34px}.eyebrow{color:#16b9ee;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}.hero h1{font-size:42px;line-height:1.1;margin:12px 0}.hero h1 em{color:#16b9ee;font-style:normal}.hero p,.muted{color:#9ba9c0}.card{background:#121d32;border:1px solid #1b4868;border-radius:8px;padding:25px;margin:0 0 16px}.head{display:flex;align-items:center;justify-content:space-between;gap:16px}.head h2{font-size:13px;font-weight:500;word-break:break-all;margin:8px 0 0;color:#9ba9c0}.status{color:#55d69a;background:#123b3a;border:1px solid #257267;border-radius:999px;padding:4px 10px;font-size:11px;font-weight:700}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 24px;margin-top:18px}.grid>div{display:flex;justify-content:space-between;gap:18px;padding:12px 0;border-bottom:1px solid #22304a}.grid small{color:#9ba9c0}.grid strong{text-align:right;word-break:break-word}.timeline{margin-top:16px}.event{display:flex;gap:12px;padding:12px 0;border-bottom:1px solid #22304a}.dot{width:8px;height:8px;flex:0 0 8px;border-radius:50%;background:#16b9ee;margin-top:8px}.event strong{display:block}.event small{color:#9ba9c0}@media(max-width:600px){.head{align-items:flex-start;flex-direction:column}.grid{grid-template-columns:1fr}.hero h1{font-size:34px}}
  </style>`;

  if (!trade) {
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Exchange Not Found - RapidEx</title>${style}</head><body><main class="wrap"><div class="hero"><span class="eyebrow">Exchange History</span><h1>Exchange <em>Not Found</em></h1><p>This exchange does not exist or is no longer available.</p></div></main></body></html>`;
  }

  const timeline = logs.map((log) => `<div class="event"><span class="dot"></span><div><strong>${escapeHtml(log.to_status)}</strong><small>${formatDate(log.created_at)} · ${escapeHtml(log.note ?? 'Status updated')}</small></div></div>`).join('');
  const amount = `${parseFloat(String(trade.amount)).toFixed(8)} ${escapeHtml(trade.asset)}`;
  const fee = trade.fee_amount ? `${parseFloat(String(trade.fee_amount)).toFixed(8)} ${escapeHtml(trade.asset)}` : '—';
  const title = `Exchange ${escapeHtml(trade.id)} - RapidEx`;

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>${style}</head><body><main class="wrap">
    <div class="hero"><span class="eyebrow">Public Exchange History</span><h1>Exchange <em>Details</em></h1><p>Transparent information about this completed RapidEx transaction.</p></div>
    <section class="card head"><div><span class="eyebrow">Exchange Details</span><h2>${escapeHtml(trade.id)}</h2></div><span class="status">${escapeHtml(trade.status)}</span></section>
    <section class="card"><span class="eyebrow">Exchange Information</span><div class="grid">
      <div><small>Direction</small><strong>${escapeHtml(trade.direction)}</strong></div><div><small>Asset</small><strong>${escapeHtml(trade.asset)}</strong></div>
      <div><small>Amount</small><strong>${amount}</strong></div><div><small>Fiat Amount</small><strong>${trade.fiat_amount ? `${escapeHtml(trade.fiat_amount)} ${escapeHtml(trade.fiat_currency)}` : '—'}</strong></div>
      <div><small>Payment Method</small><strong>${escapeHtml(trade.fiat_method).replace(/_/g, ' ')}</strong></div><div><small>Fee</small><strong>${fee}</strong></div>
    </div></section>
    <section class="card"><span class="eyebrow">Timeline</span><div class="timeline">${timeline || '<p class="muted">No timeline events recorded.</p>'}</div></section>
    <section class="card"><span class="eyebrow">Additional Details</span><div class="grid">
      <div><small>Opened At</small><strong>${formatDate(trade.created_at)}</strong></div><div><small>Completed At</small><strong>${formatDate(trade.completed_at)}</strong></div>
      <div><small>Exchanger</small><strong>${escapeHtml(trade.exchanger_username ?? 'Verified exchanger')}</strong></div><div><small>Transaction ID</small><strong>${escapeHtml(trade.tx_id ?? '—')}</strong></div>
    </div></section>
  </main></body></html>`;
}
