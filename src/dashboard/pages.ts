/**
 * Public static pages for RapidEx
 * About Us, Terms and Conditions, How to Start
 */

const BASE_STYLE = `
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{min-height:100vh;background:linear-gradient(135deg,#0f1117 0%,#1a1d2e 100%);
     color:#e2e8f0;font-family:'Inter','Segoe UI',system-ui,sans-serif;line-height:1.6}
a{color:#38bdf8;text-decoration:none;transition:.2s}
a:hover{color:#0ea5e9;text-decoration:underline}

/* Header */
header{background:rgba(13,27,41,.95);border-bottom:1px solid rgba(56,189,248,.2);
       backdrop-filter:blur(12px);position:sticky;top:0;z-index:100}
.header-inner{max-width:1200px;margin:0 auto;padding:20px 24px;display:flex;
              align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px}
.logo{font-size:24px;font-weight:700;background:linear-gradient(135deg,#38bdf8,#14b8a6);
      -webkit-background-clip:text;-webkit-text-fill-color:transparent;display:flex;align-items:center;gap:8px}
nav{display:flex;gap:24px;flex-wrap:wrap}
nav a{color:#94a3b8;font-weight:500;font-size:14px}
nav a:hover,nav a.active{color:#38bdf8;text-decoration:none}

/* Main content */
.container{max-width:900px;margin:0 auto;padding:60px 24px}
.hero{text-align:center;margin-bottom:60px;padding:40px 20px}
.hero h1{font-size:48px;font-weight:800;margin-bottom:16px;
         background:linear-gradient(135deg,#38bdf8,#14b8a6);
         -webkit-background-clip:text;-webkit-text-fill-color:transparent}
.hero p{font-size:18px;color:#94a3b8;max-width:600px;margin:0 auto}

.content-card{background:rgba(13,27,41,.8);border:1px solid rgba(56,189,248,.15);
              border-radius:16px;padding:40px;margin-bottom:32px;
              box-shadow:0 8px 32px rgba(0,0,0,.3)}
.content-card h2{font-size:28px;margin-bottom:20px;color:#38bdf8}
.content-card h3{font-size:20px;margin:28px 0 12px;color:#14b8a6}
.content-card p{margin-bottom:16px;color:#cbd5e1}
.content-card ul,.content-card ol{margin:16px 0 16px 24px;color:#cbd5e1}
.content-card li{margin-bottom:8px}
.content-card strong{color:#e2e8f0}
.content-card code{background:rgba(56,189,248,.1);color:#38bdf8;padding:2px 8px;
                    border-radius:4px;font-size:13px;font-family:monospace}

.feature-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));
              gap:20px;margin:32px 0}
.feature-box{background:rgba(19,40,58,.6);border:1px solid rgba(56,189,248,.2);
             border-radius:12px;padding:24px;text-align:center}
.feature-box .icon{font-size:36px;margin-bottom:12px}
.feature-box h4{font-size:16px;margin-bottom:8px;color:#38bdf8}
.feature-box p{font-size:13px;color:#94a3b8}

.step-card{background:rgba(19,40,58,.6);border-left:4px solid #38bdf8;
           padding:24px;margin-bottom:20px;border-radius:8px}
.step-card .step-num{display:inline-block;background:#38bdf8;color:#0f1117;
                     font-weight:700;padding:4px 12px;border-radius:20px;
                     margin-bottom:12px;font-size:14px}
.step-card h3{margin-bottom:8px;color:#e2e8f0}

.cta-box{background:linear-gradient(135deg,rgba(56,189,248,.15),rgba(20,184,166,.08));
         border:1px solid rgba(56,189,248,.3);border-radius:16px;
         padding:40px;text-align:center;margin:48px 0}
.cta-box h2{font-size:32px;margin-bottom:16px;color:#38bdf8}
.cta-box p{font-size:16px;color:#cbd5e1;margin-bottom:24px}
.btn{display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#38bdf8,#14b8a6);
     color:#fff;font-weight:600;border-radius:10px;border:none;cursor:pointer;
     font-size:16px;transition:.2s;text-decoration:none}
.btn:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(56,189,248,.3);
           text-decoration:none}

/* Footer */
footer{background:rgba(13,27,41,.95);border-top:1px solid rgba(56,189,248,.2);
       padding:32px 24px;margin-top:80px;text-align:center}
footer p{color:#64748b;font-size:13px}
footer a{color:#38bdf8;margin:0 8px}

@media(max-width:768px){
  .hero h1{font-size:32px}
  .hero p{font-size:16px}
  .content-card{padding:24px}
  .container{padding:40px 16px}
}
</style>
`;

const HEADER = `
<header>
  <div class="header-inner">
    <div class="logo">⚡ RapidEx</div>
    <nav>
      <a href="/">Home</a>
      <a href="/about">About Us</a>
      <a href="/how-to-start">How to Start</a>
      <a href="/become-exchanger">Become Exchanger</a>
      <a href="/terms">Terms</a>
      <a href="/dashboard">Dashboard</a>
    </nav>
  </div>
</header>
`;

