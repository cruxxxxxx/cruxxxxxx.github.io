/**
 * Lighter copies of project media for phones. Desktop always gets the
 * original; phones (touch screens) get the copy when one exists.
 *
 *   image (png/jpg/webp) → public/mobile/<name>.mobile.webp   ≤ MOBILE_IMAGE_WIDTH wide
 *   video (mp4/webm)     → public/mobile/<name>.mobile.mp4    ≤ MOBILE_VIDEO_WIDTH, lower bitrate
 *
 * Videos can be remote (CloudFront): the original stays there, the light copy
 * is saved here and served from the site. src/data/media-variants.json maps
 * each media entry exactly as written in the project JSON to its copy.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PUBLIC_DIR = join(ROOT, 'public');
const VARIANT_DIR = join(PUBLIC_DIR, 'mobile');
const MANIFEST_PATH = join(ROOT, 'src/data/media-variants.json');

const MOBILE_IMAGE_WIDTH = 900;
const MOBILE_IMAGE_QUALITY = 78;
const MOBILE_VIDEO_WIDTH = 720;
const MOBILE_VIDEO_CRF = 30;
const MOBILE_AUDIO_BITRATE = '96k';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov']);

/** Manifest entries whose copy is missing from public/ (would 404 on phones). */
export function missingVariants() {
  return Object.entries(readVariantManifest())
    .filter(([, copy]) => !existsSync(join(PUBLIC_DIR, copy)))
    .map(([src, copy]) => `${src} → ${copy}`);
}

export function readVariantManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    return {};
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

function writeVariantManifest(manifest) {
  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(sorted, null, '\t')}\n`);
}

export function mediaKind(src) {
  const extension = extname(src.split('?')[0]).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) {
    return 'image';
  }
  if (VIDEO_EXTENSIONS.has(extension)) {
    return 'video';
  }
  return null;
}

/**
 * Makes the phone copy for one media entry (a public/ filename or a remote
 * video URL) and records it. Returns the copy's site path, or null when the
 * type has no light copy (gif, .mio, youtube…).
 */
export async function makeMobileVariant(src, { force = false } = {}) {
  const kind = mediaKind(src);
  if (!kind) {
    return null;
  }
  const manifest = readVariantManifest();
  if (manifest[src] && !force && existsSync(join(PUBLIC_DIR, manifest[src]))) {
    return `/${manifest[src]}`;
  }

  mkdirSync(VARIANT_DIR, { recursive: true });
  const stem = basename(src.split('?')[0], extname(src.split('?')[0]));
  const variantName = kind === 'image' ? `${stem}.mobile.webp` : `${stem}.mobile.mp4`;
  const variantPath = join(VARIANT_DIR, variantName);

  // an already-made copy is reused unless forced (video encodes are slow)
  if (force || !existsSync(variantPath)) {
    if (kind === 'image') {
      await makeMobileImage(localPathFor(src), variantPath);
    } else {
      await makeMobileVideo(src, variantPath);
    }
  }

  manifest[src] = `mobile/${variantName}`;
  writeVariantManifest(manifest);
  return `/mobile/${variantName}`;
}

function localPathFor(src) {
  const path = join(PUBLIC_DIR, src.replace(/^\//, ''));
  if (!existsSync(path)) {
    throw new Error(`no such file in public/: ${src}`);
  }
  return path;
}

async function makeMobileImage(sourcePath, variantPath) {
  await sharp(sourcePath)
    .rotate()
    .resize({ width: MOBILE_IMAGE_WIDTH, withoutEnlargement: true })
    .webp({ quality: MOBILE_IMAGE_QUALITY })
    .toFile(variantPath);
}

async function makeMobileVideo(src, variantPath) {
  const isRemote = /^https?:\/\//.test(src);
  const workDir = join(tmpdir(), `mobile-variant-${process.pid}-${Date.now()}`);
  mkdirSync(workDir, { recursive: true });
  try {
    let input = isRemote ? join(workDir, 'source') : localPathFor(src);
    if (isRemote) {
      const response = await fetch(src);
      if (!response.ok) {
        throw new Error(`download failed (${response.status}) for ${src}`);
      }
      writeFileSync(input, Buffer.from(await response.arrayBuffer()));
    }
    execFileSync('ffmpeg', [
      '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', input,
      '-vf', `scale='min(${MOBILE_VIDEO_WIDTH},iw)':-2`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', String(MOBILE_VIDEO_CRF), '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', MOBILE_AUDIO_BITRATE,
      '-movflags', '+faststart', '-map_metadata', '-1',
      variantPath,
    ], { stdio: ['ignore', 'ignore', 'inherit'] });
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}
