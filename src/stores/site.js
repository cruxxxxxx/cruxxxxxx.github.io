import { atom } from 'nanostores';

// The header, footer and homepage are separate React islands (the frame
// persists across page changes, the homepage doesn't), so the footer's group
// buttons talk to the homepage through these stores instead of props.

export const ALL_GROUPS = ['projects', 'experiments'];

/** Which footer buttons look selected; the footer updates this instantly. */
export const $activeGroups = atom(ALL_GROUPS);

/** A footer click asking the homepage to switch groups ({ groups }). */
export const $groupRequest = atom(null);

/** True while the homepage's wipe transition runs; the footer waits it out. */
export const $filtering = atom(false);
