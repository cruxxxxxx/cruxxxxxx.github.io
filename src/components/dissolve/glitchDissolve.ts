/**
 * Glitch dissolve: an image appears through a noise mask while horizontal
 * slices jump sideways, the colour channels pull apart, and the rows bend on
 * drifting sine waves and roll vertically like a TV catching the signal, all
 * settling as the mask fills in. Drawn on a canvas laid over the <img>, which stays hidden
 * (but keeps its place in the layout) until the canvas has finished.
 *
 * The look is set by a DissolveSettings object, kept in src/data/about.json
 * and tuned live in `astro dev` (see ./dissolveTuner.ts).
 */

export const PATTERNS = ['white', 'blocks', 'fbm', 'bayer', 'scanlines', 'streaks', 'sweep', 'radial'] as const;
export type Pattern = (typeof PATTERNS)[number];

export interface DissolveSettings {
  pattern: Pattern;
  /** size of one mask cell, in CSS pixels */
  cell: number;
  /** feature size of the structured patterns (blocks, fbm, streaks), in cells */
  scale: number;
  /** 0–1: how much plain white noise is mixed into the pattern */
  grain: number;
  /** 0–1: width of the half-shown band at the dissolve edge; 0 is hard on/off */
  softness: number;
  /** 0–1: cells near the edge blink on and off */
  flicker: number;
  /** milliseconds */
  duration: number;
  delay: number;
  /** 0–1: how hard and how often slices of the image jump sideways */
  glitch: number;
  /** most slices on screen at once */
  slices: number;
  /** widest colour-channel split, in CSS pixels */
  rgbSplit: number;
  /** how many times a second the glitch re-rolls; low is choppier */
  glitchRate: number;
  /** widest sideways bend of the sine-wave warp, in CSS pixels */
  wave: number;
  /** waves down the image's height (the main one; finer ones ride on it) */
  waveFrequency: number;
  /** how fast the waves travel and drift */
  waveSpeed: number;
  /** higher holds the warp longer before it locks in */
  waveSettle: number;
  /** full vertical rolls before the picture locks */
  roll: number;
  seed: number;
}

export const DEFAULT_SETTINGS: DissolveSettings = {
  pattern: 'blocks',
  cell: 4,
  scale: 8,
  grain: 0.35,
  softness: 0.08,
  flicker: 0.3,
  duration: 1400,
  delay: 150,
  glitch: 0.7,
  slices: 6,
  rgbSplit: 10,
  glitchRate: 18,
  wave: 24,
  waveFrequency: 3,
  waveSpeed: 1,
  waveSettle: 0.5,
  roll: 1,
  seed: 7,
};

export interface DissolveHandle {
  /** stops the animation and shows the plain image */
  cancel(): void;
  finished: Promise<void>;
}

/** Hides `image` and plays the dissolve over it; resolves once it's shown. */
export function playDissolve(image: HTMLImageElement, overrides: Partial<DissolveSettings> = {}): DissolveHandle {
  const settings = { ...DEFAULT_SETTINGS, ...overrides };
  let cancelled = false;
  let stopRenderer = () => {};

  const finished = imageReady(image).then(() => new Promise<void>((resolve) => {
    if (cancelled) {
      return resolve();
    }
    const renderer = createRenderer(image, settings, resolve);
    stopRenderer = renderer.stop;
  }));

  return {
    finished,
    cancel() {
      cancelled = true;
      stopRenderer();
    },
  };
}

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

async function imageReady(image: HTMLImageElement) {
  try {
    await image.decode();
  } catch {
    // a broken image still gets "shown" so the page never stays blank
  }
}

// ── renderer ───────────────────────────────────────────────────────────────

function createRenderer(image: HTMLImageElement, settings: DissolveSettings, onDone: () => void) {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const box = image.getBoundingClientRect();
  const width = Math.max(1, Math.round(box.width * pixelRatio));
  const height = Math.max(1, Math.round(box.height * pixelRatio));

  const canvas = document.createElement('canvas');
  canvas.className = 'dissolve-canvas';
  canvas.width = width;
  canvas.height = height;
  canvas.setAttribute('aria-hidden', 'true');
  image.insertAdjacentElement('afterend', canvas);
  const context = canvas.getContext('2d')!;

  const channels = splitIntoChannels(image, width, height);
  const composite = makeCanvas(width, height);
  const warped = makeCanvas(width, height);
  const warp = createWarp(settings, pixelRatio);
  const mask = createMask(settings, box.width, box.height);
  const glitch = createGlitch(settings, height, pixelRatio);

  let frameRequest = 0;
  let startTime = -1;

  function drawFrame(now: number) {
    if (startTime < 0) {
      startTime = now;
    }
    const elapsed = now - startTime - settings.delay;
    const progress = clamp(elapsed / settings.duration, 0, 1);
    context.clearRect(0, 0, width, height);
    if (elapsed >= 0) {
      const state = glitch.stateAt(now, progress);
      drawChannels(composite, channels, state.split);
      warp.draw(warped, composite.canvas, (now - startTime) / 1000, progress);
      drawSlices(context, warped.canvas, state.slices, width);
      mask.update(progress);
      applyMask(context, mask.canvas, width, height);
    }
    if (progress >= 1) {
      finish();
    } else {
      frameRequest = requestAnimationFrame(drawFrame);
    }
  }

  function finish() {
    cancelAnimationFrame(frameRequest);
    canvas.remove();
    image.classList.add('dissolved');
    onDone();
  }

  frameRequest = requestAnimationFrame(drawFrame);
  return { stop: finish };
}

