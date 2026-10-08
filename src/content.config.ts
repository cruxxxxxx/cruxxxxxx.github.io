import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { SIZE_PATTERN } from './blog/lib/media.mjs';

// The blog's posts live in its own repo (cruxxxxxx/blog, an Obsidian vault).
// CI checks it out into .blog-content; locally .blog-content is a symlink to
// the vault. BLOG_CONTENT_DIR overrides either.
const BLOG_CONTENT_DIR = process.env.BLOG_CONTENT_DIR ?? './.blog-content';

const posts = defineCollection({
  // Content lives in the vault's `Blogs/` folder, so Obsidian stays the
  // editing surface.
  loader: glob({ pattern: '**/*.md', base: `${BLOG_CONTENT_DIR}/Blogs` }),
  schema: z.object({
    // No title = a quick note: shown inline in the list, like a status update.
    title: z.string().optional(),
    description: z.string().optional(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    // Absolute R2 URL, written by Image Upload Toolkit
    cover: z.string().url().nullish(),
    coverAlt: z.string().default(''),
    // Same vocabulary as `![alt|400]` in the body: `400`, `400x300` or `60%`.
    // The cover skips markdown, so it cannot carry the size in its own link.
    coverWidth: z
      .string()
      .regex(SIZE_PATTERN, 'expected a width like 400, 400x300 or 60%')
      // nullish, not optional: an empty `coverWidth:` in the template is null.
      .nullish(),
  }),
});

export const collections = { posts };
