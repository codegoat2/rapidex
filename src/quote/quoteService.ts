import axios from 'axios';
import { ethers } from 'ethers';
import { db } from '../db/client';
import { config } from '../config/env';
import { getSettingNumber } from '../admin/settingsService';
import { divideDecimal, maxDecimal, multiplyDecimal } from './money';
import type { Asset, FiatCurrency, FiatMethod, TradeDirection } from '../types';

const QUOTE_TTL_SECONDS = 300;
const RATE_CACHE_TTL_MS = 15_000;

const COINGECKO_IDS: Record<Asset, string> = {
  BTC:        'bitcoin',
  LTC:        'litecoin',
  ETH:        'ethereum',
  SOL:        'solana',
  BNB:        'binancecoin',
  USDT_BEP20: 'tether',
};

const rateCache = new Map<string, { rate: string; expiresAt: number }>();

export interface TradeQuote {
  id: string;
  asset: Asset;
  amount: string;
  direction: TradeDirection;
  fiatCurrency: FiatCurrency;
  fiatMethod: FiatMethod;
  fiatAmount: string;
  rate: string;
  rateSource: string;
  feePercentage: string;
  feeAmount: string;
  expiresAt: Date;
  userNote: string | null;
}

// ---------------------------------------------------------------------------
// Create a live-priced quote (BUY / SELL only)
// ---------------------------------------------------------------------------

export async function createTradeQuote(params: {
  userDiscordId: string;
  asset: Asset;
  amount: string;
  direction: TradeDirection;
  fiatCurrency: FiatCurrency;
  fiatMethod: FiatMethod;
  userNote?: string | null;
  amountIsFiat?: boolean;
}): Promise<TradeQuote> {
  // Only BUY and SELL use live quotes
  if (params.direction !== 'BUY' && params.direction !== 'SELL') {
    throw new Error('createTradeQuote is only for BUY and SELL trades');
  }

  const minimum = await getSettingNumber('MIN_TRADE_AMOUNT', config.MIN_TRADE_AMOUNT);
  const maximum = await getSettingNumber('MAX_TRADE_AMOUNT', config.MAX_TRADE_AMOUNT);
  const rate = await getRate(params.asset, params.fiatCurrency);
  const cryptoAmount = params.amountIsFiat ? divideDecimal(params.amount, rate) : params.amount;
  const amountUnits = ethers.parseUnits(cryptoAmount, 18);

  if (amountUnits < ethers.parseUnits(String(minimum), 18)) {
    throw new Error(`Trade amount is below the minimum of ${minimum}`);
  }
  if (amountUnits > ethers.parseUnits(String(maximum), 18)) {
    throw new Error(`Trade amount is above the maximum of ${maximum}`);
  }

  const [feeConfig] = await db<{ fee_percentage: string; min_fee_amount: string }[]>`
    SELECT fee_percentage, min_fee_amount FROM fee_config WHERE asset = ${params.asset}
  `;

  const feePercentage = feeConfig?.fee_percentage ?? '0';
  const minimumFee    = feeConfig?.min_fee_amount  ?? '0';
  const feeAmount     = maxDecimal(multiplyDecimal(cryptoAmount, feePercentage, 4), minimumFee);
  const fiatAmount    = multiplyDecimal(cryptoAmount, rate, 18);
  const expiresAt     = new Date(Date.now() + QUOTE_TTL_SECONDS * 1000);
  const userNote      = params.userNote ?? null;

  const [row] = await db<{ id: string }[]>`
    INSERT INTO trade_quotes (
      user_discord_id, asset, amount, direction,
      fiat_currency, fiat_method, fiat_amount, rate, rate_source,
      fee_percentage, fee_amount, expires_at, user_note
    ) VALUES (
      ${params.userDiscordId}, ${params.asset}, ${cryptoAmount}, ${params.direction},
      ${params.fiatCurrency}, ${params.fiatMethod}, ${fiatAmount}, ${rate}, 'COINGECKO',
      ${feePercentage}, ${feeAmount}, ${expiresAt.toISOString()}, ${userNote}
    )
    RETURNING id
  `;

  return {
    id: row.id,
    asset: params.asset,
    amount: cryptoAmount,
    direction: params.direction,
    fiatCurrency: params.fiatCurrency,
    fiatMethod: params.fiatMethod,
    fiatAmount,
    rate,
    rateSource: 'COINGECKO',
    feePercentage,
    feeAmount,
    expiresAt,
    userNote,
  };
}

// ---------------------------------------------------------------------------
// Consume a quote (mark as used)
// ---------------------------------------------------------------------------

export async function consumeTradeQuote(quoteId: string, userDiscordId: string): Promise<TradeQuote | null> {
  return db.begin(async (sql) => {
    const [row] = await sql<{
      id: string;
      asset: Asset;
      amount: string;
      direction: TradeDirection;
      fiat_currency: FiatCurrency;
      fiat_method: FiatMethod;
      fiat_amount: string;
      rate: string;
      rate_source: string;
      fee_percentage: string;
      fee_amount: string;
      expires_at: Date;
      consumed_at: Date | null;
      user_note: string | null;
    }[]>`
      SELECT * FROM trade_quotes
      WHERE id = ${quoteId} AND user_discord_id = ${userDiscordId}
      FOR UPDATE
    `;

    if (!row || row.consumed_at || new Date(row.expires_at).getTime() <= Date.now()) return null;

    await sql`UPDATE trade_quotes SET consumed_at = NOW() WHERE id = ${quoteId}`;

    return {
      id:            row.id,
      asset:         row.asset,
      amount:        row.amount,
      direction:     row.direction,
      fiatCurrency:  row.fiat_currency,
      fiatMethod:    row.fiat_method,
      fiatAmount:    row.fiat_amount,
      rate:          row.rate,
      rateSource:    row.rate_source,
      feePercentage: row.fee_percentage,
      feeAmount:     row.fee_amount,
      expiresAt:     new Date(row.expires_at),
      userNote:      row.user_note,
    };
  });
}

// ---------------------------------------------------------------------------
// Rate fetch (with cache)
// ---------------------------------------------------------------------------

async function getRate(asset: Asset, currency: FiatCurrency): Promise<string> {
  const cacheKey = `${asset}:${currency}`;
  const cached   = rateCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.rate;

  const response = await axios.get<Record<string, Record<string, number>>>(
    'https://api.coingecko.com/api/v3/simple/price',
    {
      params: { ids: COINGECKO_IDS[asset], vs_currencies: currency.toLowerCase() },
      timeout: 8000,
    },
  );

  const value = response.data[COINGECKO_IDS[asset]]?.[currency.toLowerCase()];
  if (!Number.isFinite(value) || (value ?? 0) <= 0) {
    throw new Error('Unable to obtain a market rate right now. Please try again shortly.');
  }

  const rate = (value as number).toFixed(18);
  rateCache.set(cacheKey, { rate, expiresAt: Date.now() + RATE_CACHE_TTL_MS });
  return rate;
}