/**
 * The image pre-split into its red, green and blue parts, so each frame can
 * add them back together with an offset ("lighter" sums them to the original
 * wherever they line up).
 */
function splitIntoChannels(image: HTMLImageElement, width: number, height: number) {
  return ['#f00', '#0f0', '#00f'].map((colour) => {
    const channel = makeCanvas(width, height);
    channel.drawImage(image, 0, 0, width, height);
    channel.globalCompositeOperation = 'multiply';
    channel.fillStyle = colour;
    channel.fillRect(0, 0, width, height);
    channel.globalCompositeOperation = 'destination-in'; // keep the image's own transparency
    channel.drawImage(image, 0, 0, width, height);
    return channel.canvas;
  });
}

function drawChannels(target: CanvasRenderingContext2D, channels: HTMLCanvasElement[], split: number) {
  const { width, height } = target.canvas;
  target.globalCompositeOperation = 'source-over';
  target.clearRect(0, 0, width, height);
  target.globalCompositeOperation = 'lighter';
  const offsets = [-split, 0, split];
  channels.forEach((channel, index) => target.drawImage(channel, offsets[index], 0));
  target.globalCompositeOperation = 'source-over';
}

interface Slice { top: number; height: number; shift: number }

function drawSlices(context: CanvasRenderingContext2D, source: HTMLCanvasElement, slices: Slice[], width: number) {
  context.drawImage(source, 0, 0);
  for (const slice of slices) {
    context.clearRect(0, slice.top, width, slice.height);
    context.drawImage(source, 0, slice.top, width, slice.height, slice.shift, slice.top, width, slice.height);
  }
}

