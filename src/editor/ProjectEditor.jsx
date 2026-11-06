import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { $editorDraft, $editorPreview, $editorOrder } from './store.js';
import { compareProjects } from '../projectOrder.js';
import './editor.css';

// Local-only project editor: `npm run dev`, then "edit" in the corner.
// It opens on a list of every project by year: drag to reorder within a
// year (saves right away), click to edit. Edits show live on the real card;
// Save writes src/data/*.json (and dropped media into public/) through the
// dev server routes in ./integration.mjs.

const GROUPS = ['projects', 'experiments'];
const SLIDER_FIELDS = [
  { label: 'closed', top: 'marginTopClose', bottom: 'marginBottomClose', preview: 'closed' },
  { label: 'hover', top: 'marginTopHover', bottom: 'marginBottomHover', preview: 'hover' },
  { label: 'open', top: 'marginTopOpen', bottom: 'marginBottomOpen', preview: 'open' },
];
const SLIDER_MIN = -100;
const SLIDER_MAX = 20;
const REOPEN_KEY = 'project-editor:reopen';
const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp)$/i;

export default function ProjectEditor() {
  const [isOpen, setIsOpen] = useState(false);
  const [groups, setGroups] = useState(null);
  const [status, setStatus] = useState('');
  const draft = useStore($editorDraft);
  const preview = useStore($editorPreview);

  const loadData = async () => {
    const response = await fetch('/__editor/data');
    const data = await response.json();
    setGroups(data.groups);
    return data.groups;
  };

  // after a save the page reloads; come back to the same project (or the list)
  useEffect(() => {
    const reopenName = readReopenName();
    if (reopenName === null) {
      return;
    }
    loadData().then((loaded) => {
      setIsOpen(true);
      const saved = findByName(loaded, reopenName);
      if (saved) {
        startEditing(saved);
      }
    });
  }, []);

  const savedProject = draft ? findByName(groups, draft.originalName) : null;
  const hasUnsavedEdits = draft !== null
    && (savedProject === null || JSON.stringify(savedProject) !== JSON.stringify(draft.project));

  // ⌘S / Ctrl+S saves the open project
  useEffect(() => {
    if (!draft) {
      return undefined;
    }
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const open = async () => {
    setIsOpen(true);
    await loadData();
  };

  const confirmDiscard = () => !hasUnsavedEdits || window.confirm('Drop your unsaved edits?');

  const backToList = () => {
    if (!confirmDiscard()) {
      return;
    }
    $editorDraft.set(null);
    $editorPreview.set('closed');
    setStatus('');
  };

  const close = () => {
    if (!confirmDiscard()) {
      return;
    }
    setIsOpen(false);
    $editorDraft.set(null);
    $editorPreview.set('closed');
  };

  const startEditing = (saved) => {
    $editorPreview.set('closed');
    $editorDraft.set({ originalName: saved.name, project: structuredClone(saved) });
    setStatus('');
  };

  const startNewProject = () => {
    const template = allProjects(groups)[0];
    $editorPreview.set('closed');
    $editorDraft.set({ originalName: null, project: newProjectFrom(template) });
    setStatus('');
  };

  const save = async () => {
    setStatus('saving…');
    const response = await fetch('/__editor/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    const result = await response.json();
    if (!response.ok) {
      setStatus(`not saved: ${result.error}`);
      return;
    }
    rememberReopenName(draft.project.name);
    window.location.reload();
  };

  const remove = async () => {
    if (draft.originalName === null || !window.confirm(`Delete "${oneLine(draft.originalName)}"? Its media files stay in public/.`)) {
      return;
    }
    const response = await fetch('/__editor/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: draft.originalName }),
    });
    const result = await response.json();
    if (!response.ok) {
      setStatus(`not deleted: ${result.error}`);
      return;
    }
    rememberReopenName('');
    window.location.reload();
  };

  const revert = () => {
    if (savedProject) {
      startEditing(savedProject);
    } else {
      startNewProject();
    }
  };

  if (!isOpen) {
    return (
      <button type="button" className="project-editor-toggle" onClick={open}>edit</button>
    );
  }

  return (
    <aside className="project-editor" aria-label="project editor">
      <header className="pe-head">
        {draft ? (
          <>
            <button type="button" className="pe-link" onClick={backToList}>&larr; all projects</button>
            <strong className="pe-title">
              {draft.originalName === null ? 'new project' : oneLine(draft.originalName)}
              {hasUnsavedEdits && <span className="pe-unsaved" title="unsaved changes"> •</span>}
            </strong>
          </>
        ) : (
          <>
            <strong>projects</strong>
            {groups && <button type="button" onClick={startNewProject}>+ new project</button>}
          </>
        )}
        <button type="button" className="pe-link" onClick={close}>close</button>
      </header>

      {!groups && <p>loading…</p>}

      {groups && !draft && <ProjectList groups={groups} setGroups={setGroups} onPick={startEditing} />}

      {draft && <DraftForm draft={draft} savedProject={savedProject} preview={preview} />}

      {draft && (
        <footer className="pe-actions">
          <button type="button" className="pe-primary" onClick={save} disabled={!hasUnsavedEdits}>
            save <em>⌘S</em>
          </button>
          <button type="button" onClick={revert} disabled={!hasUnsavedEdits}>revert</button>
          {draft.originalName !== null && <button type="button" className="pe-danger" onClick={remove}>delete</button>}
          {status && <p className="pe-status">{status}</p>}
        </footer>
      )}
    </aside>
  );
}

// Every project by year, newest first, in homepage order. Drag a row (or use
// its ↑/↓) to move it within its year: the order saves straight away and the
// homepage follows without a reload. Click a row to edit the project.
function ProjectList({ groups, setGroups, onPick }) {
  const [status, setStatus] = useState('');
  // while dragging: { year, name, names (the order being shown) }
  const [drag, setDrag] = useState(null);
  const years = projectsByYear(groups);

  const saveOrder = async (names) => {
    const previous = groups;
    const previousOverrides = $editorOrder.get();
    setGroups(withYearOrder(groups, names));
    $editorOrder.set({ ...previousOverrides, ...yearOrderOverrides(groups, names) });
    setStatus('saving order…');
    const response = await fetch('/__editor/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names }),
    });
    if (response.ok) {
      setStatus('');
      return;
    }
    const result = await response.json();
    setGroups(previous);
    $editorOrder.set(previousOverrides);
    setStatus(`order not saved: ${result.error}`);
  };

  const moveByStep = (names, index, step) => {
    const target = index + step;
    if (target < 0 || target >= names.length) {
      return;
    }
    const reordered = [...names];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    saveOrder(reordered);
  };

  const startDrag = (event, year, name, names) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', name); // Firefox won't drag without data
    setDrag({ year, name, names, originalNames: names });
  };

  // the dragged row moves into place as it passes over the others
  const dragOverRow = (event, year, overName) => {
    if (!drag || drag.year !== year) {
      return;
    }
    event.preventDefault();
    if (overName === drag.name) {
      return;
    }
    const row = event.currentTarget.getBoundingClientRect();
    const isUpperHalf = event.clientY < row.top + row.height / 2;
    const names = drag.names.filter((name) => name !== drag.name);
    const insertAt = names.indexOf(overName) + (isUpperHalf ? 0 : 1);
    names.splice(insertAt, 0, drag.name);
    if (names.join('\n') !== drag.names.join('\n')) {
      setDrag({ ...drag, names });
    }
  };

  const drop = (event) => {
    event.preventDefault();
    if (drag && drag.names.join('\n') !== drag.originalNames.join('\n')) {
      saveOrder(drag.names);
    }
    setDrag(null);
  };

  return (
    <div className="pe-list">
      <p className="pe-hint">drag to reorder within a year · click to edit</p>
      {years.map(({ year, projects }) => {
        const isDraggingHere = drag?.year === year;
        const names = isDraggingHere ? drag.names : projects.map((project) => project.name);
        const byName = Object.fromEntries(projects.map((project) => [project.name, project]));
        return (
          <section key={year} className="pe-year">
            <h3>{year}</h3>
            <ol
              className={`pe-year-list${isDraggingHere ? ' pe-dragging' : ''}`}
              onDragOver={(event) => isDraggingHere && event.preventDefault()}
              onDrop={drop}>
              {names.map((name, index) => {
                const project = byName[name];
                return (
                  <li
                    key={name}
                    className={drag?.name === name ? 'pe-dragged' : ''}
                    draggable={names.length > 1}
                    onDragStart={(event) => startDrag(event, year, name, names)}
                    onDragOver={(event) => dragOverRow(event, year, name)}
                    onDragEnd={() => setDrag(null)}>
                    {names.length > 1 && <span className="pe-grip" aria-hidden="true">⠿</span>}
                    {/* not a <button>: some browsers won't start a drag on one */}
                    <span
                      className="pe-row-pick"
                      role="button"
                      tabIndex={0}
                      onClick={() => onPick(project)}
                      onKeyDown={(event) => event.key === 'Enter' && onPick(project)}>
                      <CoverThumb project={project} />
                      <span className="pe-row-name">{oneLine(name)}</span>
                      {project.group === 'experiments' && <em>exp</em>}
                    </span>
                    {names.length > 1 && (
                      <span className="pe-row-steps">
                        <button type="button" onClick={() => moveByStep(names, index, -1)} disabled={index === 0} aria-label="earlier">↑</button>
                        <button type="button" onClick={() => moveByStep(names, index, 1)} disabled={index === names.length - 1} aria-label="later">↓</button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
      {status && <p className="pe-status">{status}</p>}
    </div>
  );
}

function CoverThumb({ project }) {
  const src = coverImage(project);
  if (!src) {
    return <span className="pe-thumb" />;
  }
  return <img className="pe-thumb" src={src} alt="" loading="lazy" draggable={false} />;
}

function DraftForm({ draft, savedProject, preview }) {
  const { project } = draft;

  // every change makes a new project object so the card re-renders live
  const update = (changes) => {
    $editorDraft.set({ ...draft, project: { ...project, ...changes } });
  };

  // Moved to another year, it shows (and saves) at the top of that year;
  // moved back, it gets its old place again.
  const changeYear = (year) => {
    const isSavedYear = savedProject !== null && year === savedProject.year;
    update({ year, yearOrder: isSavedYear ? savedProject.yearOrder : 0 });
  };

  return (
    <div className="pe-form">
      <label className="pe-field">
        <span>name <em>(enter = line break in the title)</em></span>
        <textarea rows={2} value={project.name} onChange={(e) => update({ name: e.target.value })} />
      </label>

      <div className="pe-row">
        <label className="pe-field">
          <span>group</span>
          <select value={project.group} onChange={(e) => update({ group: e.target.value })}>
            {GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
          </select>
        </label>
        <label className="pe-field">
          <span>category</span>
          <input value={project.category} onChange={(e) => update({ category: e.target.value })} />
        </label>
        <label className="pe-field pe-narrow">
          <span>year</span>
          <input inputMode="numeric" value={project.year} onChange={(e) => changeYear(e.target.value)} />
        </label>
      </div>

      <DescriptionField description={project.description} update={update} />

      <MediaList project={project} update={update} />

      <section className="pe-section">
        <h3>crop <em>(drag to see it on the card)</em></h3>
        <div className="pe-preview-buttons" role="group" aria-label="preview">
          {SLIDER_FIELDS.map(({ preview: look }) => (
            <button
              type="button"
              key={look}
              className={preview === look ? 'pe-selected' : ''}
              onClick={() => $editorPreview.set(look)}>
              {look}
            </button>
          ))}
        </div>
        {SLIDER_FIELDS.map(({ label, top, bottom, preview: look }) => (
          <fieldset key={label} className="pe-margins" onFocus={() => $editorPreview.set(look)}>
            <legend>{label}</legend>
            <MarginSlider label="top" value={project[top]} onChange={(value) => update({ [top]: value })} />
            <MarginSlider label="bottom" value={project[bottom]} onChange={(value) => update({ [bottom]: value })} />
          </fieldset>
        ))}
        <label className="pe-field pe-narrow">
          <span>marginCloseDiff <em>(kept in the data, not used by the site)</em></span>
          <input value={project.marginCloseDiff} onChange={(e) => update({ marginCloseDiff: e.target.value })} />
        </label>
      </section>
    </div>
  );
}

function MarginSlider({ label, value, onChange }) {
  const number = parsePercent(value);
  return (
    <label className="pe-slider">
      <span>{label}</span>
      <input
        type="range"
        min={SLIDER_MIN}
        max={SLIDER_MAX}
        step={1}
        value={Number.isFinite(number) ? number : 0}
        onChange={(e) => onChange(`${e.target.value}%`)}
      />
      <input className="pe-slider-value" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

// Links are written [label](https://…); "+ link" inserts one at the cursor,
// using the selected text as the label, then selects the URL to paste over.
function DescriptionField({ description, update }) {
  const textarea = useRef();
  const text = descriptionText(description);

  const insertLink = () => {
    const field = textarea.current;
    const { selectionStart: start, selectionEnd: end } = field;
    const label = text.slice(start, end) || 'link text';
    const url = 'https://';
    const link = `[${label}](${url})`;
    update({ description: toParagraphs(text.slice(0, start) + link + text.slice(end)) });
    const urlStart = start + label.length + 3;
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(urlStart, urlStart + url.length);
    });
  };

  return (
    <label className="pe-field">
      <span className="pe-field-head">
        <span>description <em>(blank line = new paragraph; [text](https://…) = link)</em></span>
        <button type="button" onClick={insertLink}>+ link</button>
      </span>
      <textarea
        ref={textarea}
        rows={8}
        value={text}
        onChange={(e) => update({ description: toParagraphs(e.target.value) })}
      />
    </label>
  );
}

function MediaList({ project, update }) {
  const [uploading, setUploading] = useState('');
  const fileInput = useRef();
  const media = project.mediaSrcs;

  const setMedia = (mediaSrcs) => update({ mediaSrcs });

  const changeEntry = (index, changes) => {
    setMedia(media.map((entry, i) => (i === index ? withEntryChanges(entry, changes) : entry)));
  };

  const move = (index, step) => {
    const target = index + step;
    if (target < 0 || target >= media.length) {
      return;
    }
    const reordered = [...media];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setMedia(reordered);
  };

  const removeEntry = (index) => setMedia(media.filter((_, i) => i !== index));

  const uploadFiles = async (files) => {
    const added = [];
    for (const file of files) {
      setUploading(`uploading ${file.name}…`);
      const response = await fetch(`/__editor/upload?filename=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        body: file,
      });
      const result = await response.json();
      if (!response.ok) {
        setUploading(`upload failed: ${result.error}`);
        return;
      }
      added.push(result.src);
    }
    setUploading(added.length ? `added ${added.join(', ')} to public/` : '');
    setMedia([...media, ...added]);
  };

  const onDrop = (event) => {
    event.preventDefault();
    uploadFiles([...event.dataTransfer.files]);
  };

  return (
    <section className="pe-section">
      <h3>media <em>(first = cover; drop files here)</em></h3>
      <ol className="pe-media" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        {media.map((entry, index) => (
          <li key={index}>
            <input
              value={entrySrc(entry)}
              placeholder="file in public/ or a URL"
              onChange={(e) => changeEntry(index, { src: e.target.value })}
            />
            <input
              className="pe-poster"
              value={entryPoster(entry)}
              placeholder="poster (video / .mio)"
              onChange={(e) => changeEntry(index, { poster: e.target.value })}
            />
            <span className="pe-media-buttons">
              <button type="button" onClick={() => move(index, -1)} aria-label="move up">↑</button>
              <button type="button" onClick={() => move(index, 1)} aria-label="move down">↓</button>
              <button type="button" onClick={() => removeEntry(index)} aria-label="remove">✕</button>
            </span>
          </li>
        ))}
      </ol>
      <div className="pe-media-add">
        <button type="button" onClick={() => setMedia([...media, ''])}>+ add by name/URL</button>
        <button type="button" onClick={() => fileInput.current.click()}>+ upload…</button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          accept="image/*,video/*,.mio"
          onChange={(e) => uploadFiles([...e.target.files])}
        />
      </div>
      {uploading && <p className="pe-status">{uploading}</p>}
    </section>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function allProjects(groups) {
  return GROUPS.flatMap((group) => groups?.[group] ?? []);
}

function newProjectFrom(template) {
  const margins = Object.fromEntries(
    Object.entries(template ?? {}).filter(([key]) => key.startsWith('margin')),
  );
  return {
    name: 'new project',
    ...margins,
    mediaSrcs: [],
    category: '',
    group: 'projects',
    year: String(new Date().getFullYear()),
    yearOrder: 0, // top of its year, like it will be once saved
    description: [''],
  };
}

function findByName(groups, name) {
  if (name === null) {
    return null;
  }
  return allProjects(groups).find((project) => project.name === name) ?? null;
}

/** [{ year, projects }], newest year first, each in homepage order */
function projectsByYear(groups) {
  const years = [];
  for (const project of [...allProjects(groups)].sort(compareProjects)) {
    if (years.at(-1)?.year !== project.year) {
      years.push({ year: project.year, projects: [] });
    }
    years.at(-1).projects.push(project);
  }
  return years;
}

/** names: one year's projects in their new order; positions count from 1 */
function withYearOrder(groups, names) {
  return Object.fromEntries(Object.entries(groups).map(([group, projects]) => [
    group,
    projects.map((project) => {
      const position = names.indexOf(project.name);
      return position < 0 ? project : { ...project, yearOrder: position + 1 };
    }),
  ]));
}

function yearOrderOverrides(groups, names) {
  const year = findByName(groups, names[0]).year;
  return Object.fromEntries(names.map((name, position) => [name, { year, yearOrder: position + 1 }]));
}

/** the cover (first media item) as an image URL, or '' for a video without a poster */
function coverImage(project) {
  const cover = project.mediaSrcs?.[0];
  if (!cover) {
    return '';
  }
  const image = [entryPoster(cover), entrySrc(cover)].find((src) => IMAGE_EXTENSIONS.test(src));
  if (!image) {
    return '';
  }
  return /^https?:/.test(image) ? image : `/${image}`;
}

// descriptions are a list of paragraphs, or (in some older entries) one string
function descriptionText(description) {
  return Array.isArray(description) ? description.join('') : description ?? '';
}

// "a\n\nb\n\nc" → ["a", "\n\nb", "\n\nc"], the layout the JSON already uses
function toParagraphs(text) {
  return text.split(/(?=\n\n)/);
}

function oneLine(name) {
  return name.replace(/\s*\n\s*/g, ' ');
}

function parsePercent(value) {
  return Number.parseFloat(String(value).replace('%', ''));
}

function entrySrc(entry) {
  return typeof entry === 'string' ? entry : entry.src;
}

function entryPoster(entry) {
  return typeof entry === 'string' ? '' : entry.poster ?? '';
}

// a plain string until a poster is set, then { src, poster, … }
function withEntryChanges(entry, changes) {
  const current = typeof entry === 'string' ? { src: entry } : { ...entry };
  const next = { ...current, ...changes };
  if (!next.poster) {
    delete next.poster;
  }
  const keys = Object.keys(next);
  return keys.length === 1 && keys[0] === 'src' ? next.src : next;
}

function readReopenName() {
  try {
    const name = sessionStorage.getItem(REOPEN_KEY);
    sessionStorage.removeItem(REOPEN_KEY);
    return name;
  } catch {
    return null;
  }
}

function rememberReopenName(name) {
  try {
    sessionStorage.setItem(REOPEN_KEY, name);
  } catch {
    // the editor just won't reopen by itself
  }
}
