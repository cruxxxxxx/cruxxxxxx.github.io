/**
 * Shader glitch, two looks mixed together:
 *  - tear: the card's own image tears into sideways slices, its colour
 *    channels pull apart, rows bend, and grain and scanlines flicker over it
 *  - snow: the original static itself, frame for frame: static.webp's 14
 *    frames packed 4x4 into static-frames.webp, played at its 80ms a frame
 *    and stretched over the card like the old <img> was
 * "mix" blends them (0 all tear, 1 all snow), or "randomMix" picks a new
 * blend for every glitch. It rises and settles over a few hundred ms.
 *
 * One WebGL canvas is shared by every card (browsers allow only a handful of
 * WebGL contexts), laid over whichever card is glitching. The look comes from
 * effects.json's "glitch" settings (tuned live in the editor's effects panel).
 *
 * playGlitch resolves to:
 *   'done'        it played (or was cut short by a newer glitch)
 *   'busy'        another glitch was playing and this one wasn't urgent
 *   'unsupported' no WebGL (or snow only was needed before its frames
 *                 loaded); use the static image instead
 * When the image can't be read (another server without CORS headers, or not
 * loaded yet) it plays snow only, since there's nothing to tear.
 */

const VERTEX_SHADER = `
attribute vec2 aCorner;
uniform vec2 uCanvas;
varying vec2 vPos;
void main() {
  // vPos: CSS pixels from the canvas's top-left
  vPos = vec2((aCorner.x + 1.0) * 0.5, (1.0 - aCorner.y) * 0.5) * uCanvas;
  gl_Position = vec4(aCorner, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D uImage;
uniform vec4 uFrame;     // the image's box in the canvas: x, y, width, height (CSS px)
uniform vec2 uCrop;      // how much of the texture shows (object-fit: cover)
uniform float uAmount;   // 0..1, the glitch's strength right now
uniform float uStep;     // re-rolled glitchRate times a second
uniform float uSlices;
uniform float uTear;
uniform float uRgbSplit;
uniform float uNoise;
uniform float uScanlines;
uniform float uWave;
uniform float uBlocks;
uniform float uSnow;        // 0..1, how much snow covers the tear right now
uniform float uSnowOnly;    // 1: no readable image, draw snow over the card
uniform sampler2D uStatic;  // static-frames.webp
uniform float uStaticFrame; // 0..13
uniform vec4 uSnowBox;      // the box the static stretches over (CSS px)
varying vec2 vPos;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec4 sampleImage(vec2 framePos) {
  vec2 uv = (clamp(framePos, 0.0, 1.0) - 0.5) * uCrop + 0.5;
  return texture2D(uImage, uv);
}

const float STATIC_COLUMNS = 4.0;
// half a texel in from each edge, so smoothing never pulls in the next frame
const vec2 STATIC_INSET = vec2(0.5 / 480.0, 0.5 / 364.0);

vec3 snow(vec2 p) {
  vec2 s = clamp((p - uSnowBox.xy) / uSnowBox.zw, STATIC_INSET, 1.0 - STATIC_INSET);
  vec2 cell = vec2(mod(uStaticFrame, STATIC_COLUMNS), floor(uStaticFrame / STATIC_COLUMNS));
  return texture2D(uStatic, (cell + s) / STATIC_COLUMNS).rgb;
}

void main() {
  vec2 f = (vPos - uFrame.xy) / uFrame.zw;
  if (f.x < 0.0 || f.y < 0.0 || f.x > 1.0 || f.y > 1.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  if (uSnowOnly > 0.5) {
    gl_FragColor = vec4(snow(vPos), uSnow);
    return;
  }
  float a = uAmount;

  // horizontal slices jump sideways
  float row = floor(f.y * uSlices);
  float shift = 0.0;
  if (hash(vec2(row, uStep)) < a * 0.7) {
    shift = (hash(vec2(row, uStep + 1.0)) - 0.5) * 2.0 * uTear * a;
  }
  // a few big blocks slip further
  vec2 block = floor(f * vec2(5.0, 9.0));
  if (hash(block + uStep * 3.1) < uBlocks * a * 0.2) {
    shift += (hash(block + 7.0) - 0.5) * 2.0 * uTear;
  }
  // the rows bend
  shift += sin(f.y * 38.0 + uStep * 2.3) * uWave * a;

  vec2 g = vec2(f.x + shift, f.y);
  float rgbShift = uRgbSplit * a * (0.4 + hash(vec2(row * 3.0, uStep)));
  vec3 color = vec3(
    sampleImage(g + vec2(rgbShift, 0.0)).r,
    sampleImage(g).g,
    sampleImage(g - vec2(rgbShift, 0.0)).b);

  float grain = hash(floor(vPos) + uStep * 13.7);
  color = mix(color, vec3(grain), uNoise * a);
  color *= 1.0 - uScanlines * a * step(0.5, fract(vPos.y * 0.5));
  gl_FragColor = vec4(mix(color, snow(vPos), uSnow), 1.0);
}`;

