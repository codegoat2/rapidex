/**
 * Role-Based Access Control (RBAC)
 *
 * Discord roles are the surface — every permission check goes through here.
 * All command handlers call requirePermission() before doing anything.
 */

import { GuildMember, CommandInteraction, ButtonInteraction, ModalSubmitInteraction } from 'discord.js';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { db } from '../db/client';

export type Permission =
  | 'TRADE_CREATE'        // any guild member
  | 'TRADE_CLAIM'         // verified exchanger only
  | 'TRADE_RELEASE'       // verified exchanger (own trade)
  | 'TRADE_DISPUTE'       // trade participant
  | 'ADMIN_VERIFY'        // admin: verify exchangers
  | 'ADMIN_BAN'           // admin: ban exchangers
  | 'ADMIN_CREDIT'        // admin: manual credit/debit
  | 'ADMIN_FORCE_ACTION'  // admin: force release/cancel
  | 'ADMIN_VIEW'          // admin: view balances, audit logs
  | 'ADMIN_CONFIG'        // admin: set fees, configure bot
  | 'SETUP_PANEL';        // admin: deploy trade panel

// Permission → required Discord roles
const PERMISSION_ROLES: Record<Permission, 'admin' | 'exchanger' | 'any'> = {
  TRADE_CREATE:       'any',
  TRADE_CLAIM:        'exchanger',
  TRADE_RELEASE:      'exchanger',
  TRADE_DISPUTE:      'any',
  ADMIN_VERIFY:       'admin',
  ADMIN_BAN:          'admin',
  ADMIN_CREDIT:       'admin',
  ADMIN_FORCE_ACTION: 'admin',
  ADMIN_VIEW:         'admin',
  ADMIN_CONFIG:       'admin',
  SETUP_PANEL:        'admin',
};

/**
 * Returns true if the member has the given Discord role.
 */
export function hasRole(member: GuildMember, role: 'admin' | 'exchanger'): boolean {
  if (role === 'admin') return member.roles.cache.has(config.ROLE_ADMIN);
  if (role === 'exchanger') return member.roles.cache.has(config.ROLE_EXCHANGER);
  return false;
}

/**
 * Returns true if the member can perform the action.
 * Admins can always perform exchanger-level actions.
 */
export function canPerform(member: GuildMember, permission: Permission): boolean {
  const required = PERMISSION_ROLES[permission];
  if (required === 'any') return true;
  if (required === 'exchanger') {
    return hasRole(member, 'exchanger') || hasRole(member, 'admin');
  }
  if (required === 'admin') {
    return hasRole(member, 'admin');
  }
  return false;
}

type AnyInteraction = CommandInteraction | ButtonInteraction | ModalSubmitInteraction;

/**
 * Guards an interaction — replies with a denial message and throws if denied.
 * Use at the top of every handler before any business logic.
 *
 * @example
 * await requirePermission(interaction, 'TRADE_CLAIM');
 */
export async function requirePermission(
  interaction: AnyInteraction,
  permission: Permission,
): Promise<void> {
  const member = interaction.member as GuildMember | null;

  if (!member) {
    await safeReply(interaction, '❌ This command can only be used inside the RapidEx server.');
    throw new RbacError('No guild member on interaction', permission);
  }

  if (!canPerform(member, permission)) {
    const required = PERMISSION_ROLES[permission];
    const roleLabel = required === 'admin' ? 'Admin' : required === 'exchanger' ? 'Verified Exchanger' : '';
    logger.warn(
      { discordId: member.id, permission },
      'RBAC: access denied',
    );
    await safeReply(
      interaction,
      `❌ You don't have permission to do that.\nRequired role: **${roleLabel}**`,
    );
    throw new RbacError(`User ${member.id} lacks permission ${permission}`, permission);
  }
}

/**
 * Verifies the exchanger is not banned before allowing them to act.
 * Call this after requirePermission('TRADE_CLAIM') etc.
 */
export async function requireActiveExchanger(
  interaction: AnyInteraction,
  discordId: string,
): Promise<void> {
  const rows = await db<{ is_banned: boolean; is_active: boolean }[]>`
    SELECT is_banned, is_active FROM exchangers WHERE discord_id = ${discordId}
  `;

  if (rows.length === 0) {
    await safeReply(interaction, '❌ You are not registered as a verified exchanger.');
    throw new RbacError(`Exchanger ${discordId} not found`, 'TRADE_CLAIM');
  }

  const ex = rows[0];
  if (ex.is_banned || !ex.is_active) {
    await safeReply(interaction, '❌ Your exchanger account is suspended. Contact an admin.');
    throw new RbacError(`Exchanger ${discordId} is banned/inactive`, 'TRADE_CLAIM');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function safeReply(interaction: AnyInteraction, content: string): Promise<void> {
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content, ephemeral: true });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
  } catch {
    // Ignore — interaction may have timed out
  }
}

export class RbacError extends Error {
  constructor(
    message: string,
    public readonly permission: Permission,
  ) {
    super(message);
    this.name = 'RbacError';
  }
}