const FOOTER = `
<footer>
  <p>© ${new Date().getFullYear()} RapidEx. All rights reserved.</p>
  <p>
    <a href="/">Home</a>
    <a href="/about">About</a>
    <a href="/how-to-start">How to Start</a>
    <a href="/become-exchanger">Become Exchanger</a>
    <a href="/terms">Terms</a>
    <a href="/dashboard">Dashboard</a>
  </p>
</footer>
`;

// ─────────────────────────────────────────────────────────────
// ABOUT US
// ─────────────────────────────────────────────────────────────

export function renderAboutPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>About Us — RapidEx</title>
<meta name="description" content="Learn about RapidEx, the trusted Discord-based P2P crypto exchange platform with verified exchangers and escrow protection.">
${BASE_STYLE}
</head>
<body>
${HEADER}

<div class="container">
  <div class="hero">
    <h1>About RapidEx</h1>
    <p>Fast, secure, and private peer-to-peer crypto exchange built for Discord communities</p>
  </div>

  <div class="content-card">
    <h2>Our Mission</h2>
    <p>RapidEx was created to solve a critical problem in the crypto space: the need for fast, trustworthy, and private exchanges that don't require invasive KYC procedures or leaving your trusted community.</p>
    <p>We believe cryptocurrency exchanges should be:</p>
    <ul>
      <li><strong>Fast</strong> — Complete trades in minutes, not days</li>
      <li><strong>Secure</strong> — Escrow-protected with verified exchangers only</li>
      <li><strong>Private</strong> — No KYC, no data collection, no tracking</li>
      <li><strong>Accessible</strong> — Right where you are, in Discord</li>
    </ul>
  </div>

  <div class="content-card">
    <h2>How We're Different</h2>
    <div class="feature-grid">
      <div class="feature-box">
        <div class="icon">🔒</div>
        <h4>Escrow Protection</h4>
        <p>All trades are escrow-protected. Funds are held securely until both parties confirm completion.</p>
      </div>
      <div class="feature-box">
        <div class="icon">✅</div>
        <h4>Verified Exchangers</h4>
        <p>Only manually verified exchangers can claim trades. We vet every exchanger for trustworthiness.</p>
      </div>
      <div class="feature-box">
        <div class="icon">⚡</div>
        <h4>Instant Tickets</h4>
        <p>Create a private ticket in seconds. No public order books, no waiting around.</p>
      </div>
      <div class="feature-box">
        <div class="icon">🛡️</div>
        <h4>Dispute Resolution</h4>
        <p>If something goes wrong, our admin team steps in to mediate and resolve disputes fairly.</p>
      </div>
      <div class="feature-box">
        <div class="icon">🌐</div>
        <h4>Multi-Asset Support</h4>
        <p>Trade BTC, ETH, LTC, SOL, USDT, and more. Support for multiple payment methods.</p>
      </div>
      <div class="feature-box">
        <div class="icon">🔐</div>
        <h4>Privacy First</h4>
        <p>No KYC, no invasive verification. Your privacy is respected and protected.</p>
      </div>
    </div>
  </div>

  <div class="content-card">
    <h2>Supported Assets</h2>
    <p>RapidEx supports a wide range of cryptocurrencies and fiat payment methods:</p>
    
    <h3>Cryptocurrencies</h3>
    <ul>
      <li><strong>Bitcoin (BTC)</strong> — Native Bitcoin network</li>
      <li><strong>Litecoin (LTC)</strong> — Fast and low-fee</li>
      <li><strong>Ethereum (ETH)</strong> — Ethereum mainnet</li>
      <li><strong>Solana (SOL)</strong> — High-speed blockchain</li>
      <li><strong>USDT (BEP20)</strong> — Tether on Binance Smart Chain</li>
      <li><strong>BNB (BEP20)</strong> — Binance Coin on BSC</li>
    </ul>

    <h3>Fiat Payment Methods</h3>
    <ul>
      <li>Bank Transfer (SEPA, Wire, etc.)</li>
      <li>Revolut</li>
      <li>Wise</li>
      <li>PayPal</li>
      <li>CashApp</li>
      <li>Apple Pay</li>
      <li>Binance Gift Cards</li>
      <li>Paysafecard</li>
      <li>Cash in Person</li>
    </ul>
  </div>

  <div class="content-card">
    <h2>Our Technology</h2>
    <p>RapidEx is built on a robust, enterprise-grade architecture:</p>
    <ul>
      <li><strong>Hot Wallet System</strong> — Automated crypto deposits and withdrawals with real-time monitoring</li>
      <li><strong>Escrow Engine</strong> — Funds are locked in escrow until trade conditions are met</li>
      <li><strong>Webhook Integration</strong> — Real-time notifications from blockchain providers (NOWNodes, BlockCypher)</li>
      <li><strong>Audit Logging</strong> — Every action is logged for transparency and accountability</li>
      <li><strong>Rate Limiting</strong> — Protection against abuse and automated attacks</li>
      <li><strong>Idempotency</strong> — Duplicate transactions are prevented at the database level</li>
    </ul>
  </div>

  <div class="cta-box">
    <h2>Ready to start trading?</h2>
    <p>Join our Discord server and complete your first exchange in minutes</p>
    <a href="/how-to-start" class="btn">Learn How to Start →</a>
  </div>
</div>

