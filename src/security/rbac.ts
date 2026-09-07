/**
 * Role-Based Access Control (RBAC)
 *
 * Role IDs are read from bot_settings at runtime so they can be changed
 * in the dashboard without redeploying.
 */

import { GuildMember, CommandInteraction, ButtonInteraction, ModalSubmitInteraction } from 'discord.js';
import { getRoleAdmin, getRoleExchanger } from '../config/runtimeConfig';
import { logger } from '../utils/logger';
import { db } from '../db/client';

export type Permission =
  | 'TRADE_CREATE'
  | 'TRADE_CLAIM'
  | 'TRADE_RELEASE'
  | 'TRADE_DISPUTE'
  | 'ADMIN_VERIFY'
  | 'ADMIN_BAN'
  | 'ADMIN_CREDIT'
  | 'ADMIN_FORCE_ACTION'
  | 'ADMIN_VIEW'
  | 'ADMIN_CONFIG'
  | 'SETUP_PANEL';

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

export async function hasRole(member: GuildMember, role: 'admin' | 'exchanger'): Promise<boolean> {
  if (role === 'admin') {
    const id = await getRoleAdmin();
    if (!id) return false;
    return member.roles.cache.has(id);
  }
  if (role === 'exchanger') {
    const id = await getRoleExchanger();
    if (!id) return false;
    return member.roles.cache.has(id);
  }
  return false;
}

export async function canPerform(member: GuildMember, permission: Permission): Promise<boolean> {
  const required = PERMISSION_ROLES[permission];
  if (required === 'any') return true;
  if (required === 'exchanger') {
    return (await hasRole(member, 'exchanger')) || (await hasRole(member, 'admin'));
  }
  if (required === 'admin') {
    return hasRole(member, 'admin');
  }
  return false;
}

type AnyInteraction = CommandInteraction | ButtonInteraction | ModalSubmitInteraction;

export async function requirePermission(
  interaction: AnyInteraction,
  permission: Permission,
): Promise<void> {
  const member = interaction.member as GuildMember | null;

  if (!member) {
    await safeReply(interaction, '❌ This command can only be used inside the RapidEx server.');
    throw new RbacError('No guild member', permission);
  }

  if (!(await canPerform(member, permission))) {
    const required  = PERMISSION_ROLES[permission];
    const roleLabel = required === 'admin' ? 'Admin' : required === 'exchanger' ? 'Verified Exchanger' : '';
    logger.warn({ discordId: member.id, permission }, 'RBAC: access denied');
    await safeReply(interaction, `❌ You don't have permission to do that.\nRequired role: **${roleLabel}**`);
    throw new RbacError(`User ${member.id} lacks ${permission}`, permission);
  }
}

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

async function safeReply(interaction: AnyInteraction, content: string): Promise<void> {
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content, ephemeral: true });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
  } catch { /* timed out */ }
}

export class RbacError extends Error {
  constructor(message: string, public readonly permission: Permission) {
    super(message);
    this.name = 'RbacError';
  }
}
