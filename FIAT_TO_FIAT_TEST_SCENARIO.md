# Fiat-to-Fiat Exchange Flow — Test Scenario

## Overview
This document describes the complete fiat-to-fiat exchange flow with bot-held crypto collateral.

## Test Scenario: EUR 1000 Exchange

### Participants
- **Buyer (User)**: Discord ID `user_123`, wants EUR 1000
- **Exchanger**: Discord ID `exchanger_456`, has BTC, ETH, USDT available
- **Bot**: Holds collateral

---

## Flow Step-by-Step

### 1. Trade Creation (User)
**Action**: User initiates a EUR 1000 fiat-to-fiat trade
- **Direction**: `FIAT_TO_FIAT`
- **Fiat Amount**: `1000` EUR
- **Fiat Method**: REVOLUT (send) → BANK_TRANSFER (receive)
- **Status**: `OPEN`
- **Database**: Trade created with `collateral_asset = NULL`, `collateral_amount = NULL`

**Expected State**:
```
trades.status = 'OPEN'
trades.direction = 'FIAT_TO_FIAT'
trades.fiat_amount = 1000
trades.fiat_currency = 'EUR'
trades.collateral_asset = NULL
trades.collateral_amount = NULL
```

---

### 2. Exchanger Claims Trade
**Action**: Exchanger clicks "Claim Trade" button

**System Flow**:
1. Calls `handleClaim()`
2. Checks T&C acceptance
3. Calls `claimTrade()` → `handleFiatToFiatClaim()`
4. Inside `handleFiatToFiatClaim()`:
   - Transitions trade to `CLAIMED`
   - Gets exchanger's available balances
   - **Selects best available collateral asset** (priority: BTC > ETH > USDT > LTC > USDC > BNB)
   - Assume exchanger has: BTC=0.05, ETH=2.0, USDT=5000
   - **Selected**: BTC (highest priority)
   - **Collateral amount**: 1000 (same unit as fiat for simplicity)
   - Calls `lockCollateralForFiatTrade()`:
     - Creates ledger entry: `ESCROW_LOCK`
     - Moves 1000 BTC from available → escrow
     - Updates trade: `collateral_asset = 'BTC'`, `collateral_amount = 1000`, `collateral_locked_at = NOW()`
   - Transitions trade to `FIAT_PENDING`

**Expected State**:
```
trades.status = 'FIAT_PENDING'
trades.exchanger_id = 'exchanger_456'
trades.claimed_at = NOW()
trades.collateral_asset = 'BTC'
trades.collateral_amount = 1000
trades.collateral_locked_at = NOW()

ledger_entries: 
  - type: ESCROW_LOCK
    asset: BTC
    amount: 1000
    available_before: 0.05 → after: 0.05 - 1000 (NEGATIVE!)
```

**⚠️ ISSUE DETECTED**: Collateral amount (1000 BTC) vastly exceeds available balance (0.05 BTC)!
- The algorithm should convert fiat to crypto amount using current rates
- NOT use raw fiat amount as collateral

**Fix Required**: Adjust `handleFiatToFiatClaim()` to calculate proper crypto collateral

---

### 3. Buyer Sends Fiat (Manual)
**Action**: Buyer sends EUR 1000 to exchanger via Revolut (outside bot)
- No system action yet
- Buyer waits for signal to confirm

---

### 4. Buyer Confirms Fiat Sent
**Action**: Buyer clicks "I've Sent Payment" button

**System Flow**:
1. Calls `handleFiatSent()`
2. Transitions trade to `FIAT_SENT`
3. Posts message to exchanger: "Buyer sent fiat, choose release method"
4. Shows two options:
   - External/Manual (for fiat-to-fiat)
   - Dispute

**Expected State**:
```
trades.status = 'FIAT_SENT'
```

---

### 5. Exchanger Sends Fiat (Manual)
**Action**: Exchanger sends EUR 1000 to buyer via bank transfer (outside bot)
- No system action yet

---

### 6. Exchanger Confirms Release
**Action**: Exchanger clicks "External/Manual" button

**System Flow**:
1. Calls `handleReleaseExternal()`
2. Transitions trade to `RELEASE_PENDING`
3. Posts message to buyer: "Exchanger sent payment, did you receive?"
4. Shows two buttons:
   - "✅ Yes, I Received It"
   - "❌ No, I Haven't Received It"

**Expected State**:
```
trades.status = 'RELEASE_PENDING'
```

---

### 7a. Buyer Confirms Receipt (Happy Path)
**Action**: Buyer clicks "Yes, I Received It"

