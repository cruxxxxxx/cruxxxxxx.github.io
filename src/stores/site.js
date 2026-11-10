import { atom } from 'nanostores';

// The header, footer and homepage are separate React islands (the frame
// persists across page changes, the homepage doesn't), so the footer's group
// buttons talk to the homepage through these stores instead of props.

export const ALL_GROUPS = ['projects', 'experiments'];

/** Which footer buttons look selected; the footer updates this instantly. */
export const $activeGroups = atom(ALL_GROUPS);

/** A footer click asking the homepage to switch groups ({ groups }). */
export const $groupRequest = atom(null);

/**
 * Show these groups on the homepage (the footer's buttons). Takes effect right
 * away, even mid-wipe: the homepage cuts the running wipe short.
 */
export function requestGroups(groups) {
  const ordered = ALL_GROUPS.filter((group) => groups.includes(group));
  if (!isSameGroups($activeGroups.get(), ordered)) {
    $activeGroups.set(ordered);
    $groupRequest.set({ groups: ordered });
  }
}

export function isSameGroups(a, b) {
  return a.length === b.length && a.every((group) => b.includes(group));
}
