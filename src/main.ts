import './style.css';
import { COLS, ROWS, newState, step, coord, type LogLine } from './sim';
import { buildPreview, execute, linkPreview, suggest, type ViewAction } from './commands';
import { Renderer, type View } from './render';

const BASE_TICK_MS = 1000;

const state = newState();
const view: View = { selected: null, hover: null, focus: null, ghost: null, highlight: null, linkGhost: null };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const out = $('out');
const input = $<HTMLInputElement>('in');
const hint = $('hint');
const fillHint = $('fillhint');
const hud = $('hud');
const canvas = $<HTMLCanvasElement>('map');
const renderer = new Renderer(canvas);

/** True when the terminal is scrolled to (or near) the bottom, so new output should follow along. */
const atBottom = () => out.scrollHeight - out.scrollTop - out.clientHeight < 24;

function print(lines: LogLine[], forceScroll = false): void {
  if (!lines.length) return;
  const follow = forceScroll || atBottom();
  for (const l of lines) {
    const el = document.createElement('div');
    el.className = `line ${l.kind}`;
    el.textContent = l.text;
    if (l.tag) {
      const tag = document.createElement('span');
      tag.className = `line ${l.tag.kind}`;
      tag.textContent = l.tag.text;
      el.appendChild(tag);
    }
    out.appendChild(el);
  }
  if (follow) out.scrollTop = out.scrollHeight;
}

function echo(text: string): void {
  const el = document.createElement('div');
  el.className = 'line echo';
  el.textContent = `> ${text}`;
  out.appendChild(el);
}

// --- input handling ---------------------------------------------------------
const history: string[] = [];
let histIdx = 0;

const ARROWS: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

input.addEventListener('keydown', (e) => {
  if (e.shiftKey && ARROWS[e.key]) {
    // Shift+arrows walk the map cursor; plain arrows stay with history.
    e.preventDefault();
    const [dx, dy] = ARROWS[e.key];
    const from = view.selected ?? { x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) };
    view.selected = view.selected
      ? { x: Math.min(COLS - 1, Math.max(0, from.x + dx)), y: Math.min(ROWS - 1, Math.max(0, from.y + dy)) }
      : from;
    view.hover = null;
    updateHint();
  } else if (e.shiftKey && e.key === 'Enter') {
    // Shift+Enter drops the cursor's cell into the command being typed, like a map click.
    e.preventDefault();
    if (view.selected) fillCell(view.selected);
  } else if (e.key === 'Enter') {
    const text = input.value;
    input.value = '';
    if (text.trim()) {
      history.push(text);
      echo(text);
      const res = execute(state, text);
      if (res.clear) out.innerHTML = '';
      print(res.lines, true);
      out.scrollTop = out.scrollHeight;
      if (res.select !== undefined) view.selected = res.select;
      if (res.focus !== undefined) view.focus = res.focus;
      if (res.view) applyView(res.view);
    }
    histIdx = history.length;
    updateHint();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    input.value = '';
    histIdx = history.length;
    updateHint();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (histIdx > 0) input.value = history[--histIdx];
    updateHint();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    input.value = histIdx < history.length - 1 ? history[++histIdx] : '';
    histIdx = Math.min(histIdx, history.length);
    updateHint();
  } else if (e.key === 'Tab') {
    e.preventDefault();
    const { completions, partial } = suggest(state, input.value);
    if (!completions.length) return;
    const common = commonPrefix(completions);
    const head = input.value.slice(0, input.value.length - partial.length);
    input.value = head + (completions.length === 1 ? common + ' ' : common);
    updateHint();
  }
});
input.addEventListener('input', updateHint);
document.addEventListener('click', () => { if (!getSelection()?.toString()) input.focus(); });

function applyView(a: ViewAction): void {
  if (a.reset) renderer.resetView();
  if (a.zoom) renderer.zoomCenter(a.zoom);
  if (a.pan) renderer.panCells(a.pan.x, a.pan.y);
  if (a.highlight !== undefined) view.highlight = a.highlight;
}

function commonPrefix(xs: string[]): string {
  let p = xs[0];
  for (const x of xs) while (!x.startsWith(p)) p = p.slice(0, -1);
  return p;
}

function updateHint(): void {
  hint.textContent = suggest(state, input.value).hint || ' ';
  // Preview what Shift+Enter would type, when the cursor is somewhere and it would change the line.
  const next = view.selected ? filledLine(view.selected) : null;
  fillHint.textContent = next && next !== input.value.trim().toLowerCase() ? `⇧↵  ${next}` : ' ';
  view.ghost = buildPreview(input.value);
  view.linkGhost = linkPreview(state, input.value);
}

// --- map interaction: clicks move the cursor; Shift+Enter types it into the command ---
// Drag to pan, wheel to zoom about the pointer, double-click to reset the view.
const DRAG_THRESHOLD = 4;
let drag: { x: number; y: number; moved: boolean } | null = null;
let justDragged = false;

canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) drag = { x: e.clientX, y: e.clientY, moved: false };
});
window.addEventListener('mousemove', (e) => {
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < DRAG_THRESHOLD) return;
  drag.moved = true;
  canvas.classList.add('panning');
  renderer.panBy(e.clientX - drag.x, e.clientY - drag.y);
  drag.x = e.clientX;
  drag.y = e.clientY;
});
window.addEventListener('mouseup', () => {
  // The click event fires right after mouseup; flag it so a pan does not also move the cursor.
  justDragged = !!drag?.moved;
  drag = null;
  canvas.classList.remove('panning');
  if (justDragged) setTimeout(() => { justDragged = false; }, 0);
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  renderer.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
  view.hover = renderer.cellAt(e.clientX, e.clientY);
}, { passive: false });
canvas.addEventListener('dblclick', () => renderer.resetView());

canvas.addEventListener('mousemove', (e) => { if (!drag?.moved) view.hover = renderer.cellAt(e.clientX, e.clientY); });
canvas.addEventListener('mouseleave', () => { view.hover = null; });
canvas.addEventListener('click', (e) => {
  if (justDragged) return;
  const c = renderer.cellAt(e.clientX, e.clientY);
  if (!c) return;
  // Clicking only moves the cursor; Shift+Enter is what types the cell into the command.
  view.selected = c;
  input.focus();
  updateHint();
});

/** The command line as it would read with this cell filled in, the way the current command expects. */
function filledLine(c: { x: number; y: number }): string {
  const cell = coord(c.x, c.y).toLowerCase();
  const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const verb = words[0];
  // Drop an existing flag (and its value) so the new cell can replace it.
  const without = (flag: string) => {
    const i = words.indexOf(flag);
    return i < 0 ? words : [...words.slice(0, i), ...words.slice(i + 2)];
  };
  if (verb === 'build' && words.length >= 2) return [...without('-location'), '-location', cell].join(' ');
  if (verb === 'wire' || verb === 'pipe' || verb === 'net') {
    // First fill is -from, the next is -to; once both are set, fills replace -to.
    const flag = words.includes('-from') && !words.includes('-to') ? '-to' : words.includes('-to') ? '-to' : '-from';
    return [...without(flag), flag, cell].join(' ');
  }
  if (verb === 'unwire' || verb === 'unpipe' || verb === 'unnet') return [...without('-to'), '-to', cell].join(' ');
  if (verb === 'demolish') return `demolish -location ${cell}`;
  if (verb === 'upgrade') return `upgrade -location ${cell}`;
  if (!verb || verb === 'inspect') return `inspect -location ${cell}`;
  return input.value.trim().toLowerCase();
}

/** Put a cell into the command line and select it. */
function fillCell(c: { x: number; y: number }): void {
  input.value = filledLine(c);
  view.selected = c;
  input.focus();
  updateHint();
}

// --- HUD --------------------------------------------------------------------
function chip(label: string, value: string, level: 'ok' | 'warn' | 'bad' = 'ok'): string {
  return `<div class="chip ${level}"><span class="k">${label}</span><span class="v">${value}</span></div>`;
}

function updateHud(): void {
  const s = state;
  const lvl = (v: number, lo: number, mid: number) => (v < lo ? 'bad' : v < mid ? 'warn' : 'ok');
  const secs = s.tick;
  const clock = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  const speed = s.speed === 1 ? '1x' : s.speed === 0.5 ? '1/2x' : '1/4x';
  hud.innerHTML =
    chip('Power', `${s.powerDemand}/${s.powerSupply}`, s.powerDemand > s.powerSupply ? 'bad' : 'ok') +
    (s.rooms.some((r) => r.type === 'rack') ? chip('Compute', `${s.computeUsed}/${s.computeSupply}`, s.computeUsed > s.computeSupply ? 'bad' : s.computeSupply === 0 ? 'warn' : 'ok') : '') +
    chip('Oxygen', s.oxygen.toFixed(0), lvl(s.oxygen, 15, 35)) +
    chip('Food', s.food.toFixed(0), lvl(s.food, 15, 35)) +
    chip('Materials', String(Math.floor(s.materials))) +
    chip('Colonists', String(s.crew.length)) +
    chip('Happiness', s.happiness.toFixed(0), lvl(s.happiness, 30, 55)) +
    chip('Time', `${clock} @ ${speed}`);
}

// --- main loop: real-time ticks, slowable but never pausable -----------------
let last = performance.now();
let acc = 0;
function frame(now: number): void {
  acc += (now - last) * state.speed;
  last = now;
  while (acc >= BASE_TICK_MS) {
    acc -= BASE_TICK_MS;
    print(step(state));
  }
  updateHud();
  renderer.draw(state, view, now);
  requestAnimationFrame(frame);
}

print([
  { kind: 'info', text: 'STATION SHELL v0.1 — all systems answer to the command line.' },
  { kind: 'info', text: 'You have 4 colonists, a reactor, and an oxygen plant. Time is running; it will not pause.' },
  { kind: 'info', text: 'Every building needs power. Build it, then wire it:' },
  { kind: 'info', text: '  build garden -location e6' },
  { kind: 'info', text: '  wire -from h6 -to e6' },
  { kind: 'info', text: 'Quarters also need air (pipe). New colonists arrive when there are free beds. Type "help" for more.' },
]);
updateHint();
input.focus();
requestAnimationFrame(frame);
