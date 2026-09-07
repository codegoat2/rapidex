/**
 * Unit tests — Financial Ledger
 *
 * Tests pure arithmetic and balance logic without hitting the DB.
 * We test the exported BigInt helpers by re-implementing them inline
 * since they are not exported from ledgerService (internal helpers).
 */

describe('Ledger arithmetic', () => {
  const SCALE = 18n;
  const FACTOR = 10n ** SCALE;

  function toBigInt(s: string): bigint {
    const [intPart, fracPart = ''] = s.split('.');
    const frac = fracPart.padEnd(Number(SCALE), '0').slice(0, Number(SCALE));
    return BigInt(intPart) * FACTOR + BigInt(frac);
  }

  function fromBigInt(n: bigint): string {
    const sign = n < 0n ? '-' : '';
    const abs = n < 0n ? -n : n;
    const intPart = abs / FACTOR;
    const fracPart = (abs % FACTOR).toString().padStart(Number(SCALE), '0');
    const trimmed = fracPart.replace(/0+$/, '') || '0';
    return `${sign}${intPart}.${trimmed}`;
  }

  function add(a: string, b: string): string {
    return fromBigInt(toBigInt(a) + toBigInt(b));
  }

  function sub(a: string, b: string): string {
    return fromBigInt(toBigInt(a) - toBigInt(b));
  }

  test('add: 0.5 + 0.5 = 1.0', () => {
    expect(add('0.5', '0.5')).toBe('1.0');
  });

  test('add: large numbers with 18 decimal precision', () => {
    expect(add('1.000000000000000001', '1.000000000000000001')).toBe('2.000000000000000002');
  });

  test('sub: 1.0 - 0.3 = 0.7', () => {
    expect(sub('1.0', '0.3')).toBe('0.7');
  });

  test('sub: exact zero', () => {
    expect(sub('0.5', '0.5')).toBe('0.0');
  });

  test('sub: would go negative returns negative string', () => {
    const result = sub('0.1', '0.5');
    expect(result.startsWith('-')).toBe(true);
  });

  test('toBigInt: handles integers', () => {
    expect(toBigInt('5')).toBe(5n * FACTOR);
  });

  test('toBigInt: handles zero', () => {
    expect(toBigInt('0')).toBe(0n);
  });

  test('toBigInt/fromBigInt round-trips', () => {
    const values = ['0.00000001', '1.5', '100.123456789012345678', '0'];
    for (const v of values) {
      expect(fromBigInt(toBigInt(v))).toBe(v === '0' ? '0.0' : v);
    }
  });
});

// ---------------------------------------------------------------------------
// State machine unit tests
// ---------------------------------------------------------------------------

import { isTransitionAllowed } from '../../src/engine/tradeService';

