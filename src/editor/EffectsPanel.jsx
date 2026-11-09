import React, { useState } from 'react';
import { useStore } from '@nanostores/react';
import SavedEffects from '../data/effects.json';
import { $effects, $badgeOnEveryCard, $flashStaticNow } from '../stores/effects.js';
import { LayeredStar, RAYS } from '../components/project/newBadge.jsx';

// The cards' ambient static and "new" badge (src/data/effects.json). Every
// change shows live on the homepage; save writes effects.json and reloads.

// the badge's star characters, roughly from plain to busy
const STARS = [
  '✦', '✧', '⊹', '⋆', '★', '☆', '✩', '✪', '✫', '✬', '✭', '✮', '✯', '✰',
  '✶', '✷', '✸', '✹', '✺', '✴', '❇', '❈', '✳', '✱', '✲', '∗', '⁎', '✢', '✣', '✤', '✥',
  '✻', '✼', '✽', '❋', '❊', '❉', '❃', '❁', '✿', '❀', '✾', '❄', '❅', '❆',
  '✚', '✛', '✜', '✕', '✖', '⨯', '⁂', '⁜', '⁘', '⁕', '⟡', '◇', '◆', '❂', '☀', '☼', '✡',
];

const STATIC_SLIDERS = [
  { key: 'minSeconds', label: 'min seconds between flashes', min: 1, max: 60, step: 1 },
  { key: 'maxSeconds', label: 'max seconds between flashes', min: 1, max: 90, step: 1 },
  { key: 'flashMs', label: 'flash length (ms)', min: 50, max: 1000, step: 10 },
  { key: 'opacity', label: 'strength', min: 0.1, max: 1, step: 0.05 },
];

let savedEffects = SavedEffects;

const BADGE_SLIDERS = [
  { key: 'letterMs', label: 'letter speed (ms per letter)', min: 20, max: 500, step: 10 },
  { key: 'pauseMs', label: 'pause between sweeps (ms)', min: 0, max: 5000, step: 50 },
  { key: 'sizeEm', label: 'size (em)', min: 0.6, max: 4, step: 0.05 },
  { key: 'topEm', label: 'from top (em)', min: 0, max: 3, step: 0.05 },
  { key: 'rightEm', label: 'from right (em)', min: 0, max: 3, step: 0.05 },
];

const LAYER_NAMES = ['back', 'middle', 'front'];

const LAYER_SLIDERS = [
  { key: 'scale', label: 'scale', min: 0.2, max: 3, step: 0.05 },
  { key: 'x', label: 'x (em)', min: -1, max: 1, step: 0.02 },
  { key: 'y', label: 'y (em)', min: -1, max: 1, step: 0.02 },
  { key: 'rotate', label: 'rotate (°)', min: -180, max: 180, step: 5 },
  { key: 'spinRpm', label: 'spin (turns per minute, minus = anticlockwise, 0 = still)', min: -60, max: 60, step: 1 },
];

// only for a layer drawn as rays; lengths are in hundredths of a character
const RAY_SLIDERS = [
  { key: 'rayCount', label: 'rays', min: 1, max: 16, step: 1 },
  { key: 'rayInner', label: 'gap from centre', min: 0, max: 50, step: 1 },
  { key: 'rayLength', label: 'ray length', min: 2, max: 50, step: 1 },
  { key: 'rayWidth', label: 'ray thickness', min: 1, max: 15, step: 0.5 },
];

export function hasUnsavedEffects() {
  return JSON.stringify($effects.get()) !== JSON.stringify(savedEffects);
}

/** Back to what effects.json holds, and no preview badges. */
export function dropEffectsPreview() {
  $effects.set(savedEffects);
  $badgeOnEveryCard.set(false);
}

