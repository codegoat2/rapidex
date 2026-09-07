import { maxDecimal, multiplyDecimal } from '../../src/quote/money';

describe('quote money arithmetic', () => {
  test('multiplies crypto amount by fiat rate without floating point drift', () => {
    expect(multiplyDecimal('0.5', '2000', 18)).toBe('1000.0');
  });

  test('preserves small fractional fiat values', () => {
    expect(multiplyDecimal('0.000001', '25000', 18)).toBe('0.025');
  });

  test('selects the larger fee amount', () => {
    expect(maxDecimal('0.5', '1')).toBe('1');
    expect(maxDecimal('2', '1')).toBe('2');
  });
});