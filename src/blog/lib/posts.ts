import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;

/** Drafts render in `astro dev` so you can preview, and are dropped from the build. */
export async function getPublishedPosts(): Promise<Post[]> {
  const posts = await getCollection('posts', ({ data }) =>
    import.meta.env.PROD ? data.draft !== true : true,
  );
  return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

/** ISO-ish, to match the directory-listing look. */
export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Two-digit month and year, e.g. "09 26". */
export function formatMonthYear(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = String(date.getUTCFullYear()).slice(-2);
  return `${month} ${year}`;
}

/** A post without a title is a quick note. */
export function isNote(post: Post): boolean {
  return !post.data.title;
}

/** Day-precise date for notes, month first, e.g. "10 01 26". */
export function formatDayMonthYear(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const year = String(date.getUTCFullYear()).slice(-2);
  return `${month} ${day} ${year}`;
}

/** Plain-text start of a post body, with markdown and HTML stripped. */
export function excerpt(post: Post, maxLength = 60): string {
  const text = (post.body ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;
}

/** What to call a post in a page title, the pager or the feed. */
export function postLabel(post: Post): string {
  return post.data.title ?? (excerpt(post) || formatDayMonthYear(post.data.pubDate));
}