const STATIC_FRAMES = '/static-frames.webp';
const STATIC_FRAME_COUNT = 14;
const STATIC_FRAME_MS = 80;

let renderer = null; // { canvas, gl, program, uniforms, texture } once made; false if WebGL is missing
let current = null;  // the glitch playing now: { stop }

/**
 * Glitch the image(s) over a card.
 *  windowElement  the card's visible box; the canvas never draws outside it
 *  frameElement   where the image sits (its box is re-read every frame)
 *  sources        <img>/<video> to draw; a second one takes over halfway
 *  snowElement    the box the static stretches over (the old <img>'s box);
 *                 the window when left out
 *  durationMs, settings (effects.json "glitch")
 *  urgent         cut short a glitch already playing instead of giving way
 */
export function playGlitch({ windowElement, frameElement, snowElement, sources, durationMs, settings, urgent = false }) {
  if (current && !urgent) {
    return Promise.resolve('busy');
  }
  if (!getRenderer()) {
    return Promise.resolve('unsupported');
  }
  // leave out what can't be read (another server's video): leaving a video
  // slide still tears the image coming in; nothing readable means snow only
  const drawable = sources.filter((source) => isDrawable(source) && uploadImage(source));
  if (drawable.length > 0) {
    uploadImage(drawable[0]); // the check left the last one in the texture
  }
  const wantedMix = pickMix(settings);
  // nothing to tear and no static wanted (or no static frames yet): nothing to draw
  if (drawable.length === 0 && (wantedMix === 0 || !renderer.staticReady)) {
    return Promise.resolve('unsupported');
  }
  const snowMix = !renderer.staticReady ? 0 : drawable.length === 0 ? 1 : wantedMix;
  current?.stop();
  return new Promise((resolve) => {
    run({
      windowElement,
      frameElement: frameElement ?? windowElement,
      snowElement: snowElement ?? windowElement,
      sources: drawable,
      snowMix,
      durationMs,
      settings,
      resolve,
    });
  });
}

function pickMix(settings) {
  return settings.randomMix ? Math.random() : settings.mix;
}

function run({ windowElement, frameElement, snowElement, sources, snowMix, durationMs, settings, resolve }) {
  const { canvas } = renderer;
  const startedAt = performance.now();
  const firstStaticFrame = Math.floor(Math.random() * STATIC_FRAME_COUNT);
  let showing = 0;
  let frame;

  const finish = () => {
    cancelAnimationFrame(frame);
    canvas.style.display = 'none';
    current = null;
    resolve('done');
  };
  current = { stop: finish };

  const draw = (now) => {
    const progress = (now - startedAt) / durationMs;
    if (progress >= 1) {
      finish();
      return;
    }
    // the second image (a slide change's next slide) takes over halfway
    const wanted = progress >= 0.5 && sources.length > 1 ? 1 : 0;
    if (sources.length > 0 && (wanted !== showing || sources[showing].tagName === 'VIDEO')) {
      if (uploadImage(sources[wanted])) {
        showing = wanted;
      }
    }
    const staticFrame = (firstStaticFrame + Math.floor((now - startedAt) / STATIC_FRAME_MS)) % STATIC_FRAME_COUNT;
    const look = { source: sources[showing] ?? null, snowMix, staticFrame };
    if (!drawFrame(windowElement, frameElement, snowElement, look, progress, now, settings)) {
      finish();
      return;
    }
    frame = requestAnimationFrame(draw);
  };
  frame = requestAnimationFrame(draw);
}

function drawFrame(windowElement, frameElement, snowElement, { source, snowMix, staticFrame }, progress, now, settings) {
  const { canvas, gl, uniforms } = renderer;
  const box = visiblePart(windowElement.getBoundingClientRect());
  if (!box) {
    return false;
  }
  // a page change swaps <body>, taking the canvas with it
  if (!canvas.isConnected) {
    document.body.append(canvas);
  }
  const scale = window.devicePixelRatio || 1;
  canvas.style.display = 'block';
  canvas.style.left = `${box.left}px`;
  canvas.style.top = `${box.top}px`;
  canvas.style.width = `${box.width}px`;
  canvas.style.height = `${box.height}px`;
  // resizing clears and reallocates it, so only when the size changes
  const width = Math.round(box.width * scale);
  const height = Math.round(box.height * scale);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  gl.viewport(0, 0, canvas.width, canvas.height);

  const frameBox = frameElement.getBoundingClientRect();
  gl.uniform2f(uniforms.uCanvas, box.width, box.height);
  gl.uniform4f(uniforms.uFrame, frameBox.left - box.left, frameBox.top - box.top, frameBox.width, frameBox.height);
  gl.uniform2fv(uniforms.uCrop, source ? coverCrop(source, frameBox) : [1, 1]);
  // strongest in the middle, quick to start and settle
  gl.uniform1f(uniforms.uAmount, Math.sin(Math.PI * progress) ** 0.6);
  // kept small: phones run the shader at medium precision
  gl.uniform1f(uniforms.uStep, Math.floor((now / 1000) * settings.rate) % 512);
  gl.uniform1f(uniforms.uSlices, settings.slices);
  gl.uniform1f(uniforms.uTear, settings.tear);
  gl.uniform1f(uniforms.uRgbSplit, settings.rgbSplit);
  gl.uniform1f(uniforms.uNoise, settings.noise);
  gl.uniform1f(uniforms.uScanlines, settings.scanlines);
  gl.uniform1f(uniforms.uWave, settings.wave);
  gl.uniform1f(uniforms.uBlocks, settings.blocks);
  // snow comes on almost at once and holds, like the old static did
  const snowEnvelope = Math.min(1, Math.sin(Math.PI * progress) * 4);
  gl.uniform1f(uniforms.uSnow, snowMix * snowEnvelope);
  gl.uniform1f(uniforms.uSnowOnly, source ? 0 : 1);
  gl.uniform1f(uniforms.uStaticFrame, staticFrame);
  const snowBox = snowElement.getBoundingClientRect();
  gl.uniform4f(uniforms.uSnowBox, snowBox.left - box.left, snowBox.top - box.top, snowBox.width, snowBox.height);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return true;
}

