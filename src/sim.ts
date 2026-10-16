export const COLS = 16;
export const ROWS = 10;

export type RoomType = 'hub' | 'reactor' | 'oxygen' | 'garden' | 'quarters' | 'rec';

export interface RoomDef {
  label: string;
  color: string;
  cost: number;
  /** Power drawn per tick (0 for none). */
  draw: number;
  /** Radius (in cells) of this room's area of effect, 0 if none. */
  radius: number;
  desc: string;
}

export const ROOM_DEFS: Record<RoomType, RoomDef> = {
  hub: { label: 'Command Hub', color: '#7aa2f7', cost: 0, draw: 0, radius: 0, desc: 'Your starting room. Houses 4 colonists on emergency cots.' },
  reactor: { label: 'Reactor', color: '#f7b955', cost: 40, draw: 0, radius: 4, desc: 'Produces 12 power. Use "wire" to connect it to rooms within its radius.' },
  oxygen: { label: 'Oxygen Plant', color: '#5ad1e6', cost: 30, draw: 3, radius: 4, desc: 'Needs power. Use "pipe" to send air to up to 4 quarters within its radius.' },
  garden: { label: 'Hydroponics', color: '#7ad97a', cost: 25, draw: 2, radius: 0, desc: 'Needs power. Grows 2 food per tick.' },
  quarters: { label: 'Quarters', color: '#c19cf5', cost: 20, draw: 1, radius: 0, desc: 'Needs a power wire and an air pipe. Houses 2 colonists, and draws new arrivals.' },
  rec: { label: 'Rec Room', color: '#f58cb4', cost: 30, draw: 2, radius: 3, desc: 'Needs power. Quarters within its radius get a happiness boost.' },
};

export const BUILDABLE: RoomType[] = ['reactor', 'oxygen', 'garden', 'quarters', 'rec'];

export const REACTOR_OUTPUT = 12;
export const OXYGEN_PIPES = 4;
const OXYGEN_OUTPUT = 3;
const GARDEN_OUTPUT = 2;
const COLONIST_O2 = 0.5;
const COLONIST_FOOD = 0.3;
const MATERIAL_PER_COLONIST = 0.5;
const STOCK_CAP = 100;
const HUB_CAPACITY = 4;
const QUARTERS_CAPACITY = 2;
const ARRIVAL_TICKS = 15;
const NAMES = ['Abara', 'Bishop', 'Castellan', 'Dunmore', 'Esperanza', 'Fenwick', 'Gallo', 'Hartigan', 'Ilves', 'Jovanovic', 'Kaito', 'Lumley', 'Moreau', 'Nakamura', 'Orlov', 'Pemberton', 'Quill', 'Rasmussen', 'Soto', 'Thackeray', 'Umar', 'Vance', 'Wren', 'Xiang', 'Yilmaz', 'Zeller'];
const ROLES = ['Engineer', 'Medic', 'Botanist', 'Pilot', 'Cook', 'Technician', 'Mechanic', 'Scientist'];

export interface Room {
  id: number;
  type: RoomType;
  x: number;
  y: number;
  /** Reactor this room has been wired to (the link persists even if it stops working). */
  powerFrom: number | null;
  /** Oxygen plant this room has been piped to (quarters only). */
  airFrom: number | null;
  /** True when the wire is valid, in range, and the reactor has capacity. */
  powered: boolean;
  /** Quarters/hub only: air is actually reaching the room. */
  breathable: boolean;
  /** Quarters/hub only: number of powered rec rooms in range. */
  recCount: number;
}

export interface Colonist {
  name: string;
  role: string;
  housed: boolean;
}

export type LogKind = 'info' | 'ok' | 'warn' | 'err';
export interface LogLine {
  kind: LogKind;
  text: string;
}

export interface State {
  tick: number;
  speed: number;
  rooms: Room[];
  nextId: number;
  crew: Colonist[];
  /** Ticks until the next colonist arrives; only counts down while there is room and morale is high. */
  arrival: number;
  materials: number;
  oxygen: number;
  food: number;
  happiness: number;
  powerSupply: number;
  powerDemand: number;
  /** Per-component happiness breakdown, each 0..1. */
  mood: { air: number; food: number; housing: number; fun: number };
}

export function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function roomAt(s: State, x: number, y: number): Room | undefined {
  return s.rooms.find((r) => r.x === x && r.y === y);
}

