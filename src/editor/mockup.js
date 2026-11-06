import './mockup.css';

/**
 * Mockup mode (astro dev only, injected by ./integration.mjs): sketch design
 * ideas straight on the real page, then export a screenshot of it.
 *
 *   - drag any element on the page to move it; the corner handle scales it
 *   - add text, image and box elements of your own (images: pick, paste or
 *     drop a file)
 *   - export: captures the page (Chrome shares this tab; Firefox can only
 *     share a whole window, so pick this one and the toolbars are cropped
 *     off) and saves a PNG into .mockups/ (gitignored), path copied
 *
 * Nothing here is ever saved to the site: every change is an inline style or
 * an element added in memory, and a reload throws it all away. Moves use the
 * individual `translate` / `scale` CSS properties, so they stack on top of
 * whatever transform the site itself is animating.
 *
 * Keys (mockup on, not typing): ⌘Z undo · Delete hide/remove · arrows nudge
 * (shift ×10) · [ select parent · ] back to child · ⌘D duplicate (added
 * elements) · Esc deselect. Click a text element to type in it; drag it to
 * move it.
 */

const UI_SELECTOR = '[data-mockup-ui], #project-editor-root';
const NUDGE_PX = 1;
const BIG_NUDGE_PX = 10;
const MIN_SIZE_PX = 12;
const DRAG_THRESHOLD_PX = 3;
const CAPTURE_SETTLE_MS = 400; // the share prompt closing, a fresh frame arriving
const FONTS = [
  { label: 'array', value: "'arrayregular'" },
  { label: 'sans', value: '"Hiragino Kaku Gothic ProN W3", "Helvetica Neue", Helvetica, Arial, sans-serif' },
  { label: 'serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'mono', value: 'ui-monospace, Menlo, monospace' },
];

const state = {
  isOn: false,
  selected: null,
  // [ walks up to the parent; ] walks back down this trail
  childTrail: [],
  undoStack: [],
  drag: null,
  editingText: null,
};

let ui = null;

export function mountMockup() {
  ui = createUi();
  document.documentElement.append(ui.root, ui.hoverBox, ui.selectBox);
  document.body.append(ui.layer);
  ui.toggle.addEventListener('click', () => setOn(!state.isOn));
  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('click', swallowWhileOn, true);
  // no native dragging of the page's links and images while moving things
  window.addEventListener('dragstart', swallowWhileOn, true);
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('paste', onPaste);
  window.addEventListener('dragover', onFileDragOver);
  window.addEventListener('drop', onFileDrop);
  // A page swap replaces <body>: moved page elements go with it, but the
  // added ones move over to the new page.
  document.addEventListener('astro:after-swap', () => {
    document.body.append(ui.layer);
    select(null);
  });
  requestAnimationFrame(followSelection);
}

// ── on / off ─────────────────────────────────────────────────────────────────

function setOn(isOn) {
  state.isOn = isOn;
  ui.root.classList.toggle('mk-on', isOn);
  ui.toggle.textContent = isOn ? 'mockup ✕' : 'mockup';
  document.documentElement.classList.toggle('mk-active', isOn);
  if (!isOn) {
    stopEditingText();
    select(null);
    ui.hoverBox.hidden = true;
  }
}

// ── picking and dragging ─────────────────────────────────────────────────────

function pickableTarget(event) {
  const target = event.target;
  if (!(target instanceof Element) || target.closest(UI_SELECTOR)) {
    return null;
  }
  // an added element is moved as a whole, never its inner parts
  const placed = target.closest('.mk-item');
  if (placed) {
    return placed;
  }
  if (target === document.documentElement || target === document.body) {
    return null;
  }
  return target;
}

function onPointerMove(event) {
  if (!state.isOn) {
    return;
  }
  if (state.drag) {
    continueDrag(event);
    return;
  }
  const target = pickableTarget(event);
  ui.hoverBox.hidden = !target || target === state.selected;
  if (target) {
    placeBox(ui.hoverBox, target);
  }
}

function onPointerDown(event) {
  if (!state.isOn || event.button !== 0) {
    return;
  }
  if (event.target.closest?.('.mk-handle')) {
    startResize(event);
    return;
  }
  if (state.editingText && state.editingText.contains(event.target)) {
    return; // clicking around inside the text being typed
  }
  const target = pickableTarget(event);
  if (!target) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  stopEditingText();
  if (target !== state.selected) {
    state.childTrail = [];
  }
  select(target);
  startMove(event, target);
}

function onPointerUp(event) {
  if (!state.drag) {
    return;
  }
  event.stopPropagation();
  const { kind, element, restore, hasMoved } = state.drag;
  state.drag = null;
  if (hasMoved) {
    pushUndo(restore);
  } else if (kind === 'move' && element.dataset.kind === 'text') {
    // a click (no drag) on text means typing in it, cursor where it landed
    startEditingText(element, event.clientX, event.clientY);
  }
  placeBox(ui.selectBox, element);
}

// the page's own click handlers (cards opening, links) stay out of it
function swallowWhileOn(event) {
  if (!state.isOn || event.target.closest?.(UI_SELECTOR)) {
    return;
  }
  if (state.editingText && state.editingText.contains(event.target)) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
}

function startMove(event, element) {
  const [x, y] = readTranslate(element);
  state.drag = {
    kind: 'move',
    element,
    startX: event.clientX,
    startY: event.clientY,
    fromX: x,
    fromY: y,
    hasMoved: false,
    restore: snapshotStyle(element, ['translate']),
  };
}

function startResize(event) {
  event.preventDefault();
  event.stopPropagation();
  const element = state.selected;
  const rect = element.getBoundingClientRect();
  const isPlaced = element.classList.contains('mk-item');
  state.drag = {
    kind: 'resize',
    element,
    startX: event.clientX,
    startY: event.clientY,
    fromWidth: isPlaced ? element.offsetWidth : rect.width,
    fromHeight: isPlaced ? element.offsetHeight : rect.height,
    fromScale: readScale(element),
    hasMoved: false,
    // added elements change size; page elements scale, so their layout holds
    restore: snapshotStyle(element, isPlaced ? ['width', 'height'] : ['scale', 'transform-origin']),
  };
}

function continueDrag(event) {
  const drag = state.drag;
  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  if (!drag.hasMoved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) {
    return;
  }
  drag.hasMoved = true;
  if (drag.kind === 'move') {
    drag.element.style.translate = `${drag.fromX + dx}px ${drag.fromY + dy}px`;
  } else if (drag.element.classList.contains('mk-item')) {
    resizePlaced(drag, dx, dy);
  } else {
    scalePageElement(drag, dx);
  }
  placeBox(ui.selectBox, drag.element);
}

function resizePlaced(drag, dx, dy) {
  const element = drag.element;
  element.style.width = `${Math.max(MIN_SIZE_PX, drag.fromWidth + dx)}px`;
  // text grows with its words; images keep their shape
  if (element.dataset.kind === 'box') {
    element.style.height = `${Math.max(MIN_SIZE_PX, drag.fromHeight + dy)}px`;
  }
}

function scalePageElement(drag, dx) {
  const scale = Math.max(0.05, drag.fromScale * (drag.fromWidth + dx) / drag.fromWidth);
  drag.element.style.transformOrigin = 'top left';
  drag.element.style.scale = String(scale);
}

// ── selection ────────────────────────────────────────────────────────────────

function select(element) {
  state.selected = element;
  ui.selectBox.hidden = !element;
  if (element) {
    placeBox(ui.selectBox, element);
  }
  renderProperties();
}

function selectParent() {
  const parent = state.selected?.parentElement;
  if (!parent || parent === document.body || parent === document.documentElement || parent === ui.layer) {
    return;
  }
  state.childTrail.push(state.selected);
  select(parent);
}

function selectChild() {
  const child = state.childTrail.pop();
  if (child) {
    select(child);
  }
}

// scroll and the site's own animations move things; the boxes keep up
function followSelection() {
  if (state.isOn && state.selected) {
    if (state.selected.isConnected) {
      placeBox(ui.selectBox, state.selected);
    } else {
      select(null);
    }
  }
  requestAnimationFrame(followSelection);
}

function placeBox(box, element) {
  const rect = element.getBoundingClientRect();
  box.style.translate = `${rect.left}px ${rect.top}px`;
  box.style.width = `${rect.width}px`;
  box.style.height = `${rect.height}px`;
}

// ── added elements ───────────────────────────────────────────────────────────

function addText() {
  const item = createItem('text');
  item.textContent = 'text';
  item.style.font = `32px/1.1 ${FONTS[0].value}`;
  item.style.color = '#000000';
  placeNew(item);
  startEditingText(item);
}

function addBox() {
  const item = createItem('box');
  item.style.width = '200px';
  item.style.height = '120px';
  item.style.background = '#000000';
  placeNew(item);
}

function addImage(file, clientX, clientY) {
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    const item = createItem('image');
    const image = document.createElement('img');
    image.src = reader.result;
    image.draggable = false;
    item.append(image);
    item.style.width = '240px';
    placeNew(item, clientX, clientY);
  });
  reader.readAsDataURL(file);
}

