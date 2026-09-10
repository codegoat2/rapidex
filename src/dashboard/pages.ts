/**
 * Public static pages — RapidEx
 * Premium design, no emojis, Google Fonts Inter
 */

export const DISCORD_INVITE = 'https://discord.gg/v9EuzwQB5w';

const STYLE = `<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#07080f;--s1:#0c0e18;--s2:#10121e;--s3:#14172a;
  --br:#1c1f35;--br2:#252840;
  --a:#7c6eff;--a2:#a998ff;--ag:rgba(124,110,255,.15);
  --t:#eceff8;--m:#8891a8;--sub:#555e78;
  --g:linear-gradient(135deg,#7c6eff,#b48dff);
}
html{scroll-behavior:smooth}
body{
  background:var(--bg);color:var(--t);
  font-family:'Inter',system-ui,sans-serif;
  font-size:15px;line-height:1.7;
  -webkit-font-smoothing:antialiased;
  background-image:
    radial-gradient(ellipse 70% 35% at 50% -5%,rgba(124,110,255,.1),transparent),
    radial-gradient(ellipse 50% 25% at 90% 90%,rgba(180,141,255,.06),transparent);
  background-attachment:fixed;
}
a{color:var(--a2);text-decoration:none;transition:color .18s}
a:hover{color:var(--a)}

/* HEADER */
header{
  position:sticky;top:0;z-index:200;
  background:rgba(7,8,15,.82);
  backdrop-filter:blur(20px) saturate(1.5);
  border-bottom:1px solid var(--br);
}
.hi{max-width:1280px;margin:0 auto;padding:0 40px;height:66px;display:flex;align-items:center;justify-content:space-between;gap:32px}
.logo{font-size:19px;font-weight:800;letter-spacing:-.05em;background:var(--g);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
nav{display:flex;align-items:center;gap:4px}
nav a{color:var(--m);font-size:14px;font-weight:500;padding:7px 13px;border-radius:8px;transition:all .15s}
nav a:hover{color:var(--t);background:var(--s2)}
.nbtn{
  background:var(--g);color:#fff !important;
  padding:9px 22px;border-radius:9px;
  font-weight:600;font-size:14px;margin-left:8px;
  box-shadow:0 0 24px rgba(124,110,255,.4);
  transition:all .2s !important;
}
.nbtn:hover{transform:translateY(-1px);box-shadow:0 0 40px rgba(124,110,255,.6) !important;background:var(--g)}

/* PAGE WRAP */
.page{max-width:1100px;margin:0 auto;padding:72px 40px 120px}

/* HERO */
.hero{text-align:center;padding:72px 0 96px;position:relative}
.hero::before{
  content:'';position:absolute;top:-40px;left:50%;transform:translateX(-50%);
  width:800px;height:500px;
  background:radial-gradient(ellipse,rgba(124,110,255,.11),transparent 68%);
  pointer-events:none;z-index:0;
}
.hero>*{position:relative;z-index:1}
.badge{
  display:inline-block;
  background:rgba(124,110,255,.12);border:1px solid rgba(124,110,255,.28);
  color:var(--a2);font-size:11.5px;font-weight:700;
  letter-spacing:.12em;text-transform:uppercase;
  padding:6px 18px;border-radius:99px;margin-bottom:28px;
}
.hero h1{
  font-size:58px;font-weight:900;line-height:1.06;
  letter-spacing:-.045em;color:var(--t);margin-bottom:26px;
}
.hero h1 em{font-style:normal;background:var(--g);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.hero p{font-size:18px;color:var(--m);max-width:660px;margin:0 auto 44px;line-height:1.65}
.btns{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}

/* BUTTONS */
.btn{display:inline-block;padding:13px 30px;border-radius:10px;font-weight:600;font-size:15px;transition:all .2s;border:none;cursor:pointer;letter-spacing:-.01em}
.btn-p{background:var(--g);color:#fff;box-shadow:0 0 28px rgba(124,110,255,.4)}
.btn-p:hover{transform:translateY(-2px);box-shadow:0 0 48px rgba(124,110,255,.65);color:#fff}
.btn-s{background:var(--s2);color:var(--t);border:1px solid var(--br2)}
.btn-s:hover{background:var(--s3);border-color:var(--a);color:var(--t);transform:translateY(-1px)}
.btn-lg{padding:15px 38px;font-size:16px}

/* CARD */
.card{background:var(--s1);border:1px solid var(--br);border-radius:18px;padding:52px;margin-bottom:36px;position:relative;overflow:hidden}
.card::after{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(124,110,255,.35),transparent)}
.card h2{font-size:28px;font-weight:800;letter-spacing:-.035em;margin-bottom:26px}
.card h3{font-size:19px;font-weight:700;color:var(--a2);margin:32px 0 14px;letter-spacing:-.02em}
.card p{color:var(--m);margin-bottom:16px;line-height:1.75}
.card ul,.card ol{color:var(--m);margin:14px 0 18px 22px}
.card li{margin-bottom:10px;line-height:1.7}
.card strong{color:var(--t);font-weight:600}
.card code{background:rgba(124,110,255,.12);color:var(--a2);padding:3px 10px;border-radius:6px;font-size:13px;font-family:monospace;border:1px solid rgba(124,110,255,.22)}

/* GRID */
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:18px;margin:32px 0}
.feat{background:var(--s2);border:1px solid var(--br);border-radius:14px;padding:30px;transition:all .22s;position:relative}
.feat:hover{border-color:rgba(124,110,255,.45);transform:translateY(-3px);box-shadow:0 10px 36px rgba(0,0,0,.35),0 0 0 1px rgba(124,110,255,.12)}
.feat-tag{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--a2);margin-bottom:10px;display:block}
.feat h4{font-size:16px;font-weight:700;margin-bottom:9px;color:var(--t)}
.feat p{font-size:13.5px;color:var(--m);margin:0;line-height:1.6}

/* STEPS */
.steps{display:flex;flex-direction:column;gap:14px}
.step{background:var(--s2);border:1px solid var(--br);border-left:3px solid var(--a);border-radius:13px;padding:32px;transition:all .18s}
.step:hover{border-left-color:var(--a2);box-shadow:0 6px 28px rgba(0,0,0,.3)}
.step-n{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--a2);margin-bottom:12px;display:block}
.step h3{font-size:18px;font-weight:700;margin-bottom:11px;letter-spacing:-.02em}
.step p{color:var(--m);margin-bottom:10px;line-height:1.7}
.step p:last-child{margin:0}
.step ul{margin:10px 0 0 20px;color:var(--m)}
.step li{margin-bottom:8px}

/* CTA */
.cta{background:var(--s1);border:1px solid var(--br);border-radius:22px;padding:76px 40px;text-align:center;margin:72px 0;position:relative;overflow:hidden}
.cta::before{content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:600px;height:350px;background:radial-gradient(ellipse,rgba(124,110,255,.13),transparent 68%);pointer-events:none}
.cta>*{position:relative;z-index:1}
.cta h2{font-size:38px;font-weight:900;letter-spacing:-.04em;margin-bottom:16px}
.cta p{font-size:17px;color:var(--m);margin-bottom:32px}

/* FOOTER */
footer{background:var(--s1);border-top:1px solid var(--br);padding:60px 40px 40px;margin-top:60px}
.fi{max-width:1100px;margin:0 auto;display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:48px;margin-bottom:44px}
.fb .logo{font-size:20px;margin-bottom:14px;display:block}
.fb p{color:var(--m);font-size:13.5px;max-width:260px;line-height:1.7}
.fc h5{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--sub);margin-bottom:16px}
.fc ul{list-style:none}
.fc li{margin-bottom:9px}
.fc a{color:var(--m);font-size:13.5px;transition:color .18s}
.fc a:hover{color:var(--a2)}
.fbot{max-width:1100px;margin:0 auto;padding-top:28px;border-top:1px solid var(--br);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px}
.fbot p,.fbot a{color:var(--sub);font-size:13px}
.fbot a:hover{color:var(--a2)}
.fbot-links{display:flex;gap:22px}

@media(max-width:900px){.fi{grid-template-columns:1fr 1fr;gap:32px}}
@media(max-width:700px){
  .page{padding:48px 20px 80px}
  .hero{padding:52px 0 72px}
  .hero h1{font-size:36px}
  .hero p{font-size:16px}
  .card{padding:28px 22px}
  .hi{padding:0 20px}
  nav a{padding:7px 9px;font-size:13px}
  .grid{grid-template-columns:1fr}
  .cta{padding:48px 22px}
  .cta h2{font-size:28px}
  .fi{grid-template-columns:1fr}
  footer{padding:40px 20px 32px}
}
</style>`;

