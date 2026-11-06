import { atom } from 'nanostores';

// Shared between the project editor panel and the homepage (separate islands).
// Only the editor writes these, and the editor only exists in `astro dev`.

/**
 * The project being edited, shown live on the homepage in place of the saved
 * one: { originalName (null for a new project), project }.
 */
export const $editorDraft = atom(null);

/** Which look of the edited card to show: 'closed' | 'hover' | 'open'. */
export const $editorPreview = atom('closed');

/**
 * Order changes saved since the page loaded, so the homepage reorders without
 * a reload: { [name]: { year, yearOrder } } (see projectComparator).
 */
export const $editorOrder = atom({});
