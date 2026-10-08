#!/usr/bin/env node
/**
 * Make phone copies for every project's media (covers, posters, slides,
 * videos) that doesn't have one yet. See src/editor/media-variants.mjs.
 *
 *   npm run media:mobile              images (fast)
 *   npm run media:mobile -- --videos  images and videos (downloads + re-encodes)
 *   npm run media:mobile -- --force   remake existing copies
 */
import { readFileSync } from 'node:fs';
import { makeMobileVariant, mediaKind } from '../src/editor/media-variants.mjs';

const includeVideos = process.argv.includes('--videos');
const force = process.argv.includes('--force');

const projects = ['sitedata', 'experiments'].flatMap(
  (file) => JSON.parse(readFileSync(new URL(`../src/data/${file}.json`, import.meta.url), 'utf8')).projects,
);
const sources = [...new Set(projects.flatMap((project) => project.mediaSrcs.flatMap(
  (entry) => (typeof entry === 'string' ? [entry] : [entry.src, entry.poster].filter(Boolean)),
)))];

for (const src of sources) {
  const kind = mediaKind(src);
  if (!kind || (kind === 'video' && !includeVideos)) {
    continue;
  }
  try {
    const variant = await makeMobileVariant(src, { force });
    console.log(`${kind}  ${src}  →  ${variant}`);
  } catch (error) {
    console.error(`skipped ${src}: ${error.message}`);
  }
}