function createItem(kind) {
  const item = document.createElement('div');
  item.className = 'mk-item';
  item.dataset.kind = kind;
  return item;
}

// at the given point (or the middle of the window), in page coordinates
function placeNew(item, clientX = window.innerWidth / 2 - 100, clientY = window.innerHeight / 2 - 50) {
  item.style.left = `${clientX + window.scrollX}px`;
  item.style.top = `${clientY + window.scrollY}px`;
  ui.layer.append(item);
  pushUndo(() => item.remove());
  select(item);
}

function duplicateSelected() {
  const original = state.selected;
  if (!original?.classList.contains('mk-item')) {
    return;
  }
  const copy = original.cloneNode(true);
  const [x, y] = readTranslate(original);
  copy.style.translate = `${x + 20}px ${y + 20}px`;
  original.after(copy);
  pushUndo(() => copy.remove());
  select(copy);
}

// with a point, the cursor goes there; without (a new text), all of it is
// selected to type over
function startEditingText(item, clientX, clientY) {
  stopEditingText();
  state.editingText = item;
  item.contentEditable = 'true';
  item.focus();
  const caret = clientX === undefined ? null : caretAt(clientX, clientY);
  if (caret && item.contains(caret.startContainer)) {
    document.getSelection().removeAllRanges();
    document.getSelection().addRange(caret);
  } else {
    document.getSelection().selectAllChildren(item);
  }
}

