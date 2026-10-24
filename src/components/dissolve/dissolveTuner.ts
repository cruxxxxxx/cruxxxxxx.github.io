/**
 * Dev-only panel for trying dissolve looks on the about page. Injected by
 * src/editor/integration.mjs in `astro dev` only. Every change replays the
 * portrait; "save" writes the settings into src/data/about.json.
 */
import { DEFAULT_SETTINGS, PATTERNS, noiseField, type DissolveSettings, type Pattern } from './glitchDissolve';

interface Slider { key: keyof DissolveSettings; min: number; max: number; step: number; label: string }

const SLIDERS: Slider[] = [
  { key: 'cell', min: 1, max: 24, step: 1, label: 'cell px' },
  { key: 'scale', min: 1, max: 40, step: 1, label: 'scale' },
  { key: 'grain', min: 0, max: 1, step: 0.01, label: 'grain' },
  { key: 'softness', min: 0, max: 0.5, step: 0.01, label: 'softness' },
  { key: 'flicker', min: 0, max: 1, step: 0.01, label: 'flicker' },
  { key: 'duration', min: 200, max: 5000, step: 50, label: 'duration ms' },
  { key: 'delay', min: 0, max: 2000, step: 50, label: 'delay ms' },
  { key: 'glitch', min: 0, max: 1, step: 0.01, label: 'glitch' },
  { key: 'slices', min: 0, max: 30, step: 1, label: 'slices' },
  { key: 'rgbSplit', min: 0, max: 40, step: 1, label: 'rgb split px' },
  { key: 'glitchRate', min: 1, max: 60, step: 1, label: 'glitch rate /s' },
  { key: 'wave', min: 0, max: 120, step: 1, label: 'wave px' },
  { key: 'waveFrequency', min: 0.2, max: 20, step: 0.1, label: 'wave freq' },
  { key: 'waveSpeed', min: 0, max: 4, step: 0.05, label: 'wave speed' },
  { key: 'waveSettle', min: 0, max: 1, step: 0.01, label: 'wave settle' },
  { key: 'roll', min: 0, max: 5, step: 0.25, label: 'v-roll' },
];

const PREVIEW_COLUMNS = 40;
const PREVIEW_ROWS = 60;
const PANEL_ID = 'dissolve-tuner';

export function mountDissolveTuner() {
  const attach = () => {
    document.getElementById(PANEL_ID)?.remove();
    const image = document.querySelector<HTMLImageElement>('.about-image');
    if (!image) {
      return;
    }
    const saved = JSON.parse(image.dataset.dissolve || '{}');
    document.body.append(createPanel({ ...DEFAULT_SETTINGS, ...saved }));
  };
  attach();
  document.addEventListener('astro:page-load', attach);
}

