/**
 * Sätteri hast plugin.
 *
 * Markdown images arrive as bare <img> tags — they point at R2, so Astro's
 * image pipeline never sees them. Add lazy-loading and async decoding so a
 * photo-heavy post does not fetch every frame at once.
 *
 * Videos arrive as plain links: Attachment Uploader writes `[clip.mp4](url)`
 * because .mp4 is not an image extension. Swap those for a <video> element.
 * bin/r2-media.sh uploads a poster frame beside every clip under the same
 * name, so the poster URL is derived rather than written into the note.
 *
 * Sizes follow Obsidian's own syntax, so a note previews the way it renders:
 * `![alt|400](url)` is 400px wide, `![alt|400x300]` is both, and `![alt|60%]`
 * is a share of the column — that last one is ours, Obsidian ignores it.
 * Without a size, media fills the column.
 *
 * Every photo and video also gets width/height from the file itself (a video
 * from its poster), measured at build time, so the page holds their space
 * before they load (see media-size.mjs). `data-sized` marks the ones whose
 * note asked for a size, which the stylesheet leaves at that size.
 */
import { takeSize, isVideoUrl, posterUrlFor } from './media.mjs';
import { mediaProperties } from './media-size.mjs';

async function applySize(node, ctx, src, size) {
  for (const [key, value] of Object.entries(await mediaProperties(src, size))) {
    ctx.setProperty(node, key, value);
  }
}

async function videoElement(src, size) {
  return {
    type: 'element',
    tagName: 'video',
    properties: {
      src,
      poster: posterUrlFor(src),
      controls: true,
      playsInline: true,
      // The poster carries the preview; bytes only move once someone hits play.
      preload: 'none',
      ...(await mediaProperties(posterUrlFor(src), size)),
    },
    children: [],
  };
}

export default {
  name: 'img-attrs',
  element: [
    {
      filter: ['img'],
      async visit(node, ctx) {
        const { label, size } = takeSize(node.properties?.alt);
        if (isVideoUrl(node.properties?.src)) {
          ctx.replaceNode(node, await videoElement(node.properties.src, size));
          return;
        }
        if (size) {
          ctx.setProperty(node, 'alt', label);
        }
        await applySize(node, ctx, node.properties?.src, size);
        if (!node.properties?.loading) {
          ctx.setProperty(node, 'loading', 'lazy');
        }
        if (!node.properties?.decoding) {
          ctx.setProperty(node, 'decoding', 'async');
        }
      },
    },
    {
      filter: ['a'],
      async visit(node, ctx) {
        if (isVideoUrl(node.properties?.href)) {
          const { size } = takeSize(ctx.textContent(node));
          ctx.replaceNode(node, await videoElement(node.properties.href, size));
        }
      },
    },
  ],
};
