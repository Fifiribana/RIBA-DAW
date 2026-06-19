/**
 * RIBA User Manual — section content keyed for i18n.
 *
 * Each `id` is the data-testid suffix; the `title`/`bullets`/`tip` translation
 * keys live under `manual.sections.<id>.*` in the locale bundles.
 *
 * Adding a new section :
 *   1. push an entry below
 *   2. add `manual.sections.<id>` keys to ALL locales (fr/en/es/pt/sw.json).
 */
export const MANUAL_SECTIONS = [
  { id: 'philosophy', icon: '🔥', bullets: 7 },
  { id: 'grid',       icon: '🥁', bullets: 6 },
  { id: 'ai',         icon: '✨', bullets: 6 },
  { id: 'collab',     icon: '🌐', bullets: 6 },
  { id: 'virality',   icon: '📡', bullets: 5 },
];