**System Flow**:
1. Calls `handleExternalPaymentReceived()`
2. Checks if fiat-to-fiat + collateral fields exist
3. Calls `releaseCollateralToExchanger()`:
   - Creates ledger entry: `ESCROW_RELEASE`
   - Moves collateral (1000 BTC) from escrow → available
   - Updates trade: `collateral_released_at = NOW()`
4. Transitions trade to `COMPLETED`
5. Calls `settleTradeProfit()` to calculate RapidEx fees
6. Posts completion message to ticket channel

**Expected State**:
```
trades.status = 'COMPLETED'
trades.completed_at = NOW()
trades.collateral_released_at = NOW()

ledger_entries:
  - type: ESCROW_RELEASE
    asset: BTC
    amount: 1000
    escrow_before: 1000 → after: 0
    available_before: -999.95 → after: 0.05
```

---

### 7b. Payment Dispute (Unhappy Path)
**Action**: Buyer clicks "No, I Haven't Received It"

**System Flow**:
1. Calls `handleExternalPaymentNotReceived()`
2. Transitions trade to `DISPUTED`
3. Posts dispute message to admin channel
4. Collateral remains locked until admin resolves

**Admin Options**:
- **Force Release**: Releases collateral to exchanger, marks trade COMPLETED
- **Force Cancel**: Releases collateral back to exchanger as available (not escrow)

---

## Critical Implementation Details

### Collateral Amount Calculation
**CURRENT CODE** (needs fix):
```typescript
const collateralAmount = trade.amount; // Uses fiat amount as-is (WRONG)
```

**SHOULD BE**:
```typescript
// Get current exchange rate: EUR → BTC
const rate = await getExchangeRate('EUR', 'BTC');
const collateralAmount = divideDecimal(trade.fiat_amount, rate);
// e.g., EUR 1000 / 50000 EUR/BTC = 0.02 BTC
```

### Database Constraints
The `collateral_amount` field should accept decimal values with at least 18 decimal places:
```sql
collateral_amount NUMERIC(36,18)
```

### Ledger Integrity
For fiat-to-fiat trades:
1. **Claim**: `ESCROW_LOCK` → moves collateral to escrow
2. **Complete**: `ESCROW_RELEASE` → moves collateral back to available
3. **Cancel**: `ESCROW_RELEASE` → moves collateral back to available

---

## Test Checklist

- [ ] **Collateral amount calculated correctly** using rate conversion
- [ ] **Ledger entries created** for ESCROW_LOCK when trade claimed
- [ ] **Buyer doesn't see collateral** in embeds (only fiat amounts)
- [ ] **Exchanger can't select "Internal Wallet"** for fiat-to-fiat
- [ ] **Collateral released on trade completion** via ESCROW_RELEASE
- [ ] **Collateral released on dispute resolution** (force-release/cancel)
- [ ] **Trade status transitions** correctly: OPEN → CLAIMED → FIAT_PENDING → FIAT_SENT → RELEASE_PENDING → COMPLETED
- [ ] **Notification messages** are appropriate for fiat-to-fiat trades
- [ ] **Ledger balances** remain consistent (no negative balances)
- [ ] **Idempotency keys** prevent duplicate ledger entries

---

## Known Issues

### Issue #1: Collateral Amount Calculation
**Status**: ✅ FIXED

The implementation now correctly uses exchange rates to convert fiat → crypto collateral amount:

```typescript
// In handleFiatToFiatClaim():
const collateralQuote = await createFiatCollateralQuote({
  asset: selectedAsset,
  fiatAmount: String(fiatAmount),
  fiatCurrency: trade.fiat_currency,
});

const collateralAmount = collateralQuote.collateralAmount;
```

**Example Calculation**:
- Trade: EUR 1000 fiat-to-fiat
- Exchange rate: 1 EUR = 0.00002 BTC (50,000 EUR/BTC)
- Collateral amount: 1000 / 50000 = 0.02 BTC
- Ledger entry: Lock 0.02 BTC from available → escrow

---

## Files Modified
1. `src/db/migrations/017_fiat_collateral_tracking.sql` ✅
2. `src/ledger/ledgerService.ts` ✅ (added collateral functions)
3. `src/bot/handlers/tradeFlowHandler.ts` ✅ (updated claim/release flows)
4. `src/bot/embeds/tradeEmbed.ts` ✅ (fiat-only messaging)

---

## Next Steps
1. Fix collateral amount calculation to use exchange rates
2. Run integration tests with actual price feeds
3. Verify ledger balances after full trade cycle
4. Test dispute scenarios
