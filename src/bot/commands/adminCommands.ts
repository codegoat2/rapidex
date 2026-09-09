/**
 * Admin Dashboard Commands
 *
 * /balance @exchanger
 * /credit @exchanger <asset> <amount>
 * /debit @exchanger <asset> <amount>
 * /trades [status]
 * /close-ticket <trade_id>
 * /set-fee <asset> <percentage>
 * /audit-log [user]
 * /hot-wallet-balance
 * /ban @user <reason>
 *
 * All write commands produce audit_log entries.
 * All require ADMIN role via requirePermission().
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  TextChannel,
} from 'discord.js';
import { requirePermission } from '../../security/rbac';
import { getExchangerByDiscordId, banExchanger, reactivateExchanger } from '../../admin/exchangerService';
import {
  getBalance,
  adminCredit,
  adminDebit,
  getAllBalances,
} from '../../ledger/ledgerService';
import { manualAdjustmentKey } from '../../security/idempotency';
import { getTradesByStatus, getTradeById } from '../../engine/tradeService';
import { COLORS } from '../embeds/colors';
import { db } from '../../db/client';
import { logger } from '../../utils/logger';
import type { Asset, TradeStatus } from '../../types';

const ASSETS: Asset[] = ['BTC', 'LTC', 'ETH', 'SOL', 'BNB', 'USDT_BEP20'];

// ---------------------------------------------------------------------------
// Command definitions
// ---------------------------------------------------------------------------

export const balanceCommand = new SlashCommandBuilder()
  .setName('balance')
  .setDescription('View an exchanger\'s balance (admin)')
  .addUserOption(o => o.setName('user').setDescription('Exchanger').setRequired(true))
  .setDefaultMemberPermissions(0);

export const creditCommand = new SlashCommandBuilder()
  .setName('credit')
  .setDescription('Manually credit an exchanger (admin)')
  .addUserOption(o => o.setName('user').setDescription('Exchanger').setRequired(true))
  .addStringOption(o => o.setName('asset').setDescription('Asset').setRequired(true).addChoices(
    ...ASSETS.map(a => ({ name: a, value: a }))
  ))
  .addStringOption(o => o.setName('amount').setDescription('Amount').setRequired(true))
  .addStringOption(o => o.setName('reason').setDescription('Reason for credit').setRequired(true))
  .setDefaultMemberPermissions(0);

export const debitCommand = new SlashCommandBuilder()
  .setName('debit')
  .setDescription('Manually debit an exchanger (admin)')
  .addUserOption(o => o.setName('user').setDescription('Exchanger').setRequired(true))
  .addStringOption(o => o.setName('asset').setDescription('Asset').setRequired(true).addChoices(
    ...ASSETS.map(a => ({ name: a, value: a }))
  ))
  .addStringOption(o => o.setName('amount').setDescription('Amount').setRequired(true))
  .addStringOption(o => o.setName('reason').setDescription('Reason for debit').setRequired(true))
  .setDefaultMemberPermissions(0);

export const tradesCommand = new SlashCommandBuilder()
  .setName('trades')
  .setDescription('List trades by status (admin)')
  .addStringOption(o => o.setName('status').setDescription('Filter by status').setRequired(false).addChoices(
    { name: 'OPEN', value: 'OPEN' },
    { name: 'CLAIMED', value: 'CLAIMED' },
    { name: 'FIAT_PENDING', value: 'FIAT_PENDING' },
    { name: 'FIAT_SENT', value: 'FIAT_SENT' },
    { name: 'DISPUTED', value: 'DISPUTED' },
    { name: 'COMPLETED', value: 'COMPLETED' },
    { name: 'CANCELLED', value: 'CANCELLED' },
    { name: 'EXPIRED', value: 'EXPIRED' },
  ))
  .setDefaultMemberPermissions(0);

export const closeTicketCommand = new SlashCommandBuilder()
  .setName('close-ticket')
  .setDescription('Force-close a ticket channel (admin)')
  .addStringOption(o => o.setName('trade_id').setDescription('Trade UUID').setRequired(true))
  .setDefaultMemberPermissions(0);

export const setFeeCommand = new SlashCommandBuilder()
  .setName('set-fee')
  .setDescription('Set fee percentage for an asset (admin)')
  .addStringOption(o => o.setName('asset').setDescription('Asset').setRequired(true).addChoices(
    ...ASSETS.map(a => ({ name: a, value: a }))
  ))
  .addStringOption(o => o.setName('percentage').setDescription('Fee % e.g. 0.5').setRequired(true))
  .setDefaultMemberPermissions(0);

export const auditLogCommand = new SlashCommandBuilder()
  .setName('audit-log')
  .setDescription('View audit log (admin)')
  .addUserOption(o => o.setName('user').setDescription('Filter by user').setRequired(false))
  .setDefaultMemberPermissions(0);

export const hotWalletCommand = new SlashCommandBuilder()
  .setName('hot-wallet-balance')
  .setDescription('View hot wallet balances (admin)')
  .setDefaultMemberPermissions(0);

export const banCommand = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Ban an exchanger (admin)')
  .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
  .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true))
  .setDefaultMemberPermissions(0);

export const unbanCommand = new SlashCommandBuilder()
  .setName('unban')
  .setDescription('Unban / reactivate a banned exchanger (admin)')
  .addUserOption(o => o.setName('user').setDescription('User to unban').setRequired(true))
  .setDefaultMemberPermissions(0);

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function handleBalance(interaction: ChatInputCommandInteraction): Promise<void> {
  await requirePermission(interaction, 'ADMIN_VIEW');
  await interaction.deferReply({ ephemeral: true });

  const target   = interaction.options.getUser('user', true);
  const exchanger = await getExchangerByDiscordId(target.id);
  if (!exchanger) { await interaction.editReply('❌ No exchanger record found.'); return; }

  const balances = await getAllBalances(exchanger.id);
  const lines = Object.values(balances)
    .map(b => `**${b.asset}**\nAvailable: \`${parseFloat(b.available).toFixed(8)}\`  |  Escrow: \`${parseFloat(b.escrow).toFixed(8)}\`  |  Total: \`${parseFloat(b.total).toFixed(8)}\``)
    .join('\n\n');

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setTitle(`<:DebtCard:1547332209684381756> Balance — ${exchanger.discord_username}`)
        .setDescription(lines || '_No balances_')
        .setTimestamp(),
    ],
  });
}

export async function handleCredit(interaction: ChatInputCommandInteraction): Promise<void> {
  await requirePermission(interaction, 'ADMIN_CREDIT');
  await interaction.deferReply({ ephemeral: true });

  const target   = interaction.options.getUser('user', true);
  const asset    = interaction.options.getString('asset', true) as Asset;
  const amount   = interaction.options.getString('amount', true);
  const reason   = interaction.options.getString('reason', true);

  if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    await interaction.editReply('❌ Amount must be a positive number.'); return;
  }

  const exchanger = await getExchangerByDiscordId(target.id);
  if (!exchanger) { await interaction.editReply('❌ Exchanger not found.'); return; }

  const key = manualAdjustmentKey(exchanger.id, 'MANUAL_CREDIT', interaction.user.id, Date.now());
  await adminCredit({
    exchangerId: exchanger.id, asset, amount,
    reference: `Admin credit by ${interaction.user.username}: ${reason}`,
    idempotencyKey: key,
  });

  await db`
    INSERT INTO audit_logs (actor_discord_id, target_discord_id, action, entity_type, entity_id, metadata)
    VALUES (${interaction.user.id}, ${target.id}, 'MANUAL_CREDIT', 'exchanger', ${exchanger.id},
      ${JSON.stringify({ asset, amount, reason })}::jsonb)
  `;

  const bal = await getBalance(exchanger.id, asset);
  await interaction.editReply({
    embeds: [
      new EmbedBuilder().setColor(COLORS.SUCCESS)
        .setTitle('<:GreenCheckmark:1547332810048667659> Credit Applied')
        .addFields(
          { name: 'User',      value: `<@${target.id}>`,                    inline: true },
          { name: 'Asset',     value: asset,                                 inline: true },
          { name: 'Amount',    value: parseFloat(amount).toFixed(8),         inline: true },
          { name: 'New Balance', value: parseFloat(bal.available).toFixed(8), inline: true },
          { name: 'Reason',    value: reason,                                inline: false },
        ).setTimestamp(),
    ],
  });
}

export async function handleDebit(interaction: ChatInputCommandInteraction): Promise<void> {
  await requirePermission(interaction, 'ADMIN_CREDIT');
  await interaction.deferReply({ ephemeral: true });

  const target   = interaction.options.getUser('user', true);
  const asset    = interaction.options.getString('asset', true) as Asset;
  const amount   = interaction.options.getString('amount', true);
  const reason   = interaction.options.getString('reason', true);

  if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    await interaction.editReply('❌ Amount must be a positive number.'); return;
  }

  const exchanger = await getExchangerByDiscordId(target.id);
  if (!exchanger) { await interaction.editReply('❌ Exchanger not found.'); return; }

  try {
    const key = manualAdjustmentKey(exchanger.id, 'MANUAL_DEBIT', interaction.user.id, Date.now());
    await adminDebit({
      exchangerId: exchanger.id, asset, amount,
      reference: `Admin debit by ${interaction.user.username}: ${reason}`,
      idempotencyKey: key,
    });
  } catch (err) {
    await interaction.editReply(`❌ ${err instanceof Error ? err.message : 'Debit failed'}`);
    return;
  }

  await db`
    INSERT INTO audit_logs (actor_discord_id, target_discord_id, action, entity_type, entity_id, metadata)
    VALUES (${interaction.user.id}, ${target.id}, 'MANUAL_DEBIT', 'exchanger', ${exchanger.id},
      ${JSON.stringify({ asset, amount, reason })}::jsonb)
  `;

  const bal = await getBalance(exchanger.id, asset);
  await interaction.editReply({
    embeds: [
      new EmbedBuilder().setColor(COLORS.WARNING)
        .setTitle('<:emojigg_no:1547332976201830441> Debit Applied')
        .addFields(
          { name: 'User',        value: `<@${target.id}>`,                    inline: true },
          { name: 'Asset',       value: asset,                                 inline: true },
          { name: 'Amount',      value: parseFloat(amount).toFixed(8),         inline: true },
          { name: 'New Balance', value: parseFloat(bal.available).toFixed(8),  inline: true },
          { name: 'Reason',      value: reason,                                inline: false },
        ).setTimestamp(),
    ],
  });
}

export async function handleTrades(interaction: ChatInputCommandInteraction): Promise<void> {
  await requirePermission(interaction, 'ADMIN_VIEW');
  await interaction.deferReply({ ephemeral: true });

  const status = (interaction.options.getString('status') ?? 'OPEN') as TradeStatus;
  const trades = await getTradesByStatus(status, 20);

  if (trades.length === 0) {
    await interaction.editReply(`No trades with status **${status}**.`); return;
  }

  const lines = trades.map(t => {
    const FIAT_SYM: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' };
    const sym      = FIAT_SYM[t.fiat_currency] ?? t.fiat_currency;
    const fiatPart = t.fiat_amount ? ` · ${sym}${parseFloat(t.fiat_amount).toFixed(2)}` : '';
    const time     = `<t:${Math.floor(new Date(t.created_at).getTime() / 1000)}:R>`;
    return `\`${t.id.slice(0, 8)}\` **${t.asset}** \`${parseFloat(t.amount).toFixed(6)}\`${fiatPart} | <@${t.user_discord_id}> | ${time}`;
  }).join('\n');

  await interaction.editReply({
    embeds: [
      new EmbedBuilder().setColor(COLORS.INFO)
        .setTitle(`<:Arrow:1547330759571017768> Trades — ${status} (${trades.length})`)
        .setDescription(lines)
        .setTimestamp(),
    ],
  });
}

export async function handleCloseTicket(interaction: ChatInputCommandInteraction): Promise<void> {
  await requirePermission(interaction, 'ADMIN_VIEW');
  await interaction.deferReply({ ephemeral: true });

  const tradeId = interaction.options.getString('trade_id', true);
  const trade   = await getTradeById(tradeId);
  if (!trade) { await interaction.editReply('❌ Trade not found.'); return; }

  try {
    const channel = interaction.guild?.channels.cache.get(trade.ticket_channel_id) as TextChannel | undefined;
    if (channel) {
      await channel.send({
        embeds: [
          new EmbedBuilder().setColor(COLORS.ERROR)
            .setTitle('<:lock:1547331951877165128> Ticket Closed by Admin')
            .setDescription(`Closed by <@${interaction.user.id}>`)
            .setTimestamp(),
        ],
      });
      await channel.delete('Admin closed ticket');
    }
    await interaction.editReply('✅ Ticket channel deleted.');
  } catch (err) {
    await interaction.editReply(`❌ Failed to close ticket: ${String(err)}`);
  }
}

export async function handleSetFee(interaction: ChatInputCommandInteraction): Promise<void> {
  await requirePermission(interaction, 'ADMIN_CONFIG');
  await interaction.deferReply({ ephemeral: true });

  const asset      = interaction.options.getString('asset', true) as Asset;
  const percentage = interaction.options.getString('percentage', true);
  const pct        = parseFloat(percentage);

  if (isNaN(pct) || pct < 0 || pct > 100) {
    await interaction.editReply('❌ Percentage must be between 0 and 100.'); return;
  }

  await db`
    UPDATE fee_config
    SET fee_percentage = ${pct}, updated_by_discord_id = ${interaction.user.id}, updated_at = NOW()
    WHERE asset = ${asset}
  `;

  await db`
    INSERT INTO audit_logs (actor_discord_id, action, entity_type, metadata)
    VALUES (${interaction.user.id}, 'FEE_CONFIG_UPDATED', 'fee_config',
      ${JSON.stringify({ asset, percentage: pct })}::jsonb)
  `;

  await interaction.editReply({
    embeds: [
      new EmbedBuilder().setColor(COLORS.SUCCESS)
        .setTitle('<:GreenCheckmark:1547332810048667659> Fee Updated')
        .addFields(
          { name: 'Asset', value: asset, inline: true },
          { name: 'New Fee', value: `${pct}%`, inline: true },
        ).setTimestamp(),
    ],
  });
}

export async function handleAuditLog(interaction: ChatInputCommandInteraction): Promise<void> {
  await requirePermission(interaction, 'ADMIN_VIEW');
  await interaction.deferReply({ ephemeral: true });

  const target = interaction.options.getUser('user');

  const rows = target
    ? await db<{ action: string; entity_type: string | null; entity_id: string | null; metadata: Record<string, unknown> | null; created_at: Date }[]>`
        SELECT action, entity_type, entity_id, metadata, created_at
        FROM audit_logs
        WHERE actor_discord_id = ${target.id} OR target_discord_id = ${target.id}
        ORDER BY created_at DESC LIMIT 15
      `
    : await db<{ action: string; actor_discord_id: string; entity_type: string | null; entity_id: string | null; created_at: Date }[]>`
        SELECT action, actor_discord_id, entity_type, entity_id, created_at
        FROM audit_logs ORDER BY created_at DESC LIMIT 15
      `;

  const lines = rows.map((r) => {
    const time = `<t:${Math.floor(new Date(r.created_at).getTime() / 1000)}:R>`;
    const actor = 'actor_discord_id' in r ? ` by <@${r.actor_discord_id}>` : '';
    return `${time} **${r.action}**${actor} — ${r.entity_type ?? ''} \`${r.entity_id?.slice(0, 8) ?? ''}\``;
  }).join('\n');

  await interaction.editReply({
    embeds: [
      new EmbedBuilder().setColor(COLORS.INFO)
        .setTitle(`<:Arrow:1547330759571017768> Audit Log${target ? ` — @${target.username}` : ' (Recent)'}`)
        .setDescription(lines || '_No entries_')
        .setTimestamp(),
    ],
  });
}

export async function handleHotWalletBalance(interaction: ChatInputCommandInteraction): Promise<void> {
  await requirePermission(interaction, 'ADMIN_VIEW');
  await interaction.deferReply({ ephemeral: true });

  const rows = await db<{ asset: string; balance: string; address: string; last_checked_at: Date }[]>`
    SELECT asset, balance, address, last_checked_at FROM hot_wallet_balances ORDER BY asset
  `;

  const { config } = await import('../../config/env');
  const thresholds: Record<string, number> = {
    BTC: config.MIN_HOT_WALLET_BTC,
    LTC: config.MIN_HOT_WALLET_LTC,
    ETH: config.MIN_HOT_WALLET_ETH,
    SOL: config.MIN_HOT_WALLET_SOL,
    BNB: config.MIN_HOT_WALLET_BNB,
  };

  const lines = rows.map(r => {
    const bal   = parseFloat(r.balance);
    const min   = thresholds[r.asset];
    const warn  = min !== undefined && bal < min ? ' <:emojigg_no:1547332976201830441> LOW' : '';
    return `**${r.asset}**${warn}\n\`${bal.toFixed(8)}\` — \`${r.address.slice(0, 20)}...\``;
  }).join('\n\n') || '_No hot wallet data_';

  await interaction.editReply({
    embeds: [
      new EmbedBuilder().setColor(COLORS.INFO)
        .setTitle('<:DebtCard:1547332209684381756> Hot Wallet Balances')
        .setDescription(lines)
        .setTimestamp(),
    ],
  });
}

export async function handleBan(interaction: ChatInputCommandInteraction): Promise<void> {
  await requirePermission(interaction, 'ADMIN_BAN');
  await interaction.deferReply({ ephemeral: true });

  const target = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason', true);

  try {
    await banExchanger({
      targetDiscordId: target.id,
      adminDiscordId:  interaction.user.id,
      reason,
    });

    // Revoke exchanger role
    try {
      const { config: cfg } = await import('../../config/env');
      const member = await interaction.guild?.members.fetch(target.id);
      if (member) await member.roles.remove(cfg.ROLE_EXCHANGER);
    } catch { /* non-fatal */ }

    await interaction.editReply({
      embeds: [
        new EmbedBuilder().setColor(COLORS.ERROR)
          .setTitle('<:emojigg_no:1547332976201830441> Exchanger Banned')
          .addFields(
            { name: 'User',   value: `<@${target.id}>`, inline: true },
            { name: 'Reason', value: reason,             inline: false },
          ).setTimestamp(),
      ],
    });
  } catch (err) {
    await interaction.editReply(`❌ ${err instanceof Error ? err.message : 'Ban failed'}`);
  }
}