// Chrome and Safari have caretRangeFromPoint, Firefox caretPositionFromPoint
function caretAt(clientX, clientY) {
  if (document.caretRangeFromPoint) {
    return document.caretRangeFromPoint(clientX, clientY);
  }
  const position = document.caretPositionFromPoint?.(clientX, clientY);
  if (!position) {
    return null;
  }
  const range = document.createRange();
  range.setStart(position.offsetNode, position.offset);
  return range;
}

function stopEditingText() {
  if (!state.editingText) {
    return;
  }
  state.editingText.contentEditable = 'false';
  state.editingText = null;
}

// ── removing ─────────────────────────────────────────────────────────────────

// added elements go; page elements are only hidden
function deleteSelected() {
  const element = state.selected;
  if (!element) {
    return;
  }
  if (element.classList.contains('mk-item')) {
    const { parentElement, nextSibling } = element;
    element.remove();
    pushUndo(() => parentElement.insertBefore(element, nextSibling));
  } else {
    pushUndo(snapshotStyle(element, ['visibility']));
    element.style.visibility = 'hidden';
  }
  select(null);
}

function resetAll() {
  while (state.undoStack.length > 0) {
    state.undoStack.pop()();
  }
  ui.layer.replaceChildren();
  select(null);
}

// ── undo ─────────────────────────────────────────────────────────────────────

function pushUndo(undo) {
  state.undoStack.push(undo);
}

function undo() {
  state.undoStack.pop()?.();
  if (state.selected && !state.selected.isConnected) {
    select(null);
  }
  renderProperties();
}

/** Returns a function that puts the element's inline style properties back. */
function snapshotStyle(element, properties) {
  const saved = properties.map((property) => [property, element.style.getPropertyValue(property)]);
  return () => {
    for (const [property, value] of saved) {
      element.style.setProperty(property, value);
    }
  };
}

// ── keys, paste, drop ────────────────────────────────────────────────────────

