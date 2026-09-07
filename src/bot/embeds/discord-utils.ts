/**
 * discord.js type helpers.
 *
 * discord.js v14's strict types require builders be cast when passed into
 * channel.send(). These helpers make call sites clean without suppressing
 * linting globally.
 */

import type { EmbedBuilder, ActionRowBuilder, AnyComponentBuilder } from 'discord.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function asEmbed(e: EmbedBuilder): any { return e; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function asRow(r: ActionRowBuilder<AnyComponentBuilder>): any { return r; }
