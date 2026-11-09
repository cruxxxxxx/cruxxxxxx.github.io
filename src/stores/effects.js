import { atom } from 'nanostores';
import Effects from '../data/effects.json';

// The cards' ambient static and "new" badge settings. The site reads them from
// effects.json; the project editor (dev only) swaps in unsaved values here so
// its effects panel previews live.

export const $effects = atom(Effects);

/** Editor preview: show the "new" badge on every card, not just isNew ones. */
export const $badgeOnEveryCard = atom(false);

/** Editor preview: each bump flashes the static on every closed card on screen. */
export const $flashStaticNow = atom(0);
