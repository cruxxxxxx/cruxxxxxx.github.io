/**
 * Project editor, server side. Dev only: hooks into `astro dev` and adds a few
 * routes under /__editor/ that read and write the project JSON files and save
 * dropped media into public/. Nothing here runs in `astro build`, so the
 * deployed site never has these routes.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatProjectJson } from './format-json.mjs';
import { makeMobileVariant, mediaKind, missingVariants, readVariantManifest } from './media-variants.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PUBLIC_DIR = join(ROOT, 'public');
const DATA_FILES = {
  projects: join(ROOT, 'src/data/sitedata.json'),
  experiments: join(ROOT, 'src/data/experiments.json'),
};
const MEDIA_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.webm', '.mio']);
const MARGIN_FIELDS = [
  'marginTopOpen', 'marginBottomOpen',
  'marginTopClose', 'marginBottomClose',
  'marginTopHover', 'marginBottomHover',
  'marginCloseDiff',
];

/**
 * Build guard: every phone copy listed in media-variants.json must exist in
 * public/, or phones would get a broken image/video on the live site.
 */
export function mediaVariantsCheck() {
  return {
    name: 'media-variants-check',
    hooks: {
      'astro:build:start': () => {
        const missing = missingVariants();
        if (missing.length > 0) {
          throw new Error(`media-variants.json lists phone copies that aren't in public/:\n  ${missing.join('\n  ')}`);
        }
      },
    },
  };
}

export default function projectEditor() {
  return {
    name: 'project-editor',
    hooks: {
      'astro:config:setup': ({ command, injectScript }) => {
        if (command === 'dev') {
          injectScript('page', `import { mountProjectEditor } from '/src/editor/mount.jsx'; mountProjectEditor();`);
        }
      },
      'astro:server:setup': ({ server, logger }) => {
        server.middlewares.use(async (req, res, next) => {
          if (!req.url.startsWith('/__editor/')) {
            return next();
          }
          try {
            await route(req, res);
          } catch (error) {
            logger.error(`editor: ${error.message}`);
            sendJson(res, error.status ?? 500, { error: error.message });
          }
        });
        logger.info('project editor: open the site and press "edit"');
      },
    },
  };
}

async function route(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const action = `${req.method} ${url.pathname}`;

  if (action === 'GET /__editor/data') {
    return sendJson(res, 200, { groups: readAllGroups(), variants: readVariantManifest() });
  }
  if (action === 'GET /__editor/media') {
    return sendJson(res, 200, { files: listPublicMedia() });
  }
  if (action === 'POST /__editor/save') {
    const { originalName, project } = JSON.parse(await readBody(req));
    saveProject(originalName ?? null, project);
    return sendJson(res, 200, { ok: true });
  }
  if (action === 'POST /__editor/delete') {
    const { name } = JSON.parse(await readBody(req));
    deleteProject(name);
    return sendJson(res, 200, { ok: true });
  }
  if (action === 'POST /__editor/upload') {
    const saved = saveUpload(url.searchParams.get('filename'), await readBody(req, { raw: true }));
    // phone copies for images right away; video copies wait until their
    // hosting is decided (public/mobile/*.mp4 is gitignored for now)
    const mobile = mediaKind(saved) === 'image' ? await makeMobileVariant(saved) : null;
    return sendJson(res, 200, { src: saved, mobile });
  }
  throw httpError(404, `no editor route ${action}`);
}

// ── project data ───────────────────────────────────────────────────────────

function readAllGroups() {
  return Object.fromEntries(
    Object.entries(DATA_FILES).map(([group, path]) => [group, JSON.parse(readFileSync(path, 'utf8')).projects]),
  );
}

function writeGroup(group, projects) {
  writeFileSync(DATA_FILES[group], formatProjectJson({ projects }));
}

function saveProject(originalName, project) {
  validateProject(project);
  const groups = readAllGroups();
  rejectDuplicateName(groups, project.name, originalName);

  const original = originalName === null ? null : findProject(groups, originalName);
  if (originalName !== null && !original) {
    throw httpError(404, `no project named ${JSON.stringify(originalName)}`);
  }

  if (original && original.group === project.group) {
    groups[project.group][original.index] = project;
  } else {
    if (original) {
      groups[original.group].splice(original.index, 1);
      writeGroup(original.group, groups[original.group]);
    }
    groups[project.group].push(project);
  }
  writeGroup(project.group, groups[project.group]);
}

function deleteProject(name) {
  const groups = readAllGroups();
  const found = findProject(groups, name);
  if (!found) {
    throw httpError(404, `no project named ${JSON.stringify(name)}`);
  }
  groups[found.group].splice(found.index, 1);
  writeGroup(found.group, groups[found.group]);
}

function findProject(groups, name) {
  for (const [group, projects] of Object.entries(groups)) {
    const index = projects.findIndex((project) => project.name === name);
    if (index >= 0) {
      return { group, index };
    }
  }
  return null;
}

function rejectDuplicateName(groups, name, originalName) {
  const clash = Object.values(groups).flat().some((project) => project.name === name && name !== originalName);
  if (clash) {
    throw httpError(409, `another project is already called ${JSON.stringify(name)}`);
  }
}

function validateProject(project) {
  const problems = [];
  if (!project || typeof project !== 'object') {
    throw httpError(400, 'missing project');
  }
  if (!nonEmptyString(project.name)) {
    problems.push('name is required');
  }
  if (!(project.group in DATA_FILES)) {
    problems.push('group must be projects or experiments');
  }
  if (!nonEmptyString(project.category)) {
    problems.push('category is required');
  }
  if (!/^\d{4}$/.test(String(project.year ?? ''))) {
    problems.push('year must be four digits');
  }
  if (!Array.isArray(project.description) || !project.description.every((part) => typeof part === 'string')) {
    problems.push('description must be a list of text');
  }
  if (!Array.isArray(project.mediaSrcs) || project.mediaSrcs.length === 0) {
    problems.push('at least one media item is required (the first one is the cover)');
  }
  for (const field of MARGIN_FIELDS) {
    if (!nonEmptyString(project[field])) {
      problems.push(`${field} is required`);
    }
  }
  if (problems.length > 0) {
    throw httpError(400, problems.join('; '));
  }
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

// ── media ──────────────────────────────────────────────────────────────────

function listPublicMedia() {
  return readdirSync(PUBLIC_DIR)
    .filter((name) => MEDIA_EXTENSIONS.has(extname(name).toLowerCase()) && !name.includes('.mobile.'))
    .sort();
}

/** Saves into public/ under a safe, unused name; returns that name. */
function saveUpload(requestedName, bytes) {
  if (!requestedName || bytes.length === 0) {
    throw httpError(400, 'upload needs a filename and a body');
  }
  const extension = extname(requestedName).toLowerCase();
  if (!MEDIA_EXTENSIONS.has(extension)) {
    throw httpError(400, `unsupported file type ${extension}`);
  }
  const stem = basename(requestedName, extname(requestedName))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'media';
  let name = `${stem}${extension}`;
  for (let copy = 2; existsSync(join(PUBLIC_DIR, name)); copy += 1) {
    name = `${stem}_${copy}${extension}`;
  }
  writeFileSync(join(PUBLIC_DIR, name), bytes);
  return name;
}

// ── http helpers ───────────────────────────────────────────────────────────

function readBody(req, { raw = false } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      resolve(raw ? body : body.toString('utf8'));
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