const NAV = `<header>
  <div class="hi">
    <span class="logo">RapidEx</span>
    <nav>
      <a href="/">Home</a>
      <a href="/about">About</a>
      <a href="/how-to-start">Guide</a>
      <a href="/become-exchanger">Exchangers</a>
      <a href="/terms">Terms</a>
      <a href="/exchanger" style="color:var(--sub)">Portal</a>
      <a href="${DISCORD_INVITE}" target="_blank" rel="noopener" class="nbtn">Join Discord</a>
    </nav>
  </div>
</header>`;

const FOOT = `<footer>
  <div class="fi">
    <div class="fb">
      <span class="logo">RapidEx</span>
      <p>The premium peer-to-peer crypto exchange platform built natively for Discord.</p>
    </div>
    <div class="fc">
      <h5>Platform</h5>
      <ul>
        <li><a href="/">Home</a></li>
        <li><a href="/about">About Us</a></li>
        <li><a href="/how-to-start">Getting Started</a></li>
        <li><a href="/become-exchanger">Become Exchanger</a></li>
      </ul>
    </div>
    <div class="fc">
      <h5>Legal</h5>
      <ul>
        <li><a href="/terms">Terms &amp; Conditions</a></li>
      </ul>
    </div>
    <div class="fc">
      <h5>Access</h5>
      <ul>
        <li><a href="${DISCORD_INVITE}" target="_blank" rel="noopener">Discord Server</a></li>
        <li><a href="/exchanger">Exchanger Portal</a></li>
        <li><a href="/dashboard">Admin Dashboard</a></li>
      </ul>
    </div>
  </div>
  <div class="fbot">
    <p>&copy; ${new Date().getFullYear()} RapidEx. All rights reserved.</p>
    <div class="fbot-links">
      <a href="/terms">Terms</a>
      <a href="${DISCORD_INVITE}" target="_blank" rel="noopener">Discord</a>
    </div>
  </div>
</footer>`;

