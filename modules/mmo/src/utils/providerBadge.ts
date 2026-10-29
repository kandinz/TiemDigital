// Full class strings are required so Tailwind can see them; D1 stores only the palette key.
export const BADGE_PALETTE = {
  indigo: { badge: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30', solid: 'bg-indigo-500' },
  blue: { badge: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30', solid: 'bg-blue-500' },
  teal: { badge: 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30', solid: 'bg-teal-500' },
  amber: { badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30', solid: 'bg-amber-500' },
  purple: { badge: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30', solid: 'bg-purple-500' },
  rose: { badge: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30', solid: 'bg-rose-500' },
  sky: { badge: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30', solid: 'bg-sky-500' },
  emerald: { badge: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30', solid: 'bg-emerald-500' },
  orange: { badge: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30', solid: 'bg-orange-500' },
  cyan: { badge: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30', solid: 'bg-cyan-500' },
  slate: { badge: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30', solid: 'bg-slate-500' },
} as const;

export type BadgeColor = keyof typeof BADGE_PALETTE;

// Colors an admin can pick; slate is the neutral fallback only.
export const SELECTABLE_BADGE_COLORS = (Object.keys(BADGE_PALETTE) as BadgeColor[]).filter((c) => c !== 'slate');

export function badgeStyle(color?: string | null) {
  return BADGE_PALETTE[color as BadgeColor] ?? BADGE_PALETTE.slate;
}
