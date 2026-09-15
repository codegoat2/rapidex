/**
 * Fee Configuration Service
 * Manages fee calculations with hardcoded fee configuration.
 */

// Hardcoded fee configuration for each currency
const FIAT_FEE_CONFIGS: Record<'EUR' | 'USD' | 'GBP', FiatFeeConfig> = {
  EUR: {
    currency: 'EUR',
    feePercentage: 10,
    minFeeAmount: 0,
    updatedByDiscordId: 'SYSTEM',
    updatedAt: new Date().toISOString(),
  },
  USD: {
    currency: 'USD',
    feePercentage: 10,
    minFeeAmount: 0,
    updatedByDiscordId: 'SYSTEM',
    updatedAt: new Date().toISOString(),
  },
  GBP: {
    currency: 'GBP',
    feePercentage: 10,
    minFeeAmount: 0,
    updatedByDiscordId: 'SYSTEM',
    updatedAt: new Date().toISOString(),
  },
};

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
  return FIAT_FEE_CONFIGS[currency];
}

/**
 * Set fee configuration for a fiat currency
 * Note: Not implemented - fees are hardcoded
 */
export async function setFiatFeeConfig(
  currency: 'EUR' | 'USD' | 'GBP',
  feePercentage: number,
  minFeeAmount: number,
  adminDiscordId: string
): Promise<FiatFeeConfig> {
  throw new Error('Cannot update fees - they are hardcoded in the service');
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
