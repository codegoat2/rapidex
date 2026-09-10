/** RapidEx banner image — shown at the bottom of most public embeds. */
export const BANNER_URL =
  'https://cdn.discordapp.com/attachments/1545857939808587796/1547346475162271755/RapidEx_Banner.png';

/** Brand colors used across all RapidEx embeds. Orange & black theme. */
export const COLORS = {
  PRIMARY:   0xFF6B00 as const,  // RapidEx orange
  SUCCESS:   0xFF8C00 as const,  // Amber orange — positive actions
  WARNING:   0xFFB347 as const,  // Light orange — attention
  ERROR:     0xED4245 as const,  // Red — errors / cancellations
  INFO:      0xFF6B00 as const,  // Orange — informational
  ESCROW:    0xE65C00 as const,  // Deep orange — funds locked
  COMPLETED: 0xFF6B00 as const,  // Orange — completed
  DISPUTED:  0xED4245 as const,  // Red — disputes
} as const;