function page(title: string, desc: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
${STYLE}
</head>
<body>
${NAV}
${body}
${FOOT}
</body>
</html>`;
}

// ── HOME ──────────────────────────────────────────────────────
export function renderHomePage(): string {
  return page('RapidEx — Discord P2P Crypto Exchange', 'Trade crypto with verified exchangers on Discord. Escrow-protected, no KYC, instant settlements.', `
<div class="page">
  <div class="hero">
    <span class="badge">Trusted Community Exchange</span>
    <h1>The Premium Crypto Exchange<br><em>Built for Discord</em></h1>
    <p>Trade with verified exchangers in private tickets. Escrow-protected settlements, no KYC, live rates — across BTC, ETH, SOL, USDT and more.</p>
    <div class="btns">
      <a href="${DISCORD_INVITE}" target="_blank" rel="noopener" class="btn btn-p btn-lg">Start Trading</a>
      <a href="/how-to-start" class="btn btn-s btn-lg">How It Works</a>
    </div>
  </div>

  <div class="grid" style="margin-bottom:72px">
    <div class="feat"><span class="feat-tag">Security</span><h4>Escrow Protection</h4><p>Cryptocurrency is locked in escrow until both parties confirm completion. Funds never leave the platform prematurely.</p></div>
    <div class="feat"><span class="feat-tag">Trust</span><h4>Verified Exchangers Only</h4><p>Every exchanger is manually screened. You are always trading with a vetted, trusted counterparty.</p></div>
    <div class="feat"><span class="feat-tag">Speed</span><h4>Instant Private Tickets</h4><p>No order books. A private Discord ticket opens between you and your exchanger in seconds.</p></div>
    <div class="feat"><span class="feat-tag">Privacy</span><h4>No KYC Required</h4><p>No identity documents, no uploads, no tracking. Your privacy is fully respected.</p></div>
    <div class="feat"><span class="feat-tag">Assets</span><h4>Multi-Asset Support</h4><p>BTC, ETH, LTC, SOL, USDT (BEP20), BNB — with multiple fiat currencies and payment methods.</p></div>
    <div class="feat"><span class="feat-tag">Resolution</span><h4>Admin Dispute System</h4><p>If issues arise, admins review evidence and mediate fairly to protect both parties.</p></div>
  </div>

  <div class="card" style="margin-bottom:72px">
    <h2>How It Works</h2>
    <div class="steps">
      <div class="step"><span class="step-n">01 — Join</span><h3>Open the Exchange Channel</h3><p>Join our Discord server and navigate to #exchange. Click "Start Exchange" on the panel.</p></div>
      <div class="step"><span class="step-n">02 — Configure</span><h3>Set Your Trade Details</h3><p>Choose Buy, Sell, or Swap. Enter your amount. A live rate locks for 5 minutes.</p></div>
      <div class="step"><span class="step-n">03 — Match</span><h3>Exchanger Claims Trade</h3><p>A verified exchanger claims your trade. A private ticket is created and crypto is locked in escrow.</p></div>
      <div class="step"><span class="step-n">04 — Settle</span><h3>Pay and Receive</h3><p>Follow payment instructions. Once confirmed, crypto is released from escrow to your wallet.</p></div>
    </div>
  </div>

  <div class="cta">
    <h2>Ready to Start Trading?</h2>
    <p>Join our Discord and make your first trade in minutes.</p>
    <a href="${DISCORD_INVITE}" target="_blank" rel="noopener" class="btn btn-p btn-lg">Join RapidEx Discord</a>
  </div>
</div>`);
}

// ── ABOUT ─────────────────────────────────────────────────────
export function renderAboutPage(): string {
  return page('About RapidEx — Secure Discord Crypto Exchange', 'Our mission, technology, and supported assets for P2P crypto trading on Discord.', `
<div class="page">
  <div class="hero">
    <span class="badge">About Us</span>
    <h1>Built for <em>Secure</em> Trading</h1>
    <p>We built RapidEx to give crypto traders a fast, private, and trustworthy exchange without leaving their Discord community.</p>
  </div>

  <div class="card">
    <h2>Our Mission</h2>
    <p>Traditional exchanges demand KYC, impose withdrawal delays, and expose your activity publicly. Peer-to-peer platforms often lack proper escrow and verification. RapidEx combines platform-grade security with the simplicity of Discord.</p>
    <ul>
      <li><strong>Speed</strong> — Trades settle in minutes, not hours</li>
      <li><strong>Security</strong> — All funds held in escrow until conditions are met</li>
      <li><strong>Privacy</strong> — No KYC, no tracking, no unnecessary data</li>
      <li><strong>Trust</strong> — Exchangers manually verified and continuously monitored</li>
    </ul>
  </div>

  <div class="card">
    <h2>Platform Infrastructure</h2>
    <div class="grid">
      <div class="feat"><span class="feat-tag">Wallets</span><h4>Hot Wallet System</h4><p>Automated deposits and withdrawals with real-time blockchain monitoring across multiple providers.</p></div>
      <div class="feat"><span class="feat-tag">Finance</span><h4>Escrow Engine</h4><p>Funds locked on trade claim. Released only on confirmed completion or admin resolution.</p></div>
      <div class="feat"><span class="feat-tag">Compliance</span><h4>Full Audit Logging</h4><p>Every action logged for transparency and dispute resolution.</p></div>
      <div class="feat"><span class="feat-tag">Reliability</span><h4>Multi-Provider Redundancy</h4><p>NOWNodes, BlockCypher, Alchemy, and Helius integrations ensure maximum uptime.</p></div>
    </div>
  </div>

  <div class="card">
    <h2>Supported Assets</h2>
    <h3>Cryptocurrencies</h3>
    <ul>
      <li><strong>Bitcoin (BTC)</strong> — Native Bitcoin network</li>
      <li><strong>Ethereum (ETH)</strong> — Ethereum mainnet</li>
      <li><strong>Litecoin (LTC)</strong> — Fast and low-fee</li>
      <li><strong>Solana (SOL)</strong> — High-speed transactions</li>
      <li><strong>USDT (BEP20)</strong> — Tether on Binance Smart Chain</li>
      <li><strong>BNB (BEP20)</strong> — Binance Coin on BSC</li>
    </ul>
    <h3>Payment Methods</h3>
    <ul>
      <li>Bank Transfer (SEPA / Wire), Revolut, Wise</li>
      <li>PayPal, CashApp, Apple Pay</li>
      <li>Binance Gift Cards, Paysafecard, Cash in Person</li>
    </ul>
    <h3>Fiat Currencies</h3>
    <p>EUR, USD, GBP</p>
  </div>

  <div class="cta">
    <h2>Start Trading on RapidEx</h2>
    <p>The fastest, most private P2P exchange on Discord.</p>
    <a href="${DISCORD_INVITE}" target="_blank" rel="noopener" class="btn btn-p btn-lg">Join Our Discord</a>
  </div>
</div>`);
}

// ── TERMS ─────────────────────────────────────────────────────
export function renderTermsPage(): string {
  return page('Terms &amp; Conditions — RapidEx', 'RapidEx platform rules, user responsibilities, escrow policy, and legal disclaimers.', `
<div class="page">
  <div class="hero">
    <span class="badge">Legal</span>
    <h1>Terms &amp; Conditions</h1>
    <p>Last updated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
  </div>

  <div class="card"><h2>1. Acceptance</h2><p>By using RapidEx you agree to these Terms. If you do not agree, do not use the Service. RapidEx acts as an escrow provider and platform operator — not as a party to trades.</p></div>

  <div class="card"><h2>2. Eligibility</h2><ul>
    <li>You must be at least 18 years old or the age of majority in your jurisdiction</li>
    <li>You must have legal capacity to enter binding contracts</li>
    <li>You must comply with all local laws regarding cryptocurrency transactions</li>
  </ul></div>

  <div class="card"><h2>3. User Responsibilities</h2><ul>
    <li><strong>Accurate information</strong> — All trade details and wallet addresses must be correct</li>
    <li><strong>Verify before sending</strong> — Always verify payment details before transferring funds</li>
    <li><strong>Stay responsive</strong> — Inactive users may have trades cancelled without notice</li>
    <li><strong>Wallet ownership</strong> — You are responsible for addresses you provide. We cannot recover funds sent to wrong addresses</li>
    <li><strong>No fraud</strong> — Any attempt to defraud results in permanent termination</li>
  </ul></div>

  <div class="card"><h2>4. Exchanger Responsibilities</h2><ul>
    <li><strong>Maintain liquidity</strong> — Ensure adequate funds before claiming trades</li>
    <li><strong>Respond promptly</strong> — Action claimed trades within agreed windows</li>
    <li><strong>Clear instructions</strong> — Provide users with accurate payment details</li>
    <li><strong>Timely release</strong> — Release escrowed funds without delay after payment confirmation</li>
    <li><strong>Professional conduct</strong> — Abusive behavior results in immediate ban</li>
  </ul></div>

  <div class="card"><h2>5. Escrow and Fees</h2><p>When an exchanger claims a trade, the required cryptocurrency is locked in escrow and released only on confirmed completion or after admin dispute resolution. RapidEx charges a transparent percentage fee per completed trade — shown before confirmation, no hidden charges.</p></div>

  <div class="card"><h2>6. Dispute Resolution</h2><p>Either party may raise a dispute via the bot. The trade freezes, admins are notified, both parties provide evidence, and an admin makes a binding decision. Admin decisions are final. Repeated frivolous disputes result in restrictions.</p></div>

  <div class="card"><h2>7. Prohibited Activities</h2><ul>
    <li>Money laundering or funding illegal activities</li>
    <li>Fraud, scamming, or impersonation</li>
    <li>Using stolen payment methods or funds</li>
    <li>Exploiting bugs or manipulating rates</li>
    <li>Multiple accounts to bypass restrictions</li>
    <li>Harassment or threatening behavior</li>
    <li>Chargebacks after receiving cryptocurrency</li>
  </ul></div>

  <div class="card"><h2>8. Risks and Disclaimers</h2><ul>
    <li><strong>Volatility</strong> — Crypto values fluctuate. We are not responsible for market losses</li>
    <li><strong>No guarantees</strong> — We provide escrow and verification but cannot guarantee every outcome</li>
    <li><strong>Third-party payments</strong> — Not liable for bank, PayPal, or Revolut issues</li>
    <li><strong>Blockchain delays</strong> — Not responsible for network congestion</li>
    <li><strong>No financial advice</strong> — Nothing here constitutes investment or legal advice</li>
  </ul></div>

  <div class="card"><h2>9. Privacy</h2><ul>
    <li>No KYC — we do not collect identity documents</li>
    <li>Minimal data — only Discord IDs, wallet addresses, and trade history required for operation</li>
    <li>No data selling — we never share or sell user data</li>
  </ul></div>

  <div class="card"><h2>10. Limitation of Liability</h2><p>To the maximum extent permitted by law, RapidEx is not liable for crypto loss due to user error, market volatility, third-party payment issues, blockchain failures, or service downtime. Use RapidEx at your own risk.</p></div>

  <div class="card"><h2>11. Contact</h2><p>For support, open a ticket on <a href="${DISCORD_INVITE}" target="_blank" rel="noopener">our Discord server</a>. We respond within 24 hours.</p></div>

  <div class="cta">
    <h2>Questions About Our Terms?</h2>
    <p>Open a support ticket on Discord and we will clarify anything.</p>
    <a href="${DISCORD_INVITE}" target="_blank" rel="noopener" class="btn btn-p btn-lg">Contact Support</a>
  </div>
</div>`);
}

// ── HOW TO START ──────────────────────────────────────────────
export function renderHowToStartPage(): string {
  return page('Getting Started — RapidEx Trading Guide', 'Step-by-step guide to buying, selling, and swapping crypto on RapidEx via Discord.', `
<div class="page">
  <div class="hero">
    <span class="badge">Getting Started</span>
    <h1>Your First Trade in<br><em>Under 5 Minutes</em></h1>
    <p>Follow this guide to complete your first crypto trade on RapidEx.</p>
  </div>

  <div class="card" style="margin-bottom:32px">
    <h2>Before You Begin</h2>
    <p>RapidEx runs entirely through Discord. All trades take place in private channels between you and a verified exchanger. You need a Discord account to get started.</p>
    <a href="${DISCORD_INVITE}" target="_blank" rel="noopener" class="btn btn-p">Join Discord Server</a>
  </div>

  <div class="steps" style="margin-bottom:72px">
    <div class="step"><span class="step-n">01</span><h3>Join and Navigate</h3><p>Join our Discord using the link above. Go to the #exchange channel where the RapidEx panel is pinned.</p></div>
    <div class="step"><span class="step-n">02</span><h3>Click "Start Exchange"</h3><p>Click the button on the panel. Choose your trade type:</p><ul><li><strong>Buy</strong> — Pay fiat, receive crypto</li><li><strong>Sell</strong> — Send crypto, receive fiat</li><li><strong>Swap</strong> — Exchange one crypto for another</li><li><strong>Fiat to Fiat</strong> — Convert between payment methods</li></ul></div>
    <div class="step"><span class="step-n">03</span><h3>Configure Your Trade</h3><p>The bot guides you through prompts. Select cryptocurrency, enter fiat amount, choose payment method and currency. A live rate locks for 5 minutes with the exact amount including fees shown before confirmation.</p></div>
    <div class="step"><span class="step-n">04</span><h3>Confirm</h3><p>Review the trade summary carefully — fiat amount, crypto amount, payment method, and fee — then click Confirm Trade.</p></div>
    <div class="step"><span class="step-n">05</span><h3>Exchanger Claims</h3><p>Your trade posts to the exchangers forum. A verified exchanger claims it within minutes. A private ticket channel is created and crypto is locked in escrow.</p></div>
    <div class="step"><span class="step-n">06</span><h3>Complete Payment</h3><p><strong>Buying:</strong> Exchanger shares payment details. Send the exact fiat amount and click "I've Sent Payment".</p><p><strong>Selling:</strong> Share your payment details. Confirm receipt when fiat arrives.</p><p><strong>Important:</strong> Never send payment outside the agreed method. Always verify details inside the ticket.</p></div>
    <div class="step"><span class="step-n">07</span><h3>Receive Crypto</h3><p>Exchanger verifies payment and releases crypto. Provide your wallet address when prompted. Once confirmed the trade closes and ticket archives.</p></div>
  </div>

  <div class="card">
    <h2>Important Notes</h2>
    <h3>Wallet Addresses</h3>
    <p>Always verify the wallet address you provide. Crypto sent to an incorrect address cannot be recovered.</p>
    <h3>Stay Responsive</h3>
    <p>Trades require timely responses. Going inactive may result in the exchanger cancelling the trade.</p>
    <h3>Raising a Dispute</h3>
    <p>If something goes wrong, click the Dispute button in your ticket and describe the issue. An admin will review evidence and make a binding decision. Do not take action outside the ticket during a dispute.</p>
  </div>

  <div class="cta">
    <h2>Start Your First Trade</h2>
    <p>Join our Discord and complete an exchange in minutes.</p>
    <a href="${DISCORD_INVITE}" target="_blank" rel="noopener" class="btn btn-p btn-lg">Open Discord</a>
  </div>
</div>`);
}

// ── BECOME EXCHANGER ──────────────────────────────────────────
export function renderBecomeExchangerPage(): string {
  return page('Become an Exchanger — Earn on RapidEx', 'Earn by providing liquidity on RapidEx. Set your own rates, access a dedicated dashboard, withdraw anytime.', `
<div class="page">
  <div class="hero">
    <span class="badge">Exchangers</span>
    <h1>Earn by Providing<br><em>Liquidity</em></h1>
    <p>Verified exchangers set their own rates, facilitate trades, and withdraw earnings on demand — with full escrow protection and a dedicated dashboard.</p>
  </div>

  <div class="grid" style="margin-bottom:72px">
    <div class="feat"><span class="feat-tag">Earnings</span><h4>Keep Your Spread</h4><p>Set your own rates. Earn on every trade you facilitate. No revenue share — 100% of your spread is yours.</p></div>
    <div class="feat"><span class="feat-tag">Protection</span><h4>Escrow for Exchangers</h4><p>Crypto locked in escrow until trade confirmation. No chargeback risk, no fraudulent reversals.</p></div>
    <div class="feat"><span class="feat-tag">Dashboard</span><h4>Personal Exchanger Portal</h4><p>Dedicated dashboard at /exchanger. Track trades, balances, and withdrawal history in real-time.</p></div>
    <div class="feat"><span class="feat-tag">Alerts</span><h4>Instant Notifications</h4><p>Get notified the moment a matching trade is posted. Claim and begin within seconds.</p></div>
    <div class="feat"><span class="feat-tag">Support</span><h4>Admin Dispute Mediation</h4><p>Our admin team mediates disputes fairly. Your interests are fully protected.</p></div>
    <div class="feat"><span class="feat-tag">Flexibility</span><h4>Your Schedule</h4><p>No minimum trade volume, no minimum hours. Operate when your liquidity and availability allow.</p></div>
  </div>

  <div class="card">
    <h2>Requirements</h2>
    <ul>
      <li><strong>Liquidity</strong> — Sufficient crypto funds across your chosen assets</li>
      <li><strong>Discord account</strong> — Active, at least 30 days old, with verified email</li>
      <li><strong>Availability</strong> — Respond to claimed trades within 15 minutes</li>
      <li><strong>Reputation</strong> — No history of fraud or scamming in crypto communities</li>
      <li><strong>Payment access</strong> — At least one verified fiat payment method</li>
    </ul>
  </div>

  <div class="card">
    <h2>Application Process</h2>
    <div class="steps">
      <div class="step"><span class="step-n">01</span><h3>Open a Verification Ticket</h3><p>Join our Discord and open a verification ticket. Provide information on liquidity, payment methods, and availability.</p></div>
      <div class="step"><span class="step-n">02</span><h3>Review and Interview</h3><p>Our team reviews your application, conducts a brief interview, and checks your Discord reputation.</p></div>
      <div class="step"><span class="step-n">03</span><h3>Receive Exchanger Role</h3><p>Once approved, you receive the Exchanger role and access to the trades forum channel.</p></div>
      <div class="step"><span class="step-n">04</span><h3>Set Your Dashboard Password</h3><p>Use <code>/setpass</code> in Discord to create a password for your personal exchanger portal at /exchanger. This command is only available to verified exchangers.</p></div>
      <div class="step"><span class="step-n">05</span><h3>Start Claiming Trades</h3><p>Browse available trades in the forum and claim those matching your assets and payment methods.</p></div>
      <div class="step"><span class="step-n">06</span><h3>Withdraw Earnings</h3><p>Use <code>/withdraw</code> in Discord to queue withdrawals anytime. Processed within 24 hours.</p></div>
    </div>
  </div>

  <div class="card">
    <h2>Exchanger Commands</h2>
    <ul>
      <li><code>/setpass</code> — Set or update your exchanger dashboard password</li>
      <li><code>/balance</code> — View available and escrowed balances per asset</li>
      <li><code>/my-trades</code> — Review your last 20 trades</li>
      <li><code>/withdraw</code> — Queue a withdrawal to an external wallet</li>
      <li><code>/deposit-addresses</code> — View deposit addresses per asset</li>
      <li><code>/set-terms</code> — Define Terms and Conditions buyers must accept</li>
      <li><code>/my-terms</code> — View your current Terms and Conditions</li>
    </ul>
  </div>

  <div class="cta">
    <h2>Ready to Apply?</h2>
    <p>Join our Discord and open a verification ticket to start the process.</p>
    <a href="${DISCORD_INVITE}" target="_blank" rel="noopener" class="btn btn-p btn-lg">Apply on Discord</a>
  </div>
</div>`);
}
