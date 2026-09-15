/**
 * Fee Configuration Service
 * Manages fee calculations and retrieval from the database.
 */

import { db } from '../db/client';
import { logger } from '../utils/logger';

export const DEFAULT_FEE_PERCENTAGE = 10; // 10% default fee

// Minimum fees in USD for payment methods
export const MINIMUM_FEES: Record<string, number> = {
  PAYPAL: 5,
  REVOLUT: 2,
  WISE: 0,
  BANK_TRANSFER: 0,
  CASH_IN_PERSON: 0,
  OTHER: 0,
};

export interface FiatFeeConfig {
  currency: 'EUR' | 'USD' | 'GBP';
  feePercentage: number;
  minFeeAmount: number;
  updatedByDiscordId: string;
  updatedAt: string;
}

export interface FeeCalculationResult {
  userAmount: number;
  feePercentage: number;
  feeAmount: number;
  minimumFee: number;
  finalFee: number;
  finalAmount: number;
}

/**
 * Get fee configuration for a fiat currency
 */
export async function getFiatFeeConfig(
  currency: 'EUR' | 'USD' | 'GBP'
): Promise<FiatFeeConfig> {
  try {
    const rows = await db<FiatFeeConfig[]>`
      SELECT 
        currency,
        fee_percentage as "feePercentage",
        min_fee_amount as "minFeeAmount",
        updated_by_discord_id as "updatedByDiscordId",
        updated_at as "updatedAt"
      FROM fiat_fee_config
      WHERE currency = ${currency}
    `;

    if (rows.length === 0) {
      // Return defaults if not in database
      return {
        currency,
        feePercentage: DEFAULT_FEE_PERCENTAGE,
        minFeeAmount: MINIMUM_FEES[currency] || 0,
        updatedByDiscordId: 'SYSTEM',
        updatedAt: new Date().toISOString(),
      };
    }

    return rows[0];
  } catch (err) {
    logger.error(`Failed to get fee config for ${currency}: ${String(err)}`);
    // Return defaults on error
    return {
      currency,
      feePercentage: DEFAULT_FEE_PERCENTAGE,
      minFeeAmount: MINIMUM_FEES[currency] || 0,
      updatedByDiscordId: 'SYSTEM',
      updatedAt: new Date().toISOString(),
    };
  }
}

/**
 * Set fee configuration for a fiat currency
 */
export async function setFiatFeeConfig(
  currency: 'EUR' | 'USD' | 'GBP',
  feePercentage: number,
  minFeeAmount: number,
  adminDiscordId: string
): Promise<FiatFeeConfig> {
  const config = await db.begin(async (sql) => {
    const rows = await sql<FiatFeeConfig[]>`
      UPDATE fiat_fee_config
      SET
        fee_percentage = ${feePercentage},
        min_fee_amount = ${minFeeAmount},
        updated_by_discord_id = ${adminDiscordId},
        updated_at = NOW()
      WHERE currency = ${currency}
      RETURNING 
        currency,
        fee_percentage as "feePercentage",
        min_fee_amount as "minFeeAmount",
        updated_by_discord_id as "updatedByDiscordId",
        updated_at as "updatedAt"
    `;

    if (rows.length === 0) throw new Error(`Currency ${currency} not found`);

    await sql`
      INSERT INTO audit_logs (actor_discord_id, action, entity_type, entity_id, metadata)
      VALUES (
        ${adminDiscordId},
        'FEE_CONFIG_UPDATED',
        'fiat_fee_config',
        ${currency},
        ${JSON.stringify({ currency, feePercentage, minFeeAmount })}::jsonb
      )
    `;

    logger.info(
      { currency, feePercentage, minFeeAmount, adminDiscordId },
      'Fiat fee config updated'
    );

    return rows[0];
  });

  return config;
}

/**
 * Calculate fees for an exchange
 * @param amount Amount the user is sending/receiving in fiat
 * @param paymentMethod Payment method (determines minimum fee)
 * @param fiatCurrency The fiat currency (EUR, USD, GBP)
 * @returns Calculated fee breakdown
 */
export async function calculateExchangeFee(
  amount: number,
  paymentMethod: string,
  fiatCurrency: 'EUR' | 'USD' | 'GBP' = 'USD'
): Promise<FeeCalculationResult> {
  // Get fee config from database (or defaults)
  const feeConfig = await getFiatFeeConfig(fiatCurrency);

  const feePercentage = feeConfig.feePercentage;
  const percentageFee = amount * (feePercentage / 100);

  // Get minimum fee (payment method specific, but fallback to config minimum)
  const methodMinimumFee = MINIMUM_FEES[paymentMethod] || 0;
  const configMinimumFee = feeConfig.minFeeAmount;
  const minimumFee = Math.max(methodMinimumFee, configMinimumFee);

  // Use the higher of percentage fee or minimum fee
  const finalFee = Math.max(percentageFee, minimumFee);
  const finalAmount = amount - finalFee;

  return {
    userAmount: amount,
    feePercentage,
    feeAmount: Math.round(percentageFee * 100) / 100,
    minimumFee,
    finalFee: Math.round(finalFee * 100) / 100,
    finalAmount: Math.round(finalAmount * 100) / 100,
  };
}