${FOOTER}
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────
// TERMS AND CONDITIONS
// ─────────────────────────────────────────────────────────────

export function renderTermsPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Terms and Conditions — RapidEx</title>
<meta name="description" content="RapidEx Terms and Conditions. Read our platform rules, user responsibilities, and legal disclaimers.">
${BASE_STYLE}
</head>
<body>
${HEADER}

<div class="container">
  <div class="hero">
    <h1>Terms and Conditions</h1>
    <p>Last updated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
  </div>

  <div class="content-card">
    <h2>1. Acceptance of Terms</h2>
    <p>By accessing or using RapidEx (the "Service"), you agree to be bound by these Terms and Conditions. If you do not agree to these terms, you may not use the Service.</p>
    <p>RapidEx is a peer-to-peer cryptocurrency exchange platform that facilitates trades between users and verified exchangers. We act as an escrow service and platform operator but are not a party to the trades themselves.</p>
  </div>

  <div class="content-card">
    <h2>2. Eligibility</h2>
    <p>To use RapidEx, you must:</p>
    <ul>
      <li>Be at least 18 years of age (or the age of majority in your jurisdiction)</li>
      <li>Have the legal capacity to enter into binding contracts</li>
      <li>Not be prohibited from using cryptocurrency services under applicable laws</li>
      <li>Comply with all local laws and regulations regarding cryptocurrency transactions</li>
    </ul>
    <p>By using the Service, you represent and warrant that you meet these eligibility requirements.</p>
  </div>

  <div class="content-card">
    <h2>3. User Responsibilities</h2>
    <p>As a user of RapidEx, you agree to:</p>
    <ul>
      <li><strong>Provide accurate information</strong> — All trade details, wallet addresses, and payment information must be correct</li>
      <li><strong>Verify exchanger details</strong> — Always verify payment details before sending funds</li>
      <li><strong>Respond promptly</strong> — Trades require timely responses. Inactive users may have their trades cancelled</li>
      <li><strong>Use secure wallet addresses</strong> — Ensure you control the wallet address you provide. We are not responsible for funds sent to incorrect addresses</li>
      <li><strong>Not engage in fraudulent activity</strong> — Any attempt to defraud exchangers, users, or the platform will result in permanent ban</li>
      <li><strong>Follow payment instructions</strong> — Send the exact amount specified via the agreed payment method</li>
      <li><strong>Not abuse the dispute system</strong> — Disputes should only be raised for legitimate issues</li>
    </ul>
  </div>

  <div class="content-card">
    <h2>4. Exchanger Responsibilities</h2>
    <p>Verified exchangers on RapidEx must:</p>
    <ul>
      <li><strong>Maintain sufficient liquidity</strong> — Ensure you have adequate funds to fulfill claimed trades</li>
      <li><strong>Respond within agreed timeframes</strong> — Claims must be processed promptly</li>
      <li><strong>Provide accurate payment details</strong> — Users must receive clear instructions for fiat payments</li>
      <li><strong>Release crypto promptly</strong> — Once payment is confirmed, release funds without delay</li>
      <li><strong>Comply with Terms & Conditions</strong> — Exchanger-specific T&Cs must not violate platform rules</li>
      <li><strong>Handle disputes professionally</strong> — Work with admins to resolve issues fairly</li>
    </ul>
    <p>Exchangers who violate these responsibilities may be suspended or permanently banned.</p>
  </div>

  <div class="content-card">
    <h2>5. Escrow and Fees</h2>
    <p><strong>Escrow Protection:</strong> When an exchanger claims a trade, the required cryptocurrency amount is locked in escrow. Funds are only released when:</p>
    <ul>
      <li>The user confirms payment was sent, and the exchanger releases crypto, OR</li>
      <li>An admin force-releases the trade after dispute resolution</li>
    </ul>
    <p><strong>Platform Fees:</strong> RapidEx charges a small fee on each completed trade. Fees are calculated as a percentage of the crypto amount and are deducted automatically. Current fee rates are displayed during trade creation.</p>
    <p><strong>No Hidden Fees:</strong> All fees are transparent and shown before you confirm a trade.</p>
  </div>

  <div class="content-card">
    <h2>6. Dispute Resolution</h2>
    <p>If a trade dispute arises, either party may raise a dispute through the bot. When a dispute is opened:</p>
    <ol>
      <li>The trade is frozen and admins are notified</li>
      <li>Both parties must provide evidence (screenshots, transaction IDs, etc.)</li>
      <li>An admin reviews the evidence and makes a final decision</li>
      <li>The admin may force-release crypto to the user or force-cancel to return funds to the exchanger</li>
    </ol>
    <p><strong>Admin decisions are final.</strong> Repeated frivolous disputes may result in account restrictions.</p>
  </div>

  <div class="content-card">
    <h2>7. Prohibited Activities</h2>
    <p>The following activities are strictly prohibited on RapidEx:</p>
    <ul>
      <li>Money laundering or funding illegal activities</li>
      <li>Fraud, scamming, or impersonation</li>
      <li>Using stolen payment methods or funds</li>
      <li>Manipulating exchange rates or exploiting bugs</li>
      <li>Creating multiple accounts to bypass restrictions</li>
      <li>Harassment, threats, or abusive behavior toward exchangers or admins</li>
      <li>Attempting to reverse or chargeback fiat payments after receiving crypto</li>
    </ul>
    <p>Violations will result in immediate account termination and potential legal action.</p>
  </div>

  <div class="content-card">
    <h2>8. Risks and Disclaimers</h2>
    <p><strong>Cryptocurrency is volatile:</strong> The value of cryptocurrencies can fluctuate significantly. RapidEx is not responsible for market volatility or losses due to price changes.</p>
    <p><strong>No guarantees:</strong> While we vet exchangers and provide escrow protection, we cannot guarantee the outcome of every trade. Users trade at their own risk.</p>
    <p><strong>Third-party payment methods:</strong> RapidEx is not responsible for issues with third-party payment providers (banks, PayPal, Revolut, etc.). Payment disputes must be resolved with the payment provider.</p>
    <p><strong>Blockchain delays:</strong> Cryptocurrency transactions may experience delays due to network congestion. RapidEx is not responsible for blockchain network issues.</p>
    <p><strong>No financial advice:</strong> RapidEx does not provide financial, investment, or legal advice. Consult a professional before making financial decisions.</p>
  </div>

  <div class="content-card">
    <h2>9. Privacy and Data</h2>
    <p>RapidEx respects your privacy:</p>
    <ul>
      <li><strong>No KYC:</strong> We do not collect personal identification documents</li>
      <li><strong>Minimal data collection:</strong> We only store Discord IDs, wallet addresses, and trade history required for platform operation</li>
      <li><strong>Trade records:</strong> Trade data is retained for audit and dispute resolution purposes</li>
      <li><strong>No data selling:</strong> We never sell or share user data with third parties</li>
    </ul>
    <p>By using RapidEx, you consent to our data collection practices as described above.</p>
  </div>

  <div class="content-card">
    <h2>10. Account Termination</h2>
    <p>RapidEx reserves the right to suspend or terminate accounts at any time for:</p>
    <ul>
      <li>Violation of these Terms and Conditions</li>
      <li>Suspected fraudulent activity</li>
      <li>Legal or regulatory requirements</li>
      <li>Protecting the platform and its users</li>
    </ul>
    <p>Banned users may not create new accounts. Attempts to evade bans will result in permanent IP and Discord account blocks.</p>
  </div>

  <div class="content-card">
    <h2>11. Limitation of Liability</h2>
    <p>To the maximum extent permitted by law, RapidEx and its operators are not liable for:</p>
    <ul>
      <li>Loss of cryptocurrency due to user error (wrong wallet address, etc.)</li>
      <li>Losses resulting from market volatility</li>
      <li>Third-party payment provider issues</li>
      <li>Blockchain network delays or failures</li>
      <li>Exchanger misconduct or fraud (though we will assist with resolution)</li>
      <li>Service downtime or technical issues</li>
    </ul>
    <p><strong>Use RapidEx at your own risk.</strong> We provide the platform as-is without warranties of any kind.</p>
  </div>

  <div class="content-card">
    <h2>12. Changes to Terms</h2>
    <p>RapidEx reserves the right to modify these Terms and Conditions at any time. Changes will be posted on this page with an updated "Last Updated" date.</p>
    <p>Continued use of the Service after changes constitutes acceptance of the new terms.</p>
  </div>

  <div class="content-card">
    <h2>13. Contact and Support</h2>
    <p>For questions, support, or dispute assistance, please contact us through:</p>
    <ul>
      <li><strong>Discord:</strong> Open a support ticket in our Discord server</li>
      <li><strong>Admin Team:</strong> Tag an admin in your trade ticket or use the <code>/help</code> command</li>
    </ul>
    <p>We aim to respond to all inquiries within 24 hours.</p>
  </div>

  <div class="cta-box">
    <h2>Ready to trade?</h2>
    <p>By using RapidEx, you agree to these Terms and Conditions</p>
    <a href="/how-to-start" class="btn">Get Started →</a>
  </div>