// the part of a box that's inside the viewport, or null
function visiblePart(rect) {
  const left = Math.max(rect.left, 0);
  const top = Math.max(rect.top, 0);
  const right = Math.min(rect.right, window.innerWidth);
  const bottom = Math.min(rect.bottom, window.innerHeight);
  if (right <= left || bottom <= top) {
    return null;
  }
  return { left, top, width: right - left, height: bottom - top };
}

// object-fit: cover, which is also exact for an image that keeps its own shape
function coverCrop(source, frameBox) {
  const [width, height] = naturalSize(source);
  const imageAspect = width / height;
  const frameAspect = frameBox.width / frameBox.height;
  return imageAspect > frameAspect ? [frameAspect / imageAspect, 1] : [1, imageAspect / frameAspect];
}

function naturalSize(source) {
  return source.tagName === 'VIDEO'
    ? [source.videoWidth, source.videoHeight]
    : [source.naturalWidth, source.naturalHeight];
}

function isDrawable(source) {
  if (!source) {
    return false;
  }
  if (source.tagName === 'VIDEO') {
    return source.readyState >= 2 && source.videoWidth > 0;
  }
  return source.tagName === 'IMG' && source.complete && source.naturalWidth > 0;
}

// false when the browser won't let WebGL read it (another server without CORS)
function uploadImage(source) {
  const { gl, texture } = renderer;
  try {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    return true;
  } catch {
    return false;
  }
}

function getRenderer() {
  if (renderer === null) {
    renderer = createRenderer() ?? false;
  }
  return renderer;
}

function createRenderer() {
  const canvas = document.createElement('canvas');
  canvas.className = 'glitch-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false });
  if (!gl) {
    return null;
  }
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('glitch shader failed; using the static instead.', gl.getProgramInfoLog(program));
    return null;
  }
  gl.useProgram(program);

  const corners = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, corners);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const cornerAttribute = gl.getAttribLocation(program, 'aCorner');
  gl.enableVertexAttribArray(cornerAttribute);
  gl.vertexAttribPointer(cornerAttribute, 2, gl.FLOAT, false, 0, 0);

  const texture = makeTexture(gl);

  const staticTexture = makeTexture(gl);
  const made = { canvas, gl, program, texture, staticTexture, staticReady: false };
  loadStaticFrames(made);

  const uniforms = Object.fromEntries(
    ['uCanvas', 'uFrame', 'uCrop', 'uAmount', 'uStep', 'uSlices', 'uTear', 'uRgbSplit', 'uNoise', 'uScanlines', 'uWave', 'uBlocks',
      'uSnow', 'uSnowOnly', 'uStatic', 'uStaticFrame', 'uSnowBox']
      .map((name) => [name, gl.getUniformLocation(program, name)]),
  );
  gl.uniform1i(uniforms.uImage, 0);
  gl.uniform1i(uniforms.uStatic, 1);
  document.body.append(canvas);
  made.uniforms = uniforms;
  return made;
}

// any image size (WebGL 1 needs clamped, unmipmapped textures for that)
function makeTexture(gl) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return texture;
}

// the static's frames, on texture unit 1 for good
function loadStaticFrames(made) {
  const frames = new Image();
  frames.onload = () => {
    const { gl } = made;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, made.staticTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, frames);
    gl.activeTexture(gl.TEXTURE0);
    made.staticReady = true;
  };
  frames.src = STATIC_FRAMES;
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('glitch shader:', gl.getShaderInfoLog(shader));
  }
  return shader;
}

/** The image a card is showing: its current carousel slide's <img> or <video>. */
export function shownMedia(cardElement) {
  const slide = cardElement.querySelector('.react-multi-carousel-item--active');
  return slide?.querySelector('video, img') ?? null;
}