export async function handleUnban(interaction: ChatInputCommandInteraction): Promise<void> {
  await requirePermission(interaction, 'ADMIN_BAN');
  await interaction.deferReply({ ephemeral: true });

  const target = interaction.options.getUser('user', true);

  try {
    const exchanger = await getExchangerByDiscordId(target.id);
    if (!exchanger) {
      await interaction.editReply('❌ No exchanger record found for that user.');
      return;
    }

    await reactivateExchanger({
      exchangerId:    exchanger.id,
      adminDiscordId: interaction.user.id,
    });

    // Restore exchanger role
    try {
      const { getRoleExchanger } = await import('../../config/runtimeConfig');
      const roleId = await getRoleExchanger();
      const member = await interaction.guild?.members.fetch(target.id);
      if (member && roleId) await member.roles.add(roleId);
    } catch { /* non-fatal */ }

    await interaction.editReply({
      embeds: [
        new EmbedBuilder().setColor(COLORS.SUCCESS)
          .setTitle('<:GreenCheckmark:1547332810048667659> Exchanger Unbanned')
          .addFields(
            { name: 'User',   value: `<@${target.id}>`,                    inline: true },
            { name: 'Status', value: 'Reactivated — can claim trades again', inline: true },
          ).setTimestamp(),
      ],
    });
  } catch (err) {
    await interaction.editReply(`❌ ${err instanceof Error ? err.message : 'Unban failed'}`);
  }
}

// Re-export all command data for the command registration loop
export const allAdminCommandData = [
  balanceCommand,
  creditCommand,
  debitCommand,
  tradesCommand,
  closeTicketCommand,
  setFeeCommand,
  auditLogCommand,
  hotWalletCommand,
  banCommand,
  unbanCommand,
];
