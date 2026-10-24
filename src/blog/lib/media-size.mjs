/**
 * Pixel sizes of the blog's remote photos (and video posters), looked up at
 * build time so every <img> and <video> can carry width/height: the browser
 * then reserves the right space before the file arrives and the text never
 * jumps when it does.
 *
 * R2 file names carry a content hash, so a size never changes for a URL;
 * found sizes are kept in node_modules/.cache between builds.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { sizeProperties } from './media.mjs';

const CACHE_FILE = join(fileURLToPath(new URL('../../../', import.meta.url)), 'node_modules/.cache/blog-media-sizes.json');
const FETCH_TIMEOUT_MS = 15000;

let savedSizes = null;
const pending = new Map();

/** { width, height } of the image at `url`, or null if it can't be read. */
export function mediaSize(url) {
  if (typeof url !== 'string' || !/^https?:/.test(url)) {
    return Promise.resolve(null);
  }
  const saved = loadSavedSizes()[url];
  if (saved) {
    return Promise.resolve(saved);
  }
  if (!pending.has(url)) {
    pending.set(url, measure(url));
  }
  return pending.get(url);
}

async function measure(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const { width, height } = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    if (!width || !height) {
      throw new Error('no dimensions in the file');
    }
    const size = { width, height };
    saveSize(url, size);
    return size;
  } catch (error) {
    console.warn(`media size: couldn't measure ${url} (${error.message})`);
    return null;
  }
}

function loadSavedSizes() {
  if (!savedSizes) {
    try {
      savedSizes = JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
    } catch {
      savedSizes = {};
    }
  }
  return savedSizes;
}

function saveSize(url, size) {
  loadSavedSizes()[url] = size;
  try {
    if (!existsSync(dirname(CACHE_FILE))) {
      mkdirSync(dirname(CACHE_FILE), { recursive: true });
    }
    writeFileSync(CACHE_FILE, JSON.stringify(savedSizes));
  } catch {
    // the cache only saves time; a read-only node_modules just re-measures
  }
}

/**
 * width/height attributes for a photo of `natural` size shown at the size
 * the note asked for (`400`, `400x300`, `60%`, or none). They always keep
 * the photo's proportions, which is what the browser reserves space from.
 */
export function sizedAttributes(natural, size) {
  if (!natural) {
    return {};
  }
  if (size && !size.endsWith('%')) {
    const [width, height] = size.split('x').map(Number);
    if (height) {
      return { width, height };
    }
    return { width, height: Math.round((width * natural.height) / natural.width) };
  }
  return { width: natural.width, height: natural.height };
}

/**
 * Everything an <img> or <video> needs for its size: the note's own size
 * (`400`, `400x300`, `60%`) as before, the file's proportions as
 * width/height, and `data-sized` when the note asked for a size.
 */
export async function mediaProperties(src, size) {
  const natural = await mediaSize(src);
  return {
    ...sizeProperties(size),
    ...sizedAttributes(natural, size),
    ...(size ? { 'data-sized': '' } : {}),
  };
}