export function roomById(s: State, id: number | null): Room | undefined {
  return id === null ? undefined : s.rooms.find((r) => r.id === id);
}

export const needsPower = (t: RoomType): boolean => ROOM_DEFS[t].draw > 0;

export function newState(): State {
  const cx = Math.floor(COLS / 2);
  const cy = Math.floor(ROWS / 2);
  const s: State = {
    tick: 0,
    speed: 1,
    rooms: [],
    nextId: 1,
    arrival: ARRIVAL_TICKS,
    crew: [
      { name: 'Okafor', role: 'Engineer', housed: true },
      { name: 'Lindqvist', role: 'Medic', housed: true },
      { name: 'Reyes', role: 'Botanist', housed: true },
      { name: 'Tam', role: 'Pilot', housed: true },
    ],
    materials: 100,
    oxygen: 70,
    food: 70,
    happiness: 60,
    powerSupply: 0,
    powerDemand: 0,
    mood: { air: 1, food: 1, housing: 1, fun: 0 },
  };
  addRoom(s, 'hub', cx, cy);
  const reactor = addRoom(s, 'reactor', cx - 1, cy);
  const plant = addRoom(s, 'oxygen', cx + 1, cy);
  plant.powerFrom = reactor.id;
  recompute(s);
  return s;
}

export function addRoom(s: State, type: RoomType, x: number, y: number): Room {
  const r: Room = { id: s.nextId++, type, x, y, powerFrom: null, airFrom: null, powered: type === 'reactor' || type === 'hub', breathable: false, recCount: 0 };
  s.rooms.push(r);
  return r;
}

/** Power currently drawn from a reactor by rooms wired to it and working. */
export function reactorLoad(s: State, reactorId: number): number {
  return s.rooms.filter((r) => r.powerFrom === reactorId && r.powered).reduce((n, r) => n + ROOM_DEFS[r.type].draw, 0);
}

/** Number of quarters currently receiving air from an oxygen plant. */
export function plantPipes(s: State, plantId: number): number {
  return s.rooms.filter((r) => r.airFrom === plantId && r.breathable).length;
}

/** Work out which wires and pipes are actually working. */
export function recompute(s: State): void {
  const reactors = s.rooms.filter((r) => r.type === 'reactor');
  const load = new Map<number, number>(reactors.map((r) => [r.id, 0]));
  let demand = 0;

  for (const r of s.rooms) {
    if (!needsPower(r.type)) continue;
    const draw = ROOM_DEFS[r.type].draw;
    demand += draw;
    r.powered = false;
    const src = reactors.find((x) => x.id === r.powerFrom);
    if (!src) { r.powerFrom = null; continue; }
    if (dist(r, src) > ROOM_DEFS.reactor.radius) continue;
    if ((load.get(src.id) ?? 0) + draw > REACTOR_OUTPUT) continue;
    load.set(src.id, (load.get(src.id) ?? 0) + draw);
    r.powered = true;
  }
  s.powerSupply = reactors.length * REACTOR_OUTPUT;
  s.powerDemand = demand;

  const pipes = new Map<number, number>();
  const recs = s.rooms.filter((r) => r.type === 'rec' && r.powered);
  for (const r of s.rooms) {
    if (r.type !== 'quarters' && r.type !== 'hub') continue;
    if (r.type === 'hub') {
      r.breathable = true;
    } else {
      r.breathable = false;
      const plant = s.rooms.find((x) => x.type === 'oxygen' && x.id === r.airFrom);
      if (!plant) r.airFrom = null;
      else if (plant.powered && dist(r, plant) <= ROOM_DEFS.oxygen.radius && (pipes.get(plant.id) ?? 0) < OXYGEN_PIPES) {
        pipes.set(plant.id, (pipes.get(plant.id) ?? 0) + 1);
        r.breathable = true;
      }
    }
    r.recCount = recs.filter((f) => dist(r, f) <= ROOM_DEFS.rec.radius).length;
  }
}