function applyMask(context: CanvasRenderingContext2D, mask: HTMLCanvasElement, width: number, height: number) {
  context.globalCompositeOperation = 'destination-in';
  context.imageSmoothingEnabled = false; // keep the cells square
  context.drawImage(mask, 0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.globalCompositeOperation = 'source-over';
}

// ── sine warp ──────────────────────────────────────────────────────────────

/**
 * Redraws the image in thin rows, each pushed sideways by a sum of sine waves
 * whose frequencies and strength drift over time, while the whole picture
 * rolls vertically. Both die down as the dissolve completes, the roll easing
 * into place like a set catching vertical hold.
 */
function createWarp(settings: DissolveSettings, pixelRatio: number) {
  const random = seededRandom(settings.seed * 104729 + 3);
  const phases = [random(), random(), random(), random()].map((value) => value * Math.PI * 2);
  const rowHeight = Math.max(1, Math.round(2 * pixelRatio));

  function strengthAt(progress: number) {
    // waveSettle 0 fades right away, 1 holds near full until the end
    return (1 - progress) ** (0.5 + (1 - settings.waveSettle) * 2.5);
  }

  function rowShift(position: number, time: number, amplitude: number) {
    const speed = settings.waveSpeed;
    const frequency = settings.waveFrequency * (1 + 0.35 * Math.sin(time * 0.9 * speed + phases[0]));
    const swell = 0.6 + 0.4 * Math.sin(time * 2.3 * speed + phases[1]);
    const main = Math.sin(Math.PI * 2 * frequency * position - time * 4 * speed + phases[2]);
    const ripple = Math.sin(Math.PI * 2 * frequency * 4.3 * position + time * 9 * speed + phases[3]);
    const fizz = Math.sin(Math.PI * 2 * frequency * 17 * position - time * 23 * speed);
    return amplitude * swell * (0.7 * main + 0.22 * ripple + 0.08 * fizz);
  }

  return {
    draw(target: CanvasRenderingContext2D, source: HTMLCanvasElement, time: number, progress: number) {
      const { width, height } = target.canvas;
      const strength = strengthAt(progress);
      const amplitude = settings.wave * pixelRatio * strength;
      const rollOffset = Math.round(settings.roll * height * (1 - easeOutCubic(progress))) % height;
      target.clearRect(0, 0, width, height);
      if (amplitude < 0.5 && rollOffset === 0) {
        target.drawImage(source, 0, 0);
        return;
      }
      for (let top = 0; top < height; top += rowHeight) {
        const sourceTop = (top + rollOffset) % height;
        const rows = Math.min(rowHeight, height - top, height - sourceTop);
        const shift = rowShift(top / height, time, amplitude);
        target.drawImage(source, 0, sourceTop, width, rows, shift, top, width, rows);
      }
    },
  };
}

// ── glitch ─────────────────────────────────────────────────────────────────

/**
 * Re-rolls a set of shifted slices and a channel split `glitchRate` times a
 * second. Both fade out as the dissolve completes, with the odd late spike.
 */
function createGlitch(settings: DissolveSettings, height: number, pixelRatio: number) {
  const random = seededRandom(settings.seed * 7919 + 1);
  const rollInterval = 1000 / Math.max(1, settings.glitchRate);
  let nextRoll = -Infinity;
  let current = { split: 0, slices: [] as Slice[] };

  function roll(progress: number) {
    const fade = (1 - progress) ** 1.5;
    const spike = random() < 0.12 ? 1 : 0;
    const strength = settings.glitch * Math.max(fade, spike * 0.6 * (1 - progress));
    const sliceCount = Math.round(settings.slices * strength * (0.4 + random() * 0.6));
    const slices: Slice[] = [];
    for (let index = 0; index < sliceCount; index++) {
      const sliceHeight = Math.max(1, Math.round(height * (0.005 + random() ** 2 * 0.12)));
      slices.push({
        top: Math.floor(random() * height),
        height: sliceHeight,
        shift: Math.round((random() - 0.5) * 2 * 60 * pixelRatio * strength),
      });
    }
    const split = Math.round(settings.rgbSplit * pixelRatio * strength * (random() < 0.5 ? 1 : -1) * (0.3 + random() * 0.7));
    current = { split, slices };
  }

  return {
    stateAt(now: number, progress: number) {
      if (now >= nextRoll) {
        roll(progress);
        nextRoll = now + rollInterval;
      }
      return current;
    },
  };
}

// ── mask ───────────────────────────────────────────────────────────────────

/**
 * One pixel per cell: a cell is shown once the dissolve's progress passes its
 * noise value. The canvas is stretched over the image without smoothing.
 */
function createMask(settings: DissolveSettings, cssWidth: number, cssHeight: number) {
  const cellSize = Math.max(1, settings.cell);
  const columns = Math.max(1, Math.ceil(cssWidth / cellSize));
  const rows = Math.max(1, Math.ceil(cssHeight / cellSize));
  const field = noiseField(settings, columns, rows);
  const mask = makeCanvas(columns, rows);
  const pixels = mask.createImageData(columns, rows);
  const softness = Math.max(0.001, settings.softness);
  let frame = 0;

  function update(progress: number) {
    frame++;
    // the edge sweeps from below 0 to above 1 so the first and last cells
    // get a full fade too
    const edge = progress * (1 + softness);
    for (let index = 0; index < field.length; index++) {
      const value = field[index] + settings.flicker * 0.15 * (hash(index, frame) - 0.5);
      const alpha = progress >= 1 ? 1 : clamp((edge - value) / softness, 0, 1);
      const pixel = index * 4;
      pixels.data[pixel] = 255;
      pixels.data[pixel + 1] = 255;
      pixels.data[pixel + 2] = 255;
      pixels.data[pixel + 3] = alpha * 255;
    }
    mask.putImageData(pixels, 0, 0);
  }

  return { canvas: mask.canvas, update };
}

/** A value in [0, 1) per cell; low values appear first. */
export function noiseField(settings: DissolveSettings, columns: number, rows: number) {
  const random = seededRandom(settings.seed);
  const shape = PATTERN_SHAPES[settings.pattern] ?? PATTERN_SHAPES.white;
  const sample = shape(columns, rows, Math.max(1, settings.scale), random);
  const field = new Float32Array(columns * rows);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const structured = sample(column, row);
      field[row * columns + column] = lerp(structured, random(), settings.grain);
    }
  }
  return normalise(field);
}

type Sampler = (column: number, row: number) => number;
type Shape = (columns: number, rows: number, scale: number, random: () => number) => Sampler;