describe('Trade state machine', () => {
  const validTransitions: [string, string][] = [
    ['OPEN',            'CLAIMED'],
    ['OPEN',            'CANCELLED'],
    ['OPEN',            'EXPIRED'],
    ['CLAIMED',         'FIAT_PENDING'],
    ['CLAIMED',         'CANCELLED'],
    ['FIAT_PENDING',    'FIAT_SENT'],
    ['FIAT_PENDING',    'CANCELLED'],
    ['FIAT_PENDING',    'EXPIRED'],
    ['FIAT_SENT',       'RELEASE_PENDING'],
    ['FIAT_SENT',       'DISPUTED'],
    ['RELEASE_PENDING', 'CRYPTO_SENT'],
    ['RELEASE_PENDING', 'DISPUTED'],
    ['CRYPTO_SENT',     'COMPLETED'],
    ['CRYPTO_SENT',     'FAILED'],
    ['DISPUTED',        'COMPLETED'],
    ['DISPUTED',        'CANCELLED'],
  ];

  const invalidTransitions: [string, string][] = [
    ['COMPLETED',  'OPEN'],
    ['COMPLETED',  'CLAIMED'],
    ['CANCELLED',  'OPEN'],
    ['EXPIRED',    'CLAIMED'],
    ['OPEN',       'FIAT_SENT'],
    ['OPEN',       'COMPLETED'],
    ['FIAT_SENT',  'OPEN'],
    ['COMPLETED',  'DISPUTED'],
  ];

  test.each(validTransitions)(
    'allows %s → %s',
    (from, to) => {
      expect(isTransitionAllowed(from as never, to as never)).toBe(true);
    },
  );

  test.each(invalidTransitions)(
    'blocks %s → %s',
    (from, to) => {
      expect(isTransitionAllowed(from as never, to as never)).toBe(false);
    },
  );

  test('terminal states have no allowed transitions', () => {
    const terminals = ['COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED'];
    for (const status of terminals) {
      const allStatuses = [
        'OPEN', 'CLAIMED', 'FIAT_PENDING', 'FIAT_SENT',
        'RELEASE_PENDING', 'CRYPTO_SENT', 'COMPLETED',
        'CANCELLED', 'DISPUTED', 'EXPIRED', 'FAILED',
      ];
      for (const to of allStatuses) {
        if (status === 'DISPUTED') continue; // DISPUTED is not truly terminal
        expect(isTransitionAllowed(status as never, to as never)).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Idempotency key unit tests
// ---------------------------------------------------------------------------

import {
  depositKey,
  escrowLockKey,
  escrowReleaseKey,
  withdrawalKey,
  makeIdempotencyKey,
} from '../../src/security/idempotency';

describe('Idempotency keys', () => {
  test('same inputs produce same key', () => {
    expect(depositKey('txabc', 'BTC', 'exchanger1'))
      .toBe(depositKey('txabc', 'BTC', 'exchanger1'));
  });

  test('different txId produces different key', () => {
    expect(depositKey('txabc', 'BTC', 'exchanger1'))
      .not.toBe(depositKey('txdef', 'BTC', 'exchanger1'));
  });

  test('different assets produce different keys', () => {
    expect(depositKey('txabc', 'BTC', 'exchanger1'))
      .not.toBe(depositKey('txabc', 'LTC', 'exchanger1'));
  });

  test('escrowLockKey is deterministic', () => {
    expect(escrowLockKey('trade1', 'ex1')).toBe(escrowLockKey('trade1', 'ex1'));
  });

  test('COMPLETE and CANCEL release keys differ', () => {
    expect(escrowReleaseKey('trade1', 'COMPLETE'))
      .not.toBe(escrowReleaseKey('trade1', 'CANCEL'));
  });

  test('all keys are 64-char hex strings', () => {
    const keys = [
      depositKey('tx', 'BTC', 'ex'),
      escrowLockKey('trade', 'ex'),
      escrowReleaseKey('trade', 'COMPLETE'),
      withdrawalKey('trade', 'tx'),
      makeIdempotencyKey('a', 'b', 'c'),
    ];
    for (const k of keys) {
      expect(k).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});

// ---------------------------------------------------------------------------
// Encryption unit tests
// ---------------------------------------------------------------------------

// Mock the config for encryption tests
jest.mock('../../src/config/env', () => ({
  config: {
    ENCRYPTION_KEY: 'a'.repeat(64), // 64-char hex test key
    NODE_ENV: 'test',
  },
}));

import { encrypt, decrypt } from '../../src/security/encryption';

describe('AES-256-GCM encryption', () => {
  test('encrypt/decrypt round-trip', () => {
    const plaintext = 'test mnemonic phrase here';
    const ciphertext = encrypt(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  test('two encryptions of same plaintext produce different ciphertexts (random IV)', () => {
    const plaintext = 'same text';
    expect(encrypt(plaintext)).not.toBe(encrypt(plaintext));
  });

  test('tampered ciphertext throws', () => {
    const ciphertext = encrypt('hello');
    const [iv, tag, ct] = ciphertext.split(':');
    const tampered = `${iv}:${tag}:${ct?.slice(0, -4)}FFFF`;
    expect(() => decrypt(tampered)).toThrow();
  });

  test('invalid format throws', () => {
    expect(() => decrypt('not:a:valid:format:here')).toThrow();
  });
});
