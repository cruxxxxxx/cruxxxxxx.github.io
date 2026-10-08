import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { $editorDraft, $editorPreview } from './store.js';
import './editor.css';

// Local-only project editor: `npm run dev`, then "edit" in the corner.
// Edits show live on the real card; Save writes src/data/*.json (and dropped
// media into public/) through the dev server routes in ./integration.mjs.

const GROUPS = ['projects', 'experiments'];
const SLIDER_FIELDS = [
  { label: 'closed', top: 'marginTopClose', bottom: 'marginBottomClose', preview: 'closed' },
  { label: 'hover', top: 'marginTopHover', bottom: 'marginBottomHover', preview: 'hover' },
  { label: 'open', top: 'marginTopOpen', bottom: 'marginBottomOpen', preview: 'open' },
];
const SLIDER_MIN = -100;
const SLIDER_MAX = 20;
const REOPEN_KEY = 'project-editor:reopen';

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

  // after a save the page reloads; come back to the same project
  useEffect(() => {
    const reopenName = readReopenName();
    if (reopenName === null) {
      return;
    }
    loadData().then((loaded) => {
      setIsOpen(true);
      const saved = allProjects(loaded).find((project) => project.name === reopenName);
      if (saved) {
        startEditing(saved);
      }
    });
  }, []);

  const open = async () => {
    setIsOpen(true);
    await loadData();
  };

  const close = () => {
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

  const pickProject = (event) => {
    const value = event.target.value;
    if (value === '__new') {
      startNewProject();
      return;
    }
    const saved = allProjects(groups).find((project) => project.name === value);
    if (saved) {
      startEditing(saved);
    }
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
    const saved = allProjects(groups).find((project) => project.name === draft.originalName);
    if (saved) {
      startEditing(saved);
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
        <strong>projects</strong>
        <button type="button" className="pe-link" onClick={close}>close</button>
      </header>

      {!groups ? <p>loading…</p> : (
        <select className="pe-picker" value={pickerValue(draft)} onChange={pickProject}>
          <option value="" disabled>pick a project…</option>
          {GROUPS.map((group) => (
            <optgroup key={group} label={group}>
              {groups[group].map((project) => (
                <option key={project.name} value={project.name}>{oneLine(project.name)}</option>
              ))}
            </optgroup>
          ))}
          <option value="__new">+ new project</option>
        </select>
      )}

      {draft && <DraftForm draft={draft} preview={preview} />}

      {draft && (
        <footer className="pe-actions">
          <button type="button" className="pe-primary" onClick={save}>save</button>
          <button type="button" onClick={revert}>revert</button>
          {draft.originalName !== null && <button type="button" className="pe-danger" onClick={remove}>delete</button>}
          {status && <p className="pe-status">{status}</p>}
        </footer>
      )}
    </aside>
  );
}

function DraftForm({ draft, preview }) {
  const { project } = draft;

  // every change makes a new project object so the card re-renders live
  const update = (changes) => {
    $editorDraft.set({ ...draft, project: { ...project, ...changes } });
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
          <input inputMode="numeric" value={project.year} onChange={(e) => update({ year: e.target.value })} />
        </label>
      </div>

      <label className="pe-field">
        <span>description <em>(blank line = new paragraph)</em></span>
        <textarea
          rows={8}
          value={project.description.join('')}
          onChange={(e) => update({ description: toParagraphs(e.target.value) })}
        />
      </label>

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
              placeholder="poster (videos)"
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
    description: [''],
  };
}

function pickerValue(draft) {
  if (!draft) {
    return '';
  }
  return draft.originalName ?? '__new';
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