function onKeyDown(event) {
  if (!state.isOn || isTyping(event)) {
    return;
  }
  const command = event.metaKey || event.ctrlKey;
  const handled = command ? onCommandKey(event) : onPlainKey(event);
  if (handled) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function onCommandKey(event) {
  if (event.key === 'z') {
    undo();
    return true;
  }
  if (event.key === 'd') {
    duplicateSelected();
    return true;
  }
  return false;
}

function onPlainKey(event) {
  const step = event.shiftKey ? BIG_NUDGE_PX : NUDGE_PX;
  const nudges = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  if (event.key in nudges && state.selected) {
    nudgeSelected(...nudges[event.key]);
    return true;
  }
  if ((event.key === 'Delete' || event.key === 'Backspace') && state.selected) {
    deleteSelected();
    return true;
  }
  if (event.key === '[') {
    selectParent();
    return true;
  }
  if (event.key === ']') {
    selectChild();
    return true;
  }
  if (event.key === 'Escape') {
    select(null);
    return true;
  }
  return false;
}

function isTyping(event) {
  if (state.editingText) {
    if (event.key === 'Escape') {
      stopEditingText();
      event.preventDefault();
    }
    return true;
  }
  const target = event.target;
  return target.matches?.('input, textarea, select, [contenteditable="true"]');
}

function nudgeSelected(dx, dy) {
  const element = state.selected;
  pushUndo(snapshotStyle(element, ['translate']));
  const [x, y] = readTranslate(element);
  element.style.translate = `${x + dx}px ${y + dy}px`;
}

function onPaste(event) {
  if (!state.isOn || state.editingText) {
    return;
  }
  const file = [...event.clipboardData.files].find((pasted) => pasted.type.startsWith('image/'));
  if (file) {
    event.preventDefault();
    addImage(file);
  }
}

function onFileDragOver(event) {
  if (state.isOn && event.dataTransfer.types.includes('Files')) {
    event.preventDefault();
  }
}

function onFileDrop(event) {
  if (!state.isOn || event.target.closest?.(UI_SELECTOR)) {
    return;
  }
  const images = [...event.dataTransfer.files].filter((file) => file.type.startsWith('image/'));
  if (images.length === 0) {
    return;
  }
  event.preventDefault();
  images.forEach((file, index) => addImage(file, event.clientX + index * 20, event.clientY + index * 20));
}

// ── export ───────────────────────────────────────────────────────────────────

async function exportScreenshot() {
  setStatus('share this tab (Firefox: this window)…');
  document.documentElement.classList.add('mk-capturing');
  try {
    const png = await captureThisTab();
    document.documentElement.classList.remove('mk-capturing');
    const path = await savePng(png);
    const copied = await copyText(path);
    setStatus(`saved ${path}${copied ? ' (path copied)' : ''}`);
  } catch (error) {
    document.documentElement.classList.remove('mk-capturing');
    setStatus(`not exported: ${error.message}`);
  }
}

// one frame of this tab as the browser draws it: the moiré, videos and
// iframes included, which DOM-to-canvas libraries can't do
async function captureThisTab() {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: 'browser' },
    audio: false,
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
  });
  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    await new Promise((resolve) => setTimeout(resolve, CAPTURE_SETTLE_MS));
    const area = pageArea(video.videoWidth, video.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = area.width;
    canvas.height = area.height;
    canvas.getContext('2d').drawImage(video, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}

// A tab capture is the page already. A window capture (Firefox) has the
// browser's toolbars on top (and a sidebar, if open, on the left): the page
// is the bottom-right part, the window's size scaled to the capture's.
function pageArea(capturedWidth, capturedHeight) {
  const pageRatio = window.innerWidth / window.innerHeight;
  if (Math.abs(capturedWidth / capturedHeight - pageRatio) < 0.02) {
    return { x: 0, y: 0, width: capturedWidth, height: capturedHeight };
  }
  const scale = capturedWidth / window.outerWidth;
  const width = Math.min(capturedWidth, Math.round(window.innerWidth * scale));
  const height = Math.min(capturedHeight, Math.round(window.innerHeight * scale));
  return { x: capturedWidth - width, y: capturedHeight - height, width, height };
}

async function savePng(png) {
  const response = await fetch(`/__mockup/save?page=${encodeURIComponent(window.location.pathname)}`, {
    method: 'POST',
    body: png,
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error);
  }
  return result.path;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ── toolbar ──────────────────────────────────────────────────────────────────

function createUi() {
  const root = document.createElement('div');
  root.className = 'mk-toolbar';
  root.dataset.mockupUi = '';
  root.innerHTML = `
    <div class="mk-row">
      <button type="button" class="mk-toggle">mockup</button>
      <span class="mk-tools">
        <button type="button" data-action="text">+ text</button>
        <button type="button" data-action="image">+ image</button>
        <button type="button" data-action="box">+ box</button>
        <button type="button" data-action="undo" title="⌘Z">undo</button>
        <button type="button" data-action="reset">reset</button>
        <button type="button" data-action="export" class="mk-primary">export png</button>
      </span>
    </div>
    <div class="mk-row mk-properties"></div>
    <p class="mk-status" hidden></p>
    <input type="file" accept="image/*" multiple hidden>`;

  const fileInput = root.querySelector('input[type="file"]');
  fileInput.addEventListener('change', () => {
    [...fileInput.files].forEach((file, index) => {
      addImage(file, window.innerWidth / 2 - 120 + index * 20, window.innerHeight / 2 - 80 + index * 20);
    });
    fileInput.value = '';
  });
  const actions = {
    text: addText,
    image: () => fileInput.click(),
    box: addBox,
    undo,
    reset: () => window.confirm('Undo every mockup change on this page?') && resetAll(),
    export: exportScreenshot,
  };
  root.querySelector('.mk-tools').addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    actions[action]?.();
  });

  // added elements, in page coordinates; inside <body>, since Firefox won't
  // edit text outside it
  const layer = document.createElement('div');
  layer.className = 'mk-layer';

  const hoverBox = document.createElement('div');
  hoverBox.className = 'mk-hover';
  hoverBox.dataset.mockupUi = '';
  hoverBox.hidden = true;

  const selectBox = document.createElement('div');
  selectBox.className = 'mk-select';
  selectBox.dataset.mockupUi = '';
  selectBox.hidden = true;
  selectBox.innerHTML = '<span class="mk-handle" title="drag to resize"></span>';

  return {
    root,
    toggle: root.querySelector('.mk-toggle'),
    properties: root.querySelector('.mk-properties'),
    status: root.querySelector('.mk-status'),
    layer,
    hoverBox,
    selectBox,
  };
}

