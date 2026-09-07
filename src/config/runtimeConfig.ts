/**
 * Runtime configuration — reads Discord role/channel IDs from bot_settings
 * table (managed via dashboard), falling back to env vars if set.
 *
 * Usage:
 *   const roleAdmin = await getRoleAdmin();
 */

import { getSetting } from '../admin/settingsService';
import { config } from './env';

async function getOrFallback(key: string, envFallback: string): Promise<string> {
  const dbVal = await getSetting(key).catch(() => null);
  return dbVal || envFallback || '';
}

export const getRoleAdmin            = () => getOrFallback('ROLE_ADMIN',            config.ROLE_ADMIN);
export const getRoleExchanger        = () => getOrFallback('ROLE_EXCHANGER',        config.ROLE_EXCHANGER);
export const getChannelAdminAlerts   = () => getOrFallback('CHANNEL_ADMIN_ALERTS',  config.CHANNEL_ADMIN_ALERTS);
export const getChannelAnnouncements = () => getOrFallback('CHANNEL_ANNOUNCEMENTS', config.CHANNEL_ANNOUNCEMENTS);
export const getTicketCategory       = () => getOrFallback('TICKET_CATEGORY_ID',    config.TICKET_CATEGORY_ID);
export const getNetwork              = () => getOrFallback('NETWORK',               config.NETWORK);
