/**
 * Unit tests — Security layer (RBAC, rate limiting)
 */

jest.mock('../../src/config/env', () => ({
  config: {
    ROLE_ADMIN:     'admin-role-id',
    ROLE_EXCHANGER: 'exchanger-role-id',
    RATE_LIMIT_TICKET_PER_USER_PER_HOUR:    3,
    RATE_LIMIT_COMMANDS_PER_USER_PER_MINUTE: 5,
    NODE_ENV: 'test',
    ENCRYPTION_KEY: 'a'.repeat(64),
  },
}));

// Mock DB for RBAC active exchanger check
jest.mock('../../src/db/client', () => ({
  db: jest.fn(),
}));

import { canPerform, hasRole } from '../../src/security/rbac';
import {
  checkTicketRateLimit,
  checkCommandRateLimit,
} from '../../src/security/rateLimiter';
import type { GuildMember } from 'discord.js';

// ---------------------------------------------------------------------------
// RBAC
// ---------------------------------------------------------------------------

function makeMember(roleIds: string[]): GuildMember {
  return {
    roles: {
      cache: {
        has: (id: string) => roleIds.includes(id),
      },
    },
  } as unknown as GuildMember;
}

describe('RBAC canPerform', () => {
  const adminMember    = makeMember(['admin-role-id']);
  const exchangerMember = makeMember(['exchanger-role-id']);
  const regularMember  = makeMember([]);

  test('any member can TRADE_CREATE', () => {
    expect(canPerform(regularMember,  'TRADE_CREATE')).toBe(true);
    expect(canPerform(exchangerMember,'TRADE_CREATE')).toBe(true);
    expect(canPerform(adminMember,    'TRADE_CREATE')).toBe(true);
  });

  test('only exchangers and admins can TRADE_CLAIM', () => {
    expect(canPerform(regularMember,  'TRADE_CLAIM')).toBe(false);
    expect(canPerform(exchangerMember,'TRADE_CLAIM')).toBe(true);
    expect(canPerform(adminMember,    'TRADE_CLAIM')).toBe(true);
  });

  test('only admins can ADMIN_VERIFY', () => {
    expect(canPerform(regularMember,  'ADMIN_VERIFY')).toBe(false);
    expect(canPerform(exchangerMember,'ADMIN_VERIFY')).toBe(false);
    expect(canPerform(adminMember,    'ADMIN_VERIFY')).toBe(true);
  });

  test('only admins can ADMIN_FORCE_ACTION', () => {
    expect(canPerform(regularMember,  'ADMIN_FORCE_ACTION')).toBe(false);
    expect(canPerform(exchangerMember,'ADMIN_FORCE_ACTION')).toBe(false);
    expect(canPerform(adminMember,    'ADMIN_FORCE_ACTION')).toBe(true);
  });

  test('hasRole works correctly', () => {
    expect(hasRole(adminMember,    'admin')).toBe(true);
    expect(hasRole(adminMember,    'exchanger')).toBe(false);
    expect(hasRole(exchangerMember,'exchanger')).toBe(true);
    expect(hasRole(exchangerMember,'admin')).toBe(false);
    expect(hasRole(regularMember,  'admin')).toBe(false);
    expect(hasRole(regularMember,  'exchanger')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

describe('Rate limiter', () => {
  // Use unique user IDs per test so limits don't bleed across tests
  const uid = () => `test-user-${Math.random().toString(36).slice(2)}`;

  test('allows up to the ticket limit', () => {
    const user = uid();
    expect(checkTicketRateLimit(user)).toBe(true);
    expect(checkTicketRateLimit(user)).toBe(true);
    expect(checkTicketRateLimit(user)).toBe(true);
    // 4th attempt should be blocked
    expect(checkTicketRateLimit(user)).toBe(false);
  });

  test('allows up to the command limit', () => {
    const user = uid();
    for (let i = 0; i < 5; i++) {
      expect(checkCommandRateLimit(user)).toBe(true);
    }
    expect(checkCommandRateLimit(user)).toBe(false);
  });

  test('different users have independent limits', () => {
    const u1 = uid();
    const u2 = uid();
    // Exhaust u1
    for (let i = 0; i < 3; i++) checkTicketRateLimit(u1);
    expect(checkTicketRateLimit(u1)).toBe(false);
    // u2 is unaffected
    expect(checkTicketRateLimit(u2)).toBe(true);
  });
});