export function EffectsPanel({ onSaved }) {
  const effects = useStore($effects);
  const badgeOnEveryCard = useStore($badgeOnEveryCard);
  const [status, setStatus] = useState('');
  const isUnsaved = JSON.stringify(effects) !== JSON.stringify(savedEffects);

  const updateStatic = (changes) => $effects.set({ ...effects, ambientStatic: { ...effects.ambientStatic, ...changes } });
  const updateBadge = (changes) => $effects.set({ ...effects, newBadge: { ...effects.newBadge, ...changes } });

  const save = async () => {
    setStatus('saving…');
    const response = await fetch('/__editor/effects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ effects }),
    });
    const result = await response.json();
    if (!response.ok) {
      setStatus(`not saved: ${result.error}`);
      return;
    }
    savedEffects = effects;
    onSaved();
  };

  return (
    <div className="pe-form">
      <section className="pe-section">
        <h3>static on closed cards</h3>
        {STATIC_SLIDERS.map((slider) => (
          <NumberSlider
            key={slider.key}
            {...slider}
            value={effects.ambientStatic[slider.key]}
            onChange={(value) => updateStatic({ [slider.key]: value })} />
        ))}
        <button type="button" onClick={() => $flashStaticNow.set($flashStaticNow.get() + 1)}>flash now</button>
      </section>

      <section className="pe-section">
        <h3>"new" badge</h3>
        <label className="pe-check">
          <input
            type="checkbox"
            checked={badgeOnEveryCard}
            onChange={(e) => $badgeOnEveryCard.set(e.target.checked)} />
          preview on every card <em>(not saved)</em>
        </label>
        <label className="pe-field">
          <span>text</span>
          <input value={effects.newBadge.text} onChange={(e) => updateBadge({ text: e.target.value })} />
        </label>
        <div className="pe-stars" role="group" aria-label="star">
          {STARS.map((star) => (
            <button type="button" key={star} onClick={() => updateBadge({ text: withStar(effects.newBadge.text, star) })}>
              {star}
            </button>
          ))}
        </div>
        {BADGE_SLIDERS.map((slider) => (
          <NumberSlider
            key={slider.key}
            {...slider}
            value={effects.newBadge[slider.key]}
            onChange={(value) => updateBadge({ [slider.key]: value })} />
        ))}
        <label className="pe-check">
          <input type="color" value={effects.newBadge.grey} onChange={(e) => updateBadge({ grey: e.target.value })} />
          grey <em>{effects.newBadge.grey}</em>
        </label>
      </section>

      <LayeredStarSection badge={effects.newBadge} updateBadge={updateBadge} />

      <footer className="pe-actions">
        <button type="button" className="pe-primary" onClick={save} disabled={!isUnsaved}>save</button>
        <button type="button" onClick={() => $effects.set(savedEffects)} disabled={!isUnsaved}>revert</button>
        {status && <p className="pe-status">{status}</p>}
      </footer>
    </div>
  );
}

// Stars stacked on top of each other. Each layer can be switched off, to see
// it alone or how the others look together.
function LayeredStarSection({ badge, updateBadge }) {
  const { layered, layerLight, layers } = badge;
  const updateLayer = (index, changes) => updateBadge({
    layers: layers.map((layer, i) => (i === index ? { ...layer, ...changes } : layer)),
  });
  const visibleLayers = layers.filter((layer) => layer.on);

  return (
    <section className="pe-section">
      <h3>layered stars</h3>
      <label className="pe-check">
        <input type="checkbox" checked={layered} onChange={(e) => updateBadge({ layered: e.target.checked })} />
        draw the badge's stars as these layers
      </label>
      <div className="pe-star-preview" style={{ color: badge.grey }}>
        <LayeredStar placeholder="✦" layers={visibleLayers} />
      </div>
      <label className="pe-field">
        <span>highlight</span>
        <select value={layerLight} onChange={(e) => updateBadge({ layerLight: e.target.value })}>
          <option value="together">all layers at once</option>
          <option value="sequence">one layer after another, back to front</option>
        </select>
      </label>
      {layers.map((layer, index) => (
        <fieldset key={index} className="pe-margins">
          <legend>
            <label className="pe-check">
              <input type="checkbox" checked={layer.on} onChange={(e) => updateLayer(index, { on: e.target.checked })} />
              {LAYER_NAMES[index]}
            </label>
          </legend>
          {layer.on && (
            <>
              <div className="pe-stars" role="group" aria-label={`${LAYER_NAMES[index]} star`}>
                {[RAYS, ...STARS].map((star) => (
                  <button
                    type="button"
                    key={star}
                    className={star === layer.star ? 'pe-selected' : ''}
                    onClick={() => updateLayer(index, { star })}>
                    {star}
                  </button>
                ))}
              </div>
              {layer.star === RAYS && RAY_SLIDERS.map((slider) => (
                <NumberSlider
                  key={slider.key}
                  {...slider}
                  value={layer[slider.key]}
                  onChange={(value) => updateLayer(index, { [slider.key]: value })} />
              ))}
              {LAYER_SLIDERS.map((slider) => (
                <NumberSlider
                  key={slider.key}
                  {...slider}
                  value={layer[slider.key]}
                  onChange={(value) => updateLayer(index, { [slider.key]: value })} />
              ))}
              <label className="pe-check">
                <input type="color" value={layer.color} onChange={(e) => updateLayer(index, { color: e.target.value })} />
                colour <em>{layer.color}</em>
              </label>
            </>
          )}
        </fieldset>
      ))}
    </section>
  );
}

function NumberSlider({ label, value, min, max, step, onChange }) {
  return (
    <label className="pe-slider pe-slider-wide">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
      <input
        className="pe-slider-value"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </label>
  );
}

// swaps the star(s) around "new": "✦ new ✦" -> "★ new ★"
function withStar(text, star) {
  const word = text.replace(/[^\p{L}\p{N} ]/gu, '').trim() || 'new';
  return `${star} ${word} ${star}`;
}
