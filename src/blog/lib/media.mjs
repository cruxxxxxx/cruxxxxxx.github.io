/**
 * Shared media helpers.
 *
 * Used by the markdown pipeline (`src/lib/img-attrs-plugin.mjs`, where sizes
 * arrive as `![alt|400](url)`) and by the layouts, where the cover never passes
 * through markdown at all and carries its size in `coverWidth`.
 *
 * `400` is a pixel width, `400x300` is both dimensions, `60%` is a share of the
 * column. Only the first two are Obsidian's; the percentage is ours.
 */
export const SIZE_PATTERN = /^(?:\d+(?:\.\d+)?%|\d+(?:x\d+)?)$/;

const SIZE_SUFFIX = /\|\s*(\d+(?:\.\d+)?%|\d+(?:x\d+)?)\s*$/;
const VIDEO_URL = /\.(mp4|webm|mov|m4v)$/i;

/** Split `alt|400` into the alt text and the size that followed the pipe. */
export function takeSize(label) {
  const match = SIZE_SUFFIX.exec(label ?? '');
  if (!match) {
    return { label: label ?? '', size: null };
  }
  return { label: label.slice(0, match.index).trim(), size: match[1] };
}

/** `height: auto` in the stylesheet keeps the aspect ratio from one dimension. */
export function sizeProperties(size) {
  if (!size) {
    return {};
  }
  if (size.endsWith('%')) {
    return { style: `width:${size}` };
  }
  const [width, height] = size.split('x');
  return height ? { width, height } : { width };
}

export function isVideoUrl(value) {
  return typeof value === 'string' && VIDEO_URL.test(value.split('?')[0]);
}

/** bin/r2-media.sh uploads `clip-<hash>-poster.webp` beside `clip-<hash>.mp4`. */
export function posterUrlFor(src) {
  return src.replace(/(\.[^.?]+)(\?.*)?$/, '-poster.webp$2');
}

/** What a feed or an og:image tag should point at: never the video itself. */
export function previewImageFor(url) {
  if (!url) {
    return undefined;
  }
  return isVideoUrl(url) ? posterUrlFor(url) : url;
}