function housingSlots(s: State): Room[] {
  const slots: Room[] = [];
  for (const r of s.rooms) {
    if (r.type === 'hub') for (let i = 0; i < HUB_CAPACITY; i++) slots.push(r);
    else if (r.type === 'quarters' && r.powered && r.breathable) for (let i = 0; i < QUARTERS_CAPACITY; i++) slots.push(r);
  }
  return slots;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function newColonist(s: State): Colonist {
  const used = new Set(s.crew.map((c) => c.name));
  const free = NAMES.filter((n) => !used.has(n));
  const name = free.length ? free[Math.floor(Math.random() * free.length)] : `Colonist-${s.crew.length + 1}`;
  return { name, role: ROLES[Math.floor(Math.random() * ROLES.length)], housed: true };
}

/** Advance the simulation one tick. Returns log lines for anything noteworthy. */
export function step(s: State): LogLine[] {
  const log: LogLine[] = [];
  const before = new Map(s.rooms.map((r) => [r.id, [r.powered, r.breathable]]));
  recompute(s);
  for (const r of s.rooms) {
    const [wasPowered, wasBreathable] = before.get(r.id) ?? [r.powered, r.breathable];
    const where = `${ROOM_DEFS[r.type].label} at ${coord(r.x, r.y)}`;
    if (needsPower(r.type) && r.powerFrom !== null) {
      if (wasPowered && !r.powered) log.push({ kind: 'warn', text: `${where} lost power.` });
      if (!wasPowered && r.powered) log.push({ kind: 'ok', text: `${where} is online.` });
    }
    if (r.type === 'quarters' && wasBreathable && !r.breathable) log.push({ kind: 'warn', text: `${where} lost its air supply.` });
  }

  s.tick++;
  s.materials += 1 + s.crew.length * MATERIAL_PER_COLONIST;

  const o2Made = s.rooms.filter((r) => r.type === 'oxygen' && r.powered).length * OXYGEN_OUTPUT;
  const foodMade = s.rooms.filter((r) => r.type === 'garden' && r.powered).length * GARDEN_OUTPUT;
  const oxyBefore = s.oxygen;
  const foodBefore = s.food;
  s.oxygen = clamp(s.oxygen + o2Made - s.crew.length * COLONIST_O2, 0, STOCK_CAP);
  s.food = clamp(s.food + foodMade - s.crew.length * COLONIST_FOOD, 0, STOCK_CAP);
  if (oxyBefore >= 20 && s.oxygen < 20) log.push({ kind: 'warn', text: 'Oxygen reserves below 20.' });
  if (foodBefore >= 20 && s.food < 20) log.push({ kind: 'warn', text: 'Food reserves below 20.' });
  if (oxyBefore > 0 && s.oxygen === 0) log.push({ kind: 'err', text: 'OXYGEN DEPLETED. The colony is struggling to breathe.' });

  const slots = housingSlots(s);
  if (slots.length > s.crew.length && s.happiness >= 50 && --s.arrival <= 0) {
    s.arrival = ARRIVAL_TICKS;
    const c = newColonist(s);
    s.crew.push(c);
    log.push({ kind: 'ok', text: `${c.name} (${c.role}) has joined the colony. Population: ${s.crew.length}.` });
  }
  s.crew.forEach((c, i) => {
    const was = c.housed;
    c.housed = i < slots.length;
    if (was && !c.housed) log.push({ kind: 'warn', text: `${c.name} has no bunk.` });
  });
  const housedSlots = slots.slice(0, s.crew.length);

  const funPerColonist = housedSlots.map((r) => clamp(0.15 + r.recCount * 0.45, 0, 1));
  s.mood = {
    air: clamp(s.oxygen / 30, 0, 1),
    food: clamp(s.food / 30, 0, 1),
    housing: s.crew.length ? housedSlots.length / s.crew.length : 1,
    fun: s.crew.length ? funPerColonist.reduce((a, b) => a + b, 0) / s.crew.length : 0,
  };
  const target = 100 * (s.mood.air + s.mood.food + s.mood.housing + s.mood.fun) / 4;
  s.happiness += (target - s.happiness) * 0.1;
  return log;
}

export function coord(x: number, y: number): string {
  return `${String.fromCharCode(65 + x)}${y + 1}`;
}

export function parseCoord(t: string): { x: number; y: number } | null {
  const m = /^([a-z])(\d{1,2})$/i.exec(t);
  if (!m) return null;
  const x = m[1].toUpperCase().charCodeAt(0) - 65;
  const y = parseInt(m[2], 10) - 1;
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return null;
  return { x, y };
}