</div>

${FOOTER}
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────
// HOW TO START
// ─────────────────────────────────────────────────────────────

export function renderHowToStartPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>How to Start Exchanging — RapidEx</title>
<meta name="description" content="Learn how to buy, sell, and swap crypto on RapidEx. Step-by-step guide for beginners.">
${BASE_STYLE}
</head>
<body>
${HEADER}

<div class="container">
  <div class="hero">
    <h1>How to Start Exchanging</h1>
    <p>Complete your first crypto trade in minutes with this simple guide</p>
  </div>

  <div class="content-card">
    <h2>Getting Started</h2>
    <p>RapidEx is a Discord-based P2P exchange platform. All trades happen through private tickets with verified exchangers. Here's how to get started:</p>
  </div>

  <div class="step-card">
    <span class="step-num">Step 1</span>
    <h3>Join Our Discord Server</h3>
    <p>If you haven't already, join the RapidEx Discord server. This is where all trades take place.</p>
    <p>Once you're in, navigate to the <strong>#exchange</strong> channel where you'll find the exchange panel.</p>
  </div>

  <div class="step-card">
    <span class="step-num">Step 2</span>
    <h3>Click "Start Exchange"</h3>
    <p>In the exchange channel, you'll see a panel with a button labeled <strong>⚡ Start Exchange</strong>. Click it to begin.</p>
    <p>A menu will appear asking you to choose your trade type:</p>
    <ul>
      <li><strong>Buy</strong> — Spend fiat currency to receive crypto</li>
      <li><strong>Sell</strong> — Send crypto to receive fiat currency</li>
      <li><strong>Swap</strong> — Exchange one cryptocurrency for another</li>
      <li><strong>Fiat to Fiat</strong> — Convert between payment methods (e.g., PayPal → Revolut)</li>
    </ul>
  </div>

  <div class="step-card">
    <span class="step-num">Step 3</span>
    <h3>Enter Trade Details</h3>
    <p>The bot will guide you through a series of prompts. You'll be asked to provide:</p>
    <ul>
      <li><strong>Cryptocurrency</strong> — Choose from BTC, ETH, LTC, SOL, USDT, or BNB</li>
      <li><strong>Fiat amount</strong> — How much you want to spend or receive (e.g., €250)</li>
      <li><strong>Payment method</strong> — Bank transfer, Revolut, PayPal, etc.</li>
      <li><strong>Currency</strong> — EUR, USD, or GBP</li>
    </ul>
    <p>A live exchange rate will be locked for 5 minutes. The bot will calculate the crypto amount you'll receive (or send) including fees.</p>
  </div>

  <div class="step-card">
    <span class="step-num">Step 4</span>
    <h3>Review and Confirm</h3>
    <p>Before confirming, double-check all details:</p>
    <ul>
      <li>Fiat amount (how much you're paying/receiving)</li>
      <li>Crypto amount (how much crypto you'll get/send)</li>
      <li>Payment method</li>
      <li>Platform fee (shown separately)</li>
    </ul>
    <p>If everything looks good, click <strong>Confirm Trade</strong>.</p>
  </div>

  <div class="step-card">
    <span class="step-num">Step 5</span>
    <h3>Wait for an Exchanger to Claim</h3>
    <p>Once you confirm, your trade is posted to a private forum where verified exchangers can browse available trades.</p>
    <p>A verified exchanger will claim your trade, usually within minutes. When claimed:</p>
    <ul>
      <li>A private ticket channel is created for you and the exchanger</li>
      <li>The required crypto amount is locked in escrow (for Buy/Sell trades)</li>
      <li>You'll receive a notification</li>
    </ul>
  </div>

  <div class="step-card">
    <span class="step-num">Step 6</span>
    <h3>Complete the Payment</h3>
    <p><strong>If you're buying crypto (sending fiat):</strong></p>
    <ul>
      <li>The exchanger will share their payment details (bank account, PayPal email, etc.)</li>
      <li>Send the <strong>exact fiat amount</strong> via the agreed payment method</li>
      <li>Once sent, click <strong>I've Sent Payment</strong> in the ticket</li>
    </ul>
    <p><strong>If you're selling crypto (receiving fiat):</strong></p>
    <ul>
      <li>Share your payment details with the exchanger</li>
      <li>The exchanger will send you the fiat payment</li>
      <li>Once received, confirm in the ticket</li>
    </ul>
    <p><strong>Important:</strong> Never send payment outside the agreed method or amount. Always verify payment details in the ticket.</p>
  </div>

  <div class="step-card">
    <span class="step-num">Step 7</span>
    <h3>Receive Your Crypto</h3>
    <p>After you mark payment as sent, the exchanger will verify receipt and choose how to release your crypto:</p>
    <ul>
      <li><strong>Internal Wallet:</strong> You'll be asked to provide your wallet address. The bot will send crypto from the hot wallet automatically.</li>
      <li><strong>External/Manual:</strong> The exchanger sends crypto manually from their own wallet. You'll be asked to confirm receipt.</li>
    </ul>
    <p>Once the crypto is sent and confirmed, the trade is complete! ✅</p>
  </div>

  <div class="content-card">
    <h2>Additional Tips</h2>
    
    <h3>Double-Check Wallet Addresses</h3>
    <p>Always verify your wallet address is correct before submitting. <strong>Crypto sent to the wrong address cannot be recovered.</strong></p>

    <h3>Be Responsive</h3>
    <p>Trades require timely responses. If you don't respond within a reasonable time, the exchanger may cancel the trade.</p>

    <h3>Use the Correct Payment Method</h3>
    <p>Only use the payment method you selected during trade creation. Switching methods without exchanger approval may cause issues.</p>

    <h3>What If Something Goes Wrong?</h3>
    <p>If there's a problem (payment not received, wrong amount, etc.), you can raise a dispute:</p>
    <ul>
      <li>Click the <strong>Dispute</strong> button in your ticket</li>
      <li>Explain the issue clearly</li>
      <li>An admin will review and resolve the dispute</li>
    </ul>
    <p>Admins can force-release crypto to you or force-cancel to return funds to the exchanger based on the evidence.</p>

    <h3>Exchanger Terms & Conditions</h3>
    <p>Some exchangers may have their own Terms & Conditions (T&C). If so, you'll be asked to accept them before the trade proceeds. Read them carefully before accepting.</p>
  </div>

  <div class="content-card">
    <h2>Trade Examples</h2>
    
    <h3>Example 1: Buy €250 Worth of Bitcoin</h3>
    <ol>
      <li>Click <strong>Start Exchange</strong> → Choose <strong>Buy</strong></li>
      <li>Select <strong>Bitcoin (BTC)</strong> as the cryptocurrency</li>
      <li>Enter <strong>€250</strong> as the fiat amount</li>
      <li>Choose <strong>Revolut</strong> as your payment method</li>
      <li>Review the rate and confirm</li>
      <li>Wait for an exchanger to claim</li>
      <li>Send €250 to the exchanger's Revolut</li>
      <li>Click <strong>I've Sent Payment</strong></li>
      <li>Provide your Bitcoin wallet address when asked</li>
      <li>Receive your BTC! 🎉</li>
    </ol>

    <h3>Example 2: Sell 0.05 ETH for GBP</h3>
    <ol>
      <li>Click <strong>Start Exchange</strong> → Choose <strong>Sell</strong></li>
      <li>Select <strong>Ethereum (ETH)</strong></li>
      <li>Enter <strong>0.05 ETH</strong> as the amount</li>
      <li>Choose <strong>Bank Transfer</strong> and <strong>GBP</strong></li>
      <li>Review and confirm</li>
      <li>Wait for an exchanger to claim</li>
      <li>Share your bank details with the exchanger</li>
      <li>The exchanger sends GBP to your bank</li>
      <li>Confirm receipt</li>
      <li>Trade complete! 💸</li>
    </ol>
  </div>

  <div class="cta-box">
    <h2>Ready to start your first trade?</h2>
    <p>Join our Discord server and exchange crypto in minutes</p>
    <a href="/about" class="btn">Learn More About RapidEx →</a>
  </div>
</div>

${FOOTER}
</body>
</html>`;
}


// ─────────────────────────────────────────────────────────────
// HOMEPAGE
// ─────────────────────────────────────────────────────────────

export function renderHomePage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>RapidEx — Fast, Secure P2P Crypto Exchange on Discord</title>
<meta name="description" content="Trade crypto instantly on Discord with verified exchangers, escrow protection, and no KYC. Buy, sell, or swap BTC, ETH, SOL, USDT and more.">
${BASE_STYLE}
<style>
.hero-home{background:linear-gradient(135deg,rgba(56,189,248,.15),rgba(20,184,166,.08));
           border:1px solid rgba(56,189,248,.3);border-radius:20px;padding:80px 40px;
           text-align:center;margin-bottom:60px}
.hero-home h1{font-size:56px;font-weight:900;margin-bottom:24px;line-height:1.2;
              background:linear-gradient(135deg,#38bdf8,#14b8a6,#38bdf8);
              -webkit-background-clip:text;-webkit-text-fill-color:transparent}
.hero-home .tagline{font-size:22px;color:#cbd5e1;margin-bottom:32px;max-width:700px;
                     margin-left:auto;margin-right:auto}
.hero-home .cta-group{display:flex;gap:16px;justify-content:center;flex-wrap:wrap}
.btn-large{padding:18px 40px;font-size:18px;border-radius:12px}
.btn-outline{background:transparent;border:2px solid #38bdf8;color:#38bdf8}
.btn-outline:hover{background:rgba(56,189,248,.1)}
.trust-badges{display:flex;gap:32px;justify-content:center;flex-wrap:wrap;
              margin-top:40px;padding-top:40px;border-top:1px solid rgba(56,189,248,.2)}
.trust-badge{display:flex;align-items:center;gap:10px;color:#94a3b8;font-size:14px}
.trust-badge .icon{font-size:24px}
@media(max-width:768px){.hero-home h1{font-size:36px}.hero-home .tagline{font-size:18px}
  .hero-home{padding:50px 24px}}
</style>
</head>
<body>
${HEADER}

<div class="container">
  <div class="hero-home">
    <h1>Trade Crypto Instantly<br>on Discord</h1>
    <p class="tagline">Fast, secure, and private P2P exchange with verified exchangers, escrow protection, and no KYC required</p>
    <div class="cta-group">
      <a href="/how-to-start" class="btn btn-large">Get Started</a>
      <a href="/become-exchanger" class="btn btn-large btn-outline">Become an Exchanger</a>
    </div>
    <div class="trust-badges">
      <div class="trust-badge"><span class="icon">🔒</span><strong>Escrow Protected</strong></div>
      <div class="trust-badge"><span class="icon">✅</span><strong>Verified Only</strong></div>
      <div class="trust-badge"><span class="icon">⚡</span><strong>Instant Tickets</strong></div>
      <div class="trust-badge"><span class="icon">🛡️</span><strong>No KYC</strong></div>
    </div>
  </div>

  <div class="content-card">
    <h2>Why Choose RapidEx?</h2>
    <div class="feature-grid">
      <div class="feature-box">
        <div class="icon">⚡</div>
        <h4>Lightning Fast</h4>
        <p>Complete trades in minutes, not hours. Create a ticket and get matched with an exchanger instantly.</p>
      </div>
      <div class="feature-box">
        <div class="icon">🔒</div>
        <h4>Escrow Protection</h4>
        <p>All crypto is held in escrow until both parties confirm. Your funds are always safe.</p>
      </div>
      <div class="feature-box">
        <div class="icon">✅</div>
        <h4>Trusted Exchangers</h4>
        <p>Every exchanger is manually verified by our team. Trade with confidence.</p>
      </div>
      <div class="feature-box">
        <div class="icon">🛡️</div>
        <h4>Privacy First</h4>
        <p>No KYC, no tracking, no data collection. Your privacy is respected.</p>
      </div>
      <div class="feature-box">
        <div class="icon">🌐</div>
        <h4>Multi-Asset</h4>
        <p>Trade BTC, ETH, LTC, SOL, USDT, BNB with multiple fiat payment methods.</p>
      </div>
      <div class="feature-box">
        <div class="icon">💬</div>
        <h4>Discord Native</h4>
        <p>Everything happens in Discord. No new platform to learn, no apps to download.</p>
      </div>
    </div>
  </div>

  <div class="content-card">
    <h2>How It Works</h2>
    <div class="step-card">
      <span class="step-num">1</span>
      <h3>Click "Start Exchange"</h3>
      <p>Open the #exchange channel on Discord and click the Start Exchange button. Choose your trade type (Buy, Sell, Swap).</p>
    </div>
    <div class="step-card">
      <span class="step-num">2</span>
      <h3>Enter Trade Details</h3>
      <p>Specify the amount, cryptocurrency, payment method, and currency. Get a live rate locked for 5 minutes.</p>
    </div>
    <div class="step-card">
      <span class="step-num">3</span>
      <h3>Exchanger Claims Your Trade</h3>
      <p>A verified exchanger claims your trade and a private ticket is created. Crypto is locked in escrow.</p>
    </div>
    <div class="step-card">
      <span class="step-num">4</span>
      <h3>Complete Payment</h3>
      <p>Follow the payment instructions, send or receive fiat, and confirm in the ticket.</p>
    </div>
    <div class="step-card">
      <span class="step-num">5</span>
      <h3>Get Your Crypto</h3>
      <p>Exchanger releases your crypto from escrow. Trade complete! ✅</p>
    </div>
  </div>

  <div class="content-card">
    <h2>Supported Assets & Methods</h2>
    <div class="feature-grid">
      <div class="feature-box">
        <div class="icon">₿</div>
        <h4>Cryptocurrencies</h4>
        <p>BTC, ETH, LTC, SOL, USDT (BEP20), BNB</p>
      </div>
      <div class="feature-box">
        <div class="icon">💳</div>
        <h4>Payment Methods</h4>
        <p>Bank Transfer, Revolut, Wise, PayPal, CashApp, Apple Pay, Binance Gift Cards, Paysafe, Cash in Person</p>
      </div>
      <div class="feature-box">
        <div class="icon">💰</div>
        <h4>Fiat Currencies</h4>
        <p>EUR, USD, GBP</p>
      </div>
    </div>
  </div>

  <div class="cta-box">
    <h2>Ready to start trading?</h2>
    <p>Join thousands of users already trading crypto on RapidEx</p>
    <a href="/how-to-start" class="btn btn-large">Get Started Now →</a>
  </div>
</div>

${FOOTER}
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────
// BECOME EXCHANGER
// ─────────────────────────────────────────────────────────────

export function renderBecomeExchangerPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Become an Exchanger — RapidEx</title>
<meta name="description" content="Earn by providing liquidity on RapidEx. Become a verified exchanger and help users trade crypto securely.">
${BASE_STYLE}
</head>
<body>
${HEADER}

<div class="container">
  <div class="hero">
    <h1>Become an Exchanger</h1>
    <p>Earn by providing liquidity and helping users trade crypto securely</p>
  </div>

  <div class="content-card">
    <h2>Why Become an Exchanger?</h2>
    <div class="feature-grid">
      <div class="feature-box">
        <div class="icon">💰</div>
        <h4>Earn Fees</h4>
        <p>Set your own rates and earn on every trade you facilitate. Keep 100% of your spread.</p>
      </div>
      <div class="feature-box">
        <div class="icon">🔒</div>
        <h4>Escrow Protected</h4>
        <p>Your crypto is locked in escrow until trade completion. No risk of chargebacks or fraud.</p>
      </div>
      <div class="feature-box">
        <div class="icon">📊</div>
        <h4>Dashboard Access</h4>
        <p>Track your trades, balances, and withdrawals in real-time through our admin dashboard.</p>
      </div>
      <div class="feature-box">
        <div class="icon">⚡</div>
        <h4>Instant Notifications</h4>
        <p>Get notified immediately when new trades match your liquidity. Claim trades in seconds.</p>
      </div>
      <div class="feature-box">
        <div class="icon">🛡️</div>
        <h4>Dispute Support</h4>
        <p>Admins mediate disputes fairly. Your interests are protected.</p>
      </div>
      <div class="feature-box">
        <div class="icon">🌐</div>
        <h4>Flexible Schedule</h4>
        <p>Work when you want. No minimum hours or trade requirements.</p>
      </div>
    </div>
  </div>

  <div class="content-card">
    <h2>Requirements</h2>
    <p>To become a verified exchanger on RapidEx, you must meet these requirements:</p>
    <ul>
      <li><strong>Minimum liquidity</strong> — Have sufficient crypto funds to facilitate trades (varies by asset)</li>
      <li><strong>Active Discord account</strong> — Account must be at least 30 days old with verified email</li>
      <li><strong>Reliable availability</strong> — Respond to claimed trades within 15 minutes</li>
      <li><strong>Clean record</strong> — No history of scamming or fraud in crypto communities</li>
      <li><strong>Payment methods</strong> — Access to at least one major fiat payment method (bank, Revolut, PayPal, etc.)</li>
      <li><strong>Verification process</strong> — Pass our manual verification and interview process</li>
    </ul>
  </div>

  <div class="content-card">
    <h2>How It Works</h2>
    <div class="step-card">
      <span class="step-num">1</span>
      <h3>Submit Application</h3>
      <p>Join our Discord server and open a verification ticket. Provide basic information about your liquidity, experience, and availability.</p>
    </div>
    <div class="step-card">
      <span class="step-num">2</span>
      <h3>Verification Process</h3>
      <p>Our team reviews your application and conducts a brief interview. We check your Discord history and community reputation.</p>
    </div>
    <div class="step-card">
      <span class="step-num">3</span>
      <h3>Get Verified</h3>
      <p>Once approved, you receive the "Exchanger" role and access to the trades forum. Deposit your initial liquidity.</p>
    </div>
    <div class="step-card">
      <span class="step-num">4</span>
      <h3>Start Claiming Trades</h3>
      <p>Browse available trades in the forum channel. Claim trades that match your liquidity and payment methods.</p>
    </div>
    <div class="step-card">
      <span class="step-num">5</span>
      <h3>Facilitate Trades</h3>
      <p>Work with users in private tickets. Send/receive payments, release crypto from escrow, and earn fees.</p>
    </div>
    <div class="step-card">
      <span class="step-num">6</span>
      <h3>Withdraw Earnings</h3>
      <p>Withdraw your earnings anytime using the <code>/withdraw</code> command. Funds are processed within 24 hours.</p>
    </div>
  </div>

  <div class="content-card">
    <h2>Exchanger Responsibilities</h2>
    <p>As a verified exchanger, you agree to:</p>
    <ul>
      <li><strong>Maintain liquidity</strong> — Keep sufficient funds to honor claimed trades</li>
      <li><strong>Respond promptly</strong> — Respond to tickets within 15 minutes of claiming</li>
      <li><strong>Provide clear instructions</strong> — Share accurate payment details with users</li>
      <li><strong>Release crypto on time</strong> — Release escrow within 10 minutes of confirming payment</li>
      <li><strong>Be professional</strong> — Communicate respectfully and resolve issues calmly</li>
      <li><strong>Follow platform rules</strong> — Comply with RapidEx Terms & Conditions</li>
      <li><strong>Handle disputes fairly</strong> — Work with admins to resolve disputes honestly</li>
    </ul>
    <p><strong>Violations may result in suspension or permanent ban.</strong></p>
  </div>

  <div class="content-card">
    <h2>Fees and Earnings</h2>
    <p><strong>How You Earn:</strong> Exchangers earn by setting their own exchange rates. You buy crypto from users at one rate and sell at another, keeping the spread as profit.</p>
    <p><strong>Platform Fee:</strong> RapidEx charges a small platform fee (shown during trade creation). This fee is deducted from the crypto amount automatically.</p>
    <p><strong>No Hidden Costs:</strong> There are no monthly fees, listing fees, or withdrawal fees beyond blockchain network costs.</p>
    <p><strong>Example Trade:</strong></p>
    <ul>
      <li>User wants to buy €250 worth of BTC at market rate of €50,000/BTC</li>
      <li>User receives 0.005 BTC minus platform fee</li>
      <li>You provide the BTC and receive €250 via Revolut</li>
      <li>If you sourced BTC at a better rate, you keep the difference as profit</li>
    </ul>
  </div>

  <div class="content-card">
    <h2>Tools and Features</h2>
    <h3>Exchanger Commands</h3>
    <ul>
      <li><code>/balance</code> — Check your available and escrowed balances</li>
      <li><code>/my-trades</code> — View your recent trade history</li>
      <li><code>/withdraw</code> — Queue a withdrawal to your external wallet</li>
      <li><code>/deposit-addresses</code> — View your deposit addresses for each asset</li>
      <li><code>/set-terms</code> — Set your Terms & Conditions for users</li>
      <li><code>/my-terms</code> — View your current T&C</li>
    </ul>
    <h3>Dashboard Access</h3>
    <p>Verified exchangers get access to the admin dashboard where you can:</p>
    <ul>
      <li>Monitor real-time trade status</li>
      <li>View detailed transaction history</li>
      <li>Track your earnings and withdrawals</li>
      <li>Analyze your performance metrics</li>
    </ul>
  </div>

  <div class="cta-box">
    <h2>Ready to become an exchanger?</h2>
    <p>Join our Discord server and open a verification ticket to get started</p>
    <a href="/terms" class="btn">Read Terms & Conditions →</a>
  </div>
</div>

${FOOTER}
</body>
</html>`;
}
