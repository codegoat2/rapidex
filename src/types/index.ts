/**
 * Shared domain types for RapidEx.
 * These mirror the database schema exactly so the application layer
 * is always in sync with the source of truth.
 */

// ---------------------------------------------------------------------------
// Enums (must match CHECK constraints in migrations)
// ---------------------------------------------------------------------------

export type Asset = 'BTC' | 'LTC' | 'ETH' | 'SOL' | 'USDT_BEP20' | 'BNB';

export type Chain = 'bitcoin' | 'litecoin' | 'ethereum' | 'solana' | 'bsc';

export type FiatCurrency = 'EUR' | 'USD' | 'GBP';

export type FiatMethod =
  | 'BANK_TRANSFER'
  | 'REVOLUT'
  | 'WISE'
  | 'PAYPAL'
  | 'CASH_IN_PERSON'
  | 'BINANCE_GIFT_CARD'
  | 'PAYSAFE'
  | 'APPLE_PAY'
  | 'CASHAPP'
  | 'OTHER';

export type TradeDirection = 'BUY' | 'SELL' | 'SWAP' | 'FIAT_TO_FIAT';

/**
 * Explicit trade state machine.
 *
 * Happy path:  OPEN → CLAIMED → FIAT_PENDING → FIAT_SENT → RELEASE_PENDING → CRYPTO_SENT → COMPLETED
 * Terminal:    CANCELLED | DISPUTED | EXPIRED | FAILED
 */
export type TradeStatus =
  | 'OPEN'
  | 'CLAIMED'
  | 'FIAT_PENDING'
  | 'FIAT_SENT'
  | 'RELEASE_PENDING'
  | 'CRYPTO_SENT'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DISPUTED'
  | 'EXPIRED'
  | 'FAILED';

export type LedgerEntryType =
  | 'DEPOSIT'
  | 'ESCROW_LOCK'
  | 'ESCROW_RELEASE'
  | 'WITHDRAWAL'
  | 'FEE'
  | 'MANUAL_CREDIT'
  | 'MANUAL_DEBIT';

export type AuditAction =
  | 'EXCHANGER_VERIFIED'
  | 'EXCHANGER_BANNED'
  | 'MANUAL_CREDIT'
  | 'MANUAL_DEBIT'
  | 'FORCE_RELEASE'
  | 'FORCE_CANCEL'
  | 'FEE_CONFIG_UPDATED'
  | 'TRADE_DISPUTED'
  | 'DISPUTE_RESOLVED'
  | 'PANEL_DEPLOYED'
  | 'WEBHOOK_REGISTERED'
  | 'SYSTEM_ACTION';

export type WebhookProvider = 'BLOCKCYPHER' | 'ALCHEMY' | 'HELIUS' | 'RECONCILIATION';

// ---------------------------------------------------------------------------
// Database row types (snake_case to match Postgres columns)
// ---------------------------------------------------------------------------

export interface DbUser {
  id: string;
  discord_id: string;
  discord_username: string;
  created_at: Date;
  updated_at: Date;
}

export interface DbExchanger {
  id: string;
  user_id: string;
  discord_id: string;
  discord_username: string;
  is_active: boolean;
  is_banned: boolean;
  ban_reason: string | null;
  verified_by_discord_id: string;
  verified_at: Date;
  terms_and_conditions: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface DbTcAcceptance {
  id: string;
  user_discord_id: string;
  exchanger_id: string;
  tc_hash: string;
  trade_id: string | null;
  accepted_at: Date;
}

export interface DbDepositAddress {
  id: string;
  exchanger_id: string;
  asset: Asset;
  chain: Chain;
  address: string;
  derivation_path: string;
  created_at: Date;
}

export interface DbTrade {
  id: string;
  user_discord_id: string;
  exchanger_id: string | null;
  asset: Asset;
  amount: string;
  fiat_amount: string | null;
  quote_id: string | null;
  rate: string | null;
  rate_source: string | null;
  fee_percentage_snapshot: string | null;
  fee_amount: string | null;
  quote_expires_at: Date | null;
  fiat_currency: FiatCurrency;
  fiat_method: FiatMethod;
  direction: TradeDirection;
  /** For SWAP trades: the asset the user wants to receive */
  swap_to_asset: Asset | null;
  /** For FIAT_TO_FIAT trades: the receiving fiat method */
  fiat_to_method: FiatMethod | null;
  /** Optional message from the user at trade creation */
  user_note: string | null;
  status: TradeStatus;
  ticket_channel_id: string;
  forum_thread_id: string | null;
  user_wallet_address: string | null;
  tx_id: string | null;
  claimed_at: Date | null;
  completed_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface DbTradeLog {
  id: string;
  trade_id: string;
  from_status: TradeStatus | null;
  to_status: TradeStatus;
  actor_discord_id: string;
  note: string | null;
  created_at: Date;
}

export interface DbLedgerEntry {
  id: string;
  exchanger_id: string;
  trade_id: string | null;
  type: LedgerEntryType;
  asset: Asset;
  amount: string; // always positive; direction determined by type
  balance_before: string;
  balance_after: string;
  escrow_before: string;
  escrow_after: string;
  reference: string; // human-readable description
  idempotency_key: string; // prevents duplicate entries
  created_at: Date;
}

export interface DbAuditLog {
  id: string;
  actor_discord_id: string;
  target_discord_id: string | null;
  action: AuditAction;
  entity_type: string | null; // e.g. "trade", "exchanger"
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

export interface DbWebhookEvent {
  id: string;
  provider: WebhookProvider;
  event_id: string; // provider-supplied unique event ID
  raw_payload: Record<string, unknown>;
  processed: boolean;
  processed_at: Date | null;
  error: string | null;
  created_at: Date;
}

export interface DbHotWalletBalance {
  id: string;
  asset: Asset;
  chain: Chain;
  address: string;
  balance: string;
  last_checked_at: Date;
  updated_at: Date;
}

export interface DbFeeConfig {
  id: string;
  asset: Asset;
  fee_percentage: string; // e.g. "0.5" = 0.5%
  min_fee_amount: string;
  updated_by_discord_id: string;
  updated_at: Date;
}