function setStatus(text) {
  ui.status.hidden = !text;
  ui.status.textContent = text;
}

// controls for the selected element: its name, then what fits its kind
function renderProperties() {
  const element = state.selected;
  ui.properties.replaceChildren();
  if (!element) {
    return;
  }
  ui.properties.append(describeElement(element));
  const kind = element.dataset.kind;
  if (kind === 'text') {
    ui.properties.append(
      colorControl(element, 'color'),
      fontControl(element),
      stepButton('A−', () => changeFontSize(element, -4)),
      stepButton('A+', () => changeFontSize(element, 4)),
    );
  } else if (kind === 'box') {
    ui.properties.append(colorControl(element, 'background-color'));
  }
  ui.properties.append(
    opacityControl(element),
    stepButton('front', () => bringToFront(element)),
    stepButton(kind ? 'delete' : 'hide', deleteSelected),
  );
}

function describeElement(element) {
  const label = document.createElement('code');
  if (element.classList.contains('mk-item')) {
    label.textContent = element.dataset.kind;
  } else {
    const id = element.id ? `#${element.id}` : '';
    const firstClass = element.classList[0] ? `.${element.classList[0]}` : '';
    label.textContent = `${element.tagName.toLowerCase()}${id}${firstClass}`;
  }
  label.title = '[ parent · ] child';
  return label;
}

function stepButton(text, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.addEventListener('click', onClick);
  return button;
}

// a field change is one undo step, however far the control is dragged
function styleControl(element, properties, input, applyValue) {
  let restore = null;
  input.addEventListener('focus', () => {
    restore = snapshotStyle(element, properties);
  });
  input.addEventListener('input', () => applyValue(input.value));
  input.addEventListener('change', () => {
    if (restore) {
      pushUndo(restore);
      restore = snapshotStyle(element, properties);
    }
  });
  return input;
}

function colorControl(element, property) {
  const input = document.createElement('input');
  input.type = 'color';
  input.value = toHex(getComputedStyle(element).getPropertyValue(property));
  return styleControl(element, [property], input, (value) => element.style.setProperty(property, value));
}

function fontControl(element) {
  const select = document.createElement('select');
  for (const font of FONTS) {
    select.append(new Option(font.label, font.value));
  }
  const current = firstFamily(element.style.fontFamily);
  select.value = FONTS.find((font) => firstFamily(font.value) === current)?.value ?? FONTS[0].value;
  return styleControl(element, ['font-family'], select, (value) => {
    element.style.fontFamily = value;
  });
}

function opacityControl(element) {
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = '1';
  input.step = '0.05';
  input.value = getComputedStyle(element).opacity;
  input.title = 'opacity';
  return styleControl(element, ['opacity'], input, (value) => {
    element.style.opacity = value;
  });
}

function changeFontSize(element, step) {
  pushUndo(snapshotStyle(element, ['font-size']));
  const size = Number.parseFloat(getComputedStyle(element).fontSize);
  element.style.fontSize = `${Math.max(6, size + step)}px`;
}

// z-index needs a positioned element; relative with no offsets moves nothing
function bringToFront(element) {
  pushUndo(snapshotStyle(element, ['z-index', 'position']));
  if (getComputedStyle(element).position === 'static') {
    element.style.position = 'relative';
  }
  element.style.zIndex = '2147482000';
}

// ── style helpers ────────────────────────────────────────────────────────────

function readTranslate(element) {
  const [x = '0', y = '0'] = element.style.translate.split(' ');
  return [Number.parseFloat(x) || 0, Number.parseFloat(y) || 0];
}

function readScale(element) {
  return Number.parseFloat(element.style.scale) || 1;
}

function firstFamily(fontFamily) {
  return fontFamily.split(',')[0].replace(/["']/g, '').trim();
}

function toHex(color) {
  const channels = color.match(/\d+(\.\d+)?/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
  return `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
}