const PATTERN_SHAPES: Record<Pattern, Shape> = {
  white: (_columns, _rows, _scale, random) => () => random(),

  // big chunks and small chunks pop in together, like a corrupt JPEG
  blocks: (columns, rows, scale, random) => {
    const coarse = randomGrid(columns / scale, rows / scale, random);
    const fine = randomGrid(columns / (scale / 3), rows / (scale / 3), random);
    return (column, row) => 0.65 * coarse(column / scale, row / scale) + 0.35 * fine(column / (scale / 3), row / (scale / 3));
  },

  // smooth cloudy blobs
  fbm: (columns, rows, scale, random) => {
    const octaves = [1, 2, 4, 8].map((frequency) => ({
      frequency,
      grid: smoothGrid((columns / scale) * frequency, (rows / scale) * frequency, random),
    }));
    return (column, row) => {
      let total = 0;
      let weight = 0;
      for (const { frequency, grid } of octaves) {
        total += grid((column / scale) * frequency, (row / scale) * frequency) / frequency;
        weight += 1 / frequency;
      }
      return total / weight;
    };
  },

  // the classic ordered-dither dissolve
  bayer: () => (column, row) => BAYER_8[(row % 8) * 8 + (column % 8)] / 64,

  // whole rows at a time, like a video signal locking on
  scanlines: (_columns, rows, scale, random) => {
    const bands = randomGrid(1, rows / Math.max(1, scale / 4), random);
    return (_column, row) => bands(0, row / Math.max(1, scale / 4));
  },

  // long horizontal runs of random length
  streaks: (columns, rows, scale, random) => {
    const runs = new Float32Array(columns * rows);
    for (let row = 0; row < rows; row++) {
      let column = 0;
      while (column < columns) {
        const length = 1 + Math.floor(random() * scale * 4);
        const value = random();
        for (let end = Math.min(columns, column + length); column < end; column++) {
          runs[row * columns + column] = value;
        }
      }
    }
    return (column, row) => runs[row * columns + column];
  },

  // top to bottom, ragged
  sweep: (columns, rows, scale, random) => {
    const ragged = randomGrid(columns / scale, rows / scale, random);
    return (column, row) => 0.75 * (row / rows) + 0.25 * ragged(column / scale, row / scale);
  },

  // from the centre out, ragged
  radial: (columns, rows, scale, random) => {
    const ragged = randomGrid(columns / scale, rows / scale, random);
    const maxDistance = Math.hypot(columns / 2, rows / 2);
    return (column, row) => {
      const distance = Math.hypot(column - columns / 2, row - rows / 2) / maxDistance;
      return 0.75 * distance + 0.25 * ragged(column / scale, row / scale);
    };
  },
};

const BAYER_8 = [
  0, 32, 8, 40, 2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37,
  63, 31, 55, 23, 61, 29, 53, 21,
];

/** Random values on a grid, looked up without blending (hard-edged cells). */
function randomGrid(columns: number, rows: number, random: () => number) {
  const width = Math.ceil(columns) + 1;
  const height = Math.ceil(rows) + 1;
  const values = Float32Array.from({ length: width * height }, random);
  return (x: number, y: number) => values[clampIndex(y, height) * width + clampIndex(x, width)];
}

/** Random values on a grid, blended smoothly between grid points. */
function smoothGrid(columns: number, rows: number, random: () => number) {
  const width = Math.ceil(columns) + 2;
  const height = Math.ceil(rows) + 2;
  const values = Float32Array.from({ length: width * height }, random);
  const at = (x: number, y: number) => values[clampIndex(y, height) * width + clampIndex(x, width)];
  return (x: number, y: number) => {
    const left = Math.floor(x);
    const top = Math.floor(y);
    const along = smoothstep(x - left);
    const down = smoothstep(y - top);
    const upper = lerp(at(left, top), at(left + 1, top), along);
    const lower = lerp(at(left, top + 1), at(left + 1, top + 1), along);
    return lerp(upper, lower, down);
  };
}

/** Spreads the values evenly over [0, 1) by rank, so every pattern takes the full duration. */
function normalise(field: Float32Array) {
  const order = Array.from(field.keys()).sort((a, b) => field[a] - field[b]);
  const ranked = new Float32Array(field.length);
  order.forEach((cell, rank) => {
    ranked[cell] = rank / field.length;
  });
  return ranked;
}

// ── helpers ────────────────────────────────────────────────────────────────

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas.getContext('2d', { willReadFrequently: false })!;
}

/** mulberry32: the same seed gives the same pattern every time */
function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(a: number, b: number) {
  let mixed = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b, 0xc2b2ae35);
  mixed = Math.imul(mixed ^ (mixed >>> 13), 0x27d4eb2f);
  return ((mixed ^ (mixed >>> 16)) >>> 0) / 4294967296;
}

function clampIndex(value: number, size: number) {
  return Math.min(size - 1, Math.max(0, Math.floor(value)));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

function easeOutCubic(value: number) {
  return 1 - (1 - value) ** 3;
}

function smoothstep(value: number) {
  return value * value * (3 - 2 * value);
}
