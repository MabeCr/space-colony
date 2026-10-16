import { COLS, ROOM_DEFS, ROWS, coord, dist, needsPower, roomAt, roomById, type RoomType, type State } from './sim';

export interface View {
  selected: { x: number; y: number } | null;
  hover: { x: number; y: number } | null;
  /** Inspected room: its wires and pipes stay lit and everything unconnected dims. */
  focus: { x: number; y: number } | null;
  /** Room type being typed into a build command, for ghost preview. */
  ghost: RoomType | null;
}

interface Geometry {
  cell: number;
  ox: number;
  oy: number;
}

const stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.2 + 0.2, p: Math.random() * 6 }));

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private geo: Geometry = { cell: 40, ox: 0, oy: 0 };
  private w = 0;
  private h = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement!);
    this.resize();
  }

  private resize(): void {
    const box = this.canvas.parentElement!.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.w = box.width;
    this.h = box.height;
    this.canvas.width = Math.floor(box.width * dpr);
    this.canvas.height = Math.floor(box.height * dpr);
    this.canvas.style.width = `${box.width}px`;
    this.canvas.style.height = `${box.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pad = 28;
    const cell = Math.max(16, Math.floor(Math.min((box.width - pad * 2) / COLS, (box.height - pad * 2) / ROWS)));
    this.geo = { cell, ox: Math.floor((box.width - cell * COLS) / 2), oy: Math.floor((box.height - cell * ROWS) / 2) };
  }

  cellAt(clientX: number, clientY: number): { x: number; y: number } | null {
    const b = this.canvas.getBoundingClientRect();
    const x = Math.floor((clientX - b.left - this.geo.ox) / this.geo.cell);
    const y = Math.floor((clientY - b.top - this.geo.oy) / this.geo.cell);
    return x >= 0 && x < COLS && y >= 0 && y < ROWS ? { x, y } : null;
  }

  private center(x: number, y: number): [number, number] {
    const { cell, ox, oy } = this.geo;
    return [ox + (x + 0.5) * cell, oy + (y + 0.5) * cell];
  }

  draw(s: State, v: View, t: number): void {
    const { ctx } = this;
    const { cell, ox, oy } = this.geo;
    ctx.clearRect(0, 0, this.w, this.h);

    for (const st of stars) {
      ctx.globalAlpha = 0.25 + 0.25 * Math.sin(t / 900 + st.p);
      ctx.fillStyle = '#cfd8ff';
      ctx.fillRect(st.x * this.w, st.y * this.h, st.r, st.r);
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(14, 18, 34, 0.85)';
    ctx.fillRect(ox, oy, cell * COLS, cell * ROWS);
    ctx.strokeStyle = 'rgba(122, 162, 247, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= COLS; i++) { ctx.moveTo(ox + i * cell + 0.5, oy); ctx.lineTo(ox + i * cell + 0.5, oy + ROWS * cell); }
    for (let j = 0; j <= ROWS; j++) { ctx.moveTo(ox, oy + j * cell + 0.5); ctx.lineTo(ox + COLS * cell, oy + j * cell + 0.5); }
    ctx.stroke();

    ctx.fillStyle = 'rgba(160, 170, 210, 0.55)';
    ctx.font = '11px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < COLS; i++) ctx.fillText(String.fromCharCode(65 + i), ox + (i + 0.5) * cell, oy - 12);
    for (let j = 0; j < ROWS; j++) ctx.fillText(String(j + 1), ox - 14, oy + (j + 0.5) * cell);

    // Range ring for the selected / hovered room, or ghost for a pending build.
    const focus = v.hover ?? v.selected;
    const focusRoom = focus ? roomAt(s, focus.x, focus.y) : undefined;
    if (v.ghost && v.hover && !focusRoom) this.ring(v.hover.x, v.hover.y, ROOM_DEFS[v.ghost].radius, ROOM_DEFS[v.ghost].color);
    else if (focusRoom && ROOM_DEFS[focusRoom.type].radius) this.ring(focusRoom.x, focusRoom.y, ROOM_DEFS[focusRoom.type].radius, ROOM_DEFS[focusRoom.type].color);

    // Wires (amber) and pipes (cyan). Working links animate; broken ones are dim red.
    // With a focused room, its own links and their far ends stay lit; the rest dims.
    const fr = v.focus ? roomAt(s, v.focus.x, v.focus.y) : undefined;
    const lit = new Set<number>();
    if (fr) {
      lit.add(fr.id);
      for (const r of s.rooms) {
        if (r.id === fr.id) { if (r.powerFrom !== null) lit.add(r.powerFrom); if (r.airFrom !== null) lit.add(r.airFrom); }
        if (r.powerFrom === fr.id || r.airFrom === fr.id) lit.add(r.id);
      }
    }
    const DIM = 0.22;
    ctx.lineWidth = 1.5;
    for (const r of s.rooms) {
      const wire = roomById(s, r.powerFrom);
      const plant = r.type === 'quarters' ? roomById(s, r.airFrom) : undefined;
      const touches = (a?: { id: number }) => !!fr && !!a && (a.id === fr.id || r.id === fr.id);
      if (wire) {
        const on = !fr || touches(wire);
        ctx.globalAlpha = on ? 1 : DIM;
        ctx.lineWidth = fr && on ? 2.5 : 1.5;
        this.link(wire, r, r.powered, 'rgba(247, 185, 85, 0.65)', t);
      }
      if (plant) {
        const on = !fr || touches(plant);
        ctx.globalAlpha = on ? 1 : DIM;
        ctx.lineWidth = fr && on ? 2.5 : 1.5;
        this.link(plant, r, r.breathable, 'rgba(90, 209, 230, 0.65)', t, 3);
      }
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);

    // Rooms.
    const pulse = 0.5 + 0.5 * Math.sin(t / 220);
    for (const r of s.rooms) {
      const def = ROOM_DEFS[r.type];
      const needPower = needsPower(r.type);
      const noPower = needPower && !r.powered;
      const noAir = r.type === 'quarters' && !r.breathable;
      const dead = noPower || noAir;
      const x = ox + r.x * cell + 3;
      const y = oy + r.y * cell + 3;
      const sz = cell - 6;
      const base = fr && !lit.has(r.id) ? DIM : 1;
      ctx.globalAlpha = (dead ? 0.55 : 1) * base;
      ctx.fillStyle = def.color + '26';
      ctx.strokeStyle = dead ? `rgba(255, 90, 90, ${0.5 + 0.5 * pulse})` : def.color;
      ctx.lineWidth = 2;
      roundRect(ctx, x, y, sz, sz, 6);
      ctx.fill();
      ctx.stroke();
      ctx.save();
      ctx.translate(x + sz / 2, y + sz / 2);
      drawIcon(ctx, r.type, sz * 0.36, def.color, t, !dead);
      ctx.restore();
      ctx.globalAlpha = base;
      // Badges for what's missing: a bolt for power, a droplet for air.
      let bx = x + sz - 7;
      if (noPower) { badge(ctx, bx, y + 7, 'bolt', '#f7b955'); bx -= 14; }
      if (noAir) badge(ctx, bx, y + 7, 'drop', '#5ad1e6');
      ctx.globalAlpha = 1;
    }

    if (v.selected) this.box(v.selected.x, v.selected.y, '#ffffff', 0.9);
    if (v.hover) {
      this.box(v.hover.x, v.hover.y, '#7aa2f7', 0.7);
      ctx.fillStyle = 'rgba(8, 10, 20, 0.85)';
      const room = roomAt(s, v.hover.x, v.hover.y);
      const label = `${coord(v.hover.x, v.hover.y)}${room ? ' ' + ROOM_DEFS[room.type].label : ''}`;
      ctx.font = '12px ui-monospace, Consolas, monospace';
      const tw = ctx.measureText(label).width + 12;
      const [cx, cy] = this.center(v.hover.x, v.hover.y);
      const lx = Math.min(Math.max(cx - tw / 2, 4), this.w - tw - 4);
      ctx.fillRect(lx, cy - cell / 2 - 22, tw, 18);
      ctx.fillStyle = '#e6ebff';
      ctx.fillText(label, lx + tw / 2, cy - cell / 2 - 13);
    }
  }

  private link(a: { x: number; y: number }, b: { x: number; y: number }, working: boolean, color: string, t: number, dash = 5): void {
    const { ctx } = this;
    const [ax, ay] = this.center(a.x, a.y);
    const [bx, by] = this.center(b.x, b.y);
    ctx.strokeStyle = working ? color : 'rgba(255, 90, 90, 0.4)';
    ctx.setLineDash(working ? [dash, 5] : [2, 6]);
    ctx.lineDashOffset = working ? -t / 80 : 0;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  }

  private ring(cx: number, cy: number, radius: number, color: string): void {
    const { ctx } = this;
    const { cell, ox, oy } = this.geo;
    if (!radius) return;
    const [px, py] = this.center(cx, cy);
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, cell * COLS, cell * ROWS);
    ctx.clip();
    ctx.beginPath();
    ctx.arc(px, py, radius * cell, 0, Math.PI * 2);
    ctx.fillStyle = color + '18';
    ctx.fill();
    ctx.strokeStyle = color + '88';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    // Light up the cells that count as "in range".
    ctx.fillStyle = color + '14';
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (dist({ x, y }, { x: cx, y: cy }) <= radius) ctx.fillRect(ox + x * cell + 1, oy + y * cell + 1, cell - 1, cell - 1);
    }
  }

  private box(x: number, y: number, color: string, alpha: number): void {
    const { ctx } = this;
    const { cell, ox, oy } = this.geo;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(ox + x * cell + 1, oy + y * cell + 1, cell - 2, cell - 2);
    ctx.globalAlpha = 1;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draw a room's icon centred on the current origin; r is its half-size in pixels. */
function drawIcon(ctx: CanvasRenderingContext2D, type: RoomType, r: number, color: string, t: number, active: boolean): void {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.5, r * 0.14);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const spin = active ? t / 1200 : 0;
  switch (type) {
    case 'hub': { // hexagon with a signal dot and antenna
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i + Math.PI / 6; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, r * 0.15, r * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, r * 0.15); ctx.lineTo(0, -r * 0.55); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -r * 0.55, r * 0.35, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
      break;
    }
    case 'reactor': { // atom: nucleus and three orbits
      ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.rotate(Math.PI / 3 * i + spin);
        ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case 'oxygen': { // spinning fan in a ring
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      ctx.save();
      ctx.rotate(spin * 3);
      for (let i = 0; i < 3; i++) {
        ctx.rotate((Math.PI * 2) / 3);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(r * 0.9, -r * 0.1, r * 0.55, -r * 0.6);
        ctx.quadraticCurveTo(r * 0.2, -r * 0.4, 0, 0);
        ctx.fill();
      }
      ctx.restore();
      break;
    }
    case 'garden': { // sprout: stem, two leaves, soil line
      ctx.beginPath(); ctx.moveTo(0, r); ctx.lineTo(0, -r * 0.1); ctx.stroke();
      for (const d of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, r * 0.1);
        ctx.quadraticCurveTo(d * r * 0.9, r * 0.1, d * r * 0.85, -r * 0.7);
        ctx.quadraticCurveTo(d * r * 0.1, -r * 0.5, 0, r * 0.1);
        ctx.fill();
      }
      ctx.beginPath(); ctx.moveTo(-r * 0.8, r); ctx.lineTo(r * 0.8, r); ctx.stroke();
      break;
    }
    case 'quarters': { // bed: headboard, mattress, pillow
      ctx.beginPath(); ctx.moveTo(-r, -r * 0.7); ctx.lineTo(-r, r * 0.7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-r, r * 0.3); ctx.lineTo(r, r * 0.3); ctx.lineTo(r, r * 0.7); ctx.stroke();
      ctx.fillRect(-r * 0.15, -r * 0.25, r * 1.15, r * 0.5);
      ctx.beginPath(); ctx.arc(-r * 0.5, -r * 0.05, r * 0.22, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'rec': { // star
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (Math.PI / 5) * i;
        const rad = i % 2 === 0 ? r : r * 0.45;
        ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      ctx.closePath(); ctx.fill();
      break;
    }
  }
}

function badge(ctx: CanvasRenderingContext2D, x: number, y: number, kind: 'bolt' | 'drop', color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#0b0f1e';
  ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ff6b6b';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  if (kind === 'bolt') { ctx.moveTo(1.5, -4); ctx.lineTo(-2.5, 0.5); ctx.lineTo(0, 0.5); ctx.lineTo(-1.5, 4); ctx.lineTo(2.5, -0.5); ctx.lineTo(0, -0.5); }
  else { ctx.moveTo(0, -4); ctx.quadraticCurveTo(3.5, 0.5, 0, 3.5); ctx.quadraticCurveTo(-3.5, 0.5, 0, -4); }
  ctx.closePath(); ctx.fill();
  ctx.restore();
}