function createPanel(initial: DissolveSettings) {
  const settings = { ...initial };
  const panel = document.createElement('aside');
  panel.id = PANEL_ID;
  panel.innerHTML = `
    <style>${PANEL_CSS}</style>
    <header><strong>dissolve</strong><button type="button" data-action="collapse">–</button></header>
    <div class="tuner-body">
      <div class="tuner-patterns"></div>
      <div class="tuner-sliders"></div>
      <div class="tuner-buttons">
        <button type="button" data-action="replay">replay</button>
        <button type="button" data-action="reseed">new seed</button>
        <button type="button" data-action="reset">reset</button>
        <button type="button" data-action="copy">copy json</button>
        <button type="button" data-action="save">save</button>
      </div>
      <output class="tuner-status"></output>
    </div>`;

  const patterns = panel.querySelector<HTMLElement>('.tuner-patterns')!;
  const sliders = panel.querySelector<HTMLElement>('.tuner-sliders')!;
  const status = panel.querySelector<HTMLOutputElement>('.tuner-status')!;

  const replay = () => window.dispatchEvent(new CustomEvent('portrait-dissolve:play', { detail: { ...settings } }));
  let replayTimer = 0;
  const replaySoon = () => {
    clearTimeout(replayTimer);
    replayTimer = window.setTimeout(replay, 250);
  };

  const renderPatterns = () => {
    patterns.replaceChildren(...PATTERNS.map((pattern) => patternSwatch(pattern, settings, () => {
      settings.pattern = pattern;
      renderPatterns();
      replay();
    })));
  };

  const renderSliders = () => {
    sliders.replaceChildren(...SLIDERS.map((slider) => sliderRow(slider, settings, (value) => {
      (settings[slider.key] as number) = value;
      if (slider.key === 'scale' || slider.key === 'grain') {
        renderPatterns();
      }
      replaySoon();
    })));
  };

  const actions: Record<string, () => void> = {
    collapse: () => panel.classList.toggle('collapsed'),
    replay,
    reseed: () => {
      settings.seed = Math.floor(Math.random() * 100000);
      renderPatterns();
      replay();
    },
    reset: () => {
      Object.assign(settings, initial);
      renderPatterns();
      renderSliders();
      replay();
    },
    copy: async () => {
      await navigator.clipboard.writeText(JSON.stringify(settings, null, 2));
      status.value = 'copied';
    },
    save: async () => {
      status.value = 'saving…';
      const response = await fetch('/__editor/about-dissolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      status.value = response.ok ? 'saved to about.json' : `save failed: ${(await response.json()).error}`;
    },
  };

  panel.addEventListener('click', (event) => {
    const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
    if (action) {
      actions[action]();
    }
  });

  renderPatterns();
  renderSliders();
  return panel;
}

/** A thumbnail of the pattern's mask: dark cells appear first. */
function patternSwatch(pattern: Pattern, settings: DissolveSettings, onPick: () => void) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = pattern === settings.pattern ? 'selected' : '';
  button.title = pattern;
  const canvas = document.createElement('canvas');
  canvas.width = PREVIEW_COLUMNS;
  canvas.height = PREVIEW_ROWS;
  drawField(canvas, { ...settings, pattern, scale: Math.max(1, settings.scale / 3) });
  const label = document.createElement('span');
  label.textContent = pattern;
  button.append(canvas, label);
  button.addEventListener('click', onPick);
  return button;
}

function drawField(canvas: HTMLCanvasElement, settings: DissolveSettings) {
  const field = noiseField(settings, canvas.width, canvas.height);
  const context = canvas.getContext('2d')!;
  const pixels = context.createImageData(canvas.width, canvas.height);
  field.forEach((value, index) => {
    const shade = value * 255;
    pixels.data.set([shade, shade, shade, 255], index * 4);
  });
  context.putImageData(pixels, 0, 0);
}

function sliderRow(slider: Slider, settings: DissolveSettings, onChange: (value: number) => void) {
  const row = document.createElement('label');
  const value = document.createElement('span');
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(slider.min);
  input.max = String(slider.max);
  input.step = String(slider.step);
  input.value = String(settings[slider.key]);
  value.textContent = input.value;
  input.addEventListener('input', () => {
    value.textContent = input.value;
    onChange(Number(input.value));
  });
  row.append(slider.label, input, value);
  return row;
}

const PANEL_CSS = `
  #${PANEL_ID} {
    position: fixed; right: 12px; bottom: 12px; z-index: 100000;
    width: 300px; max-height: calc(100vh - 24px); overflow: auto;
    padding: 10px; border-radius: 10px;
    background: rgba(20, 20, 20, 0.92); color: #eee;
    font: 12px/1.4 ui-monospace, Menlo, monospace;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
  }
  #${PANEL_ID} header { display: flex; justify-content: space-between; align-items: center; }
  #${PANEL_ID}.collapsed .tuner-body { display: none; }
  #${PANEL_ID} button {
    font: inherit; color: inherit; background: #333; border: 1px solid #555;
    border-radius: 4px; padding: 2px 6px; cursor: pointer;
  }
  #${PANEL_ID} button:hover { background: #444; }
  #${PANEL_ID} .tuner-patterns { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 8px 0; }
  #${PANEL_ID} .tuner-patterns button { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 4px; }
  #${PANEL_ID} .tuner-patterns button.selected { border-color: #fff; background: #555; }
  #${PANEL_ID} .tuner-patterns canvas { width: 100%; image-rendering: pixelated; }
  #${PANEL_ID} .tuner-sliders label { display: grid; grid-template-columns: 90px 1fr 44px; gap: 6px; align-items: center; }
  #${PANEL_ID} .tuner-sliders span { text-align: right; }
  #${PANEL_ID} .tuner-buttons { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
  #${PANEL_ID} .tuner-status { display: block; margin-top: 6px; min-height: 1.4em; color: #9c9; }
`;
