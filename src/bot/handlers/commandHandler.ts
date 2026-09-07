/**
 * Command handler — routes slash command interactions to the right handler.
 */

import { ChatInputCommandInteraction } from 'discord.js';
import { logger } from '../../utils/logger';
import { execute as executeVerify } from '../commands/verifyExchanger';
import { execute as executeProfile } from '../commands/profile';
import { execute as executeSetupPanel } from '../commands/setupPanel';
import { execute as executeSetupForum } from '../commands/setupForum';
import { execute as executeHelp } from '../commands/help';
import { handleDepositAddresses, handleMyTrades, handleWithdraw, handleSetTerms, handleMyTerms } from '../commands/exchangerCommands';
import {
  handleBalance,
  handleCredit,
  handleDebit,
  handleTrades,
  handleCloseTicket,
  handleSetFee,
  handleAuditLog,
  handleHotWalletBalance,
  handleBan,
} from '../commands/adminCommands';

export async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const { commandName } = interaction;

  try {
    switch (commandName) {
      case 'verify-exchanger':   await executeVerify(interaction);       break;
      case 'profile':            await executeProfile(interaction);      break;
      case 'setup-panel':        await executeSetupPanel(interaction);   break;
      case 'setup-forum':        await executeSetupForum(interaction);   break;
      case 'help':               await executeHelp(interaction);         break;
      case 'my-trades':          await handleMyTrades(interaction);      break;
      case 'deposit-addresses':  await handleDepositAddresses(interaction); break;
      case 'withdraw':            await handleWithdraw(interaction);       break;
      case 'set-terms':          await handleSetTerms(interaction);       break;
      case 'my-terms':           await handleMyTerms(interaction);        break;
      case 'balance':            await handleBalance(interaction);       break;
      case 'credit':             await handleCredit(interaction);        break;
      case 'debit':              await handleDebit(interaction);         break;
      case 'trades':             await handleTrades(interaction);        break;
      case 'close-ticket':       await handleCloseTicket(interaction);   break;
      case 'set-fee':            await handleSetFee(interaction);        break;
      case 'audit-log':          await handleAuditLog(interaction);      break;
      case 'hot-wallet-balance': await handleHotWalletBalance(interaction); break;
      case 'ban':                await handleBan(interaction);           break;
      default:
        logger.warn({ commandName }, 'Unknown command');
        await interaction.reply({ content: '❌ Unknown command.', ephemeral: true });
    }
  } catch (err) {
    logger.error({ err, commandName }, 'Command handler error');
    const msg = '❌ An error occurred. Please try again.';
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: msg, ephemeral: true });
      } else {
        await interaction.reply({ content: msg, ephemeral: true });
      }
    } catch { /* interaction timed out */ }
  }
}
