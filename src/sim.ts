export const COLS = 16;
export const ROWS = 10;

export type RoomType = 'hub' | 'reactor' | 'oxygen' | 'garden' | 'quarters' | 'lounge' | 'rack' | 'switch';

/** Filing and browsing groups for room types. Never changes how a room is built. */
export type Category = 'power' | 'life' | 'food' | 'habitat' | 'industry' | 'compute' | 'defense' | 'maint';

/** Typed names, in display order. They must not collide with a room type name. */
export const CATEGORY_ORDER: Category[] = ['power', 'life', 'food', 'habitat', 'industry', 'compute', 'defense', 'maint'];

export const CATEGORY_LABELS: Record<Category, string> = {
  power: 'Power', life: 'Life support', food: 'Food', habitat: 'Habitation', industry: 'Industry', compute: 'Compute', defense: 'Defense', maint: 'Maintenance',
};

export interface RoomDef {
  label: string;
  /** Null for rooms that are never listed for building (the hub). */
  category: Category | null;
  color: string;
  cost: number;
  /** Power drawn per tick (0 for none). */
  draw: number;
  /** Radius (in cells) of this room's area of effect, 0 if none. */
  radius: number;
  desc: string;
}

export const ROOM_DEFS: Record<RoomType, RoomDef> = {
  hub: { category: null, label: 'Command Hub', color: '#7aa2f7', cost: 0, draw: 0, radius: 0, desc: 'Your starting room. Houses 4 colonists on emergency cots. Root of the data network: use "net" to link racks within its radius.' },
  reactor: { category: 'power', label: 'Reactor', color: '#f7b955', cost: 40, draw: 0, radius: 4, desc: 'Produces 12 power. Use "wire" to connect it to rooms within its radius.' },
  oxygen: { category: 'life', label: 'Oxygen Plant', color: '#5ad1e6', cost: 30, draw: 3, radius: 4, desc: 'Needs power. Use "pipe" to send air to up to 4 quarters within its radius.' },
  garden: { category: 'food', label: 'Hydroponics', color: '#7ad97a', cost: 25, draw: 2, radius: 0, desc: 'Needs power. Grows 2 food per tick.' },
  quarters: { category: 'habitat', label: 'Quarters', color: '#c19cf5', cost: 20, draw: 1, radius: 0, desc: 'Needs a power wire and an air pipe. Houses 2 colonists, and draws new arrivals.' },
  rack: { category: 'compute', label: 'Server Rack', color: '#d9e86b', cost: 35, draw: 2, radius: 0, desc: 'Needs power and a data link. Produces 4 compute capacity. Use "wire" for power and "net" for data.' },
  switch: { category: 'compute', label: 'Network Switch', color: '#ff8f6b', cost: 20, draw: 1, radius: 4, desc: 'Needs power and a data link from the hub or another switch. Relays data to racks and switches within its radius (4 ports). Use "net" to link rooms from it.' },
  lounge: { category: 'habitat', label: 'Lounge', color: '#f58cb4', cost: 30, draw: 2, radius: 3, desc: 'Needs power. Quarters within its radius get a happiness boost.' },
};

export const BUILDABLE: RoomType[] = ['reactor', 'oxygen', 'garden', 'quarters', 'lounge', 'rack', 'switch'];

/** Buildable room types in a category, in build order. */
export const typesIn = (c: Category): RoomType[] => BUILDABLE.filter((t) => ROOM_DEFS[t].category === c);

for (const c of CATEGORY_ORDER) {
  if (c in ROOM_DEFS) throw new Error(`Category "${c}" collides with a room type name.`);
}

/** Tiers a room can reach with `upgrade`. Mk3 is a separate building, not a tier. */
export const MAX_TIER = 2;

/** Everything that changes with a room's tier. A field is 0 when a room has no such property. */
export interface TierStats {
  /** Power drawn per tick. */
  draw: number;
  /** Radius (in cells) of the room's area of effect. */
  radius: number;
  /** Reactor: power produced. Oxygen plant: oxygen per tick. Hydroponics: food per tick. */
  output: number;
  /** Oxygen plant: how many quarters it can pipe to. */
  pipes: number;
  /** Quarters: beds. */
  beds: number;
  /** Data source: how many rooms it can link to. */
  ports: number;
}

/** Mk1 values that are not already in ROOM_DEFS. The hub's radius is its data radius. */
const MK1_EXTRA: Partial<Record<RoomType, Partial<TierStats>>> = {
  hub: { radius: 5, ports: 6 },
  reactor: { output: 12 },
  rack: { output: 4 },
  switch: { ports: 4 },
  oxygen: { output: 3, pipes: 4 },
  garden: { output: 2 },
  quarters: { beds: 2 },
};

/** What an upgrade to Mk2 changes (placeholder numbers). Anything not listed stays as it was. */
const MK2_CHANGES: Partial<Record<RoomType, Partial<TierStats>>> = {
  reactor: { output: 18, radius: 5 },
  oxygen: { pipes: 6, output: 4, draw: 4 },
  garden: { output: 3, draw: 3 },
  quarters: { beds: 3 },
  lounge: { radius: 4 },
  rack: { output: 6, draw: 3 },
};

/** Materials to upgrade from Mk1 to Mk2 (placeholder). Types without an entry cannot be upgraded. */
export const UPGRADE_COST: Partial<Record<RoomType, number>> = { reactor: 25, oxygen: 20, garden: 15, quarters: 12, lounge: 18, rack: 20 };

const statsFor = (type: RoomType, tier: number): TierStats => ({
  draw: ROOM_DEFS[type].draw,
  radius: ROOM_DEFS[type].radius,
  output: 0,
  pipes: 0,
  beds: 0,
  ports: 0,
  ...MK1_EXTRA[type],
  ...(tier >= 2 ? MK2_CHANGES[type] : undefined),
});

/** Stats of a room at its current tier. Staffing bonuses (a later slice) belong on top of this, not in it. */
export const statsOf = (r: { type: RoomType; tier: number }): TierStats => statsFor(r.type, r.tier);

/** Stats of a room type at a tier, for listings that have no room yet. */
export const statsAt = statsFor;

/** "Reactor", or "Reactor Mk2" once upgraded. Mk1 omits the suffix. */
export const nameOf = (r: { type: RoomType; tier: number }): string => ROOM_DEFS[r.type].label + (r.tier > 1 ? ` Mk${r.tier}` : '');

/** Total materials spent on a room: its build cost plus the upgrade, if it has one. */
export const spentOn = (r: { type: RoomType; tier: number }): number => ROOM_DEFS[r.type].cost + (r.tier > 1 ? UPGRADE_COST[r.type] ?? 0 : 0);

/** Demolishing refunds half of everything spent on the room, rounded down. */
export const refundFor = (r: { type: RoomType; tier: number }): number => Math.floor(spentOn(r) / 2);

export const COLONIST_O2 = 0.5;
export const COLONIST_FOOD = 0.3;
export const MATERIAL_PER_COLONIST = 0.5;
export const STOCK_CAP = 100;
export const HUB_CAPACITY = 4;
export const ARRIVAL_TICKS = 15;
const NAMES = ['Abara', 'Bishop', 'Castellan', 'Dunmore', 'Esperanza', 'Fenwick', 'Gallo', 'Hartigan', 'Ilves', 'Jovanovic', 'Kaito', 'Lumley', 'Moreau', 'Nakamura', 'Orlov', 'Pemberton', 'Quill', 'Rasmussen', 'Soto', 'Thackeray', 'Umar', 'Vance', 'Wren', 'Xiang', 'Yilmaz', 'Zeller'];
const ROLES = ['Engineer', 'Medic', 'Botanist', 'Pilot', 'Cook', 'Technician', 'Mechanic', 'Scientist'];

export interface Room {
  id: number;
  type: RoomType;
  /** 1 for Mk1, 2 for Mk2. */
  tier: number;
  x: number;
  y: number;
  /** Reactor this room has been wired to (the link persists even if it stops working). */
  powerFrom: number | null;
  /** Oxygen plant this room has been piped to (quarters only). */
  airFrom: number | null;
  /** Hub (or switch) this room has been linked to for data (the link persists even if it stops working). */
  dataFrom: number | null;
  /** True when the data link is valid, in range, and the source has a free port. */
  data: boolean;
  /** True when the wire is valid, in range, and the reactor has capacity. */
  powered: boolean;
  /** Quarters/hub only: air is actually reaching the room. */
  breathable: boolean;
  /** Quarters/hub only: number of powered lounges in range. */
  loungeCount: number;
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
  /** Optional coloured suffix shown after the text, e.g. a status like [OPERATIONAL]. */
  tag?: { text: string; kind: LogKind };
}

/** One tick's worth of the totals the `status` graphs plot. */
export interface Sample {
  oxygen: number;
  food: number;
  materials: number;
  colonists: number;
  happiness: number;
  powerSupply: number;
  powerDemand: number;
  computeSupply: number;
  computeUsed: number;
}

/** How many ticks of history are kept for `status` graphs. */
export const HISTORY_CAP = 300;

export interface State {
  tick: number;
  /** Oldest first; the last entry is the current tick. */
  history: Sample[];
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
  /** Compute capacity: the sum of working racks (powered and networked). */
  computeSupply: number;
  /** Compute reserved by research, surveys and scripts. Nothing reserves any yet. */
  computeUsed: number;
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

/** Rooms that need a data link to work (racks for now; turrets and Mk3 rooms later). */
export const needsData = (t: RoomType): boolean => t === 'rack' || t === 'switch';

/** Rooms that can feed a data link: the hub (the root) and network switches (relays). */
export const isDataSource = (t: RoomType): boolean => t === 'hub' || t === 'switch';

export function newState(): State {
  const cx = Math.floor(COLS / 2);
  const cy = Math.floor(ROWS / 2);
  const s: State = {
    tick: 0,
    history: [],
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
    computeSupply: 0,
    computeUsed: 0,
    mood: { air: 1, food: 1, housing: 1, fun: 0 },
  };
  addRoom(s, 'hub', cx, cy);
  const reactor = addRoom(s, 'reactor', cx - 1, cy);
  const plant = addRoom(s, 'oxygen', cx + 1, cy);
  plant.powerFrom = reactor.id;
  recompute(s);
  record(s);
  return s;
}

function record(s: State): void {
  s.history.push({ oxygen: s.oxygen, food: s.food, materials: s.materials, colonists: s.crew.length, happiness: s.happiness, powerSupply: s.powerSupply, powerDemand: s.powerDemand, computeSupply: s.computeSupply, computeUsed: s.computeUsed });
  if (s.history.length > HISTORY_CAP) s.history.shift();
}

export function addRoom(s: State, type: RoomType, x: number, y: number): Room {
  const r: Room = { id: s.nextId++, type, tier: 1, x, y, powerFrom: null, airFrom: null, dataFrom: null, data: false, powered: type === 'reactor' || type === 'hub', breathable: false, loungeCount: 0 };
  s.rooms.push(r);
  return r;
}

/** Power currently drawn from a reactor by rooms wired to it and working. */
export function reactorLoad(s: State, reactorId: number): number {
  return s.rooms.filter((r) => r.powerFrom === reactorId && r.powered).reduce((n, r) => n + statsOf(r).draw, 0);
}

/** Number of rooms linked to a data source (recorded links, working or not). */
export function sourcePorts(s: State, sourceId: number): number {
  return s.rooms.filter((r) => r.dataFrom === sourceId).length;
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
    const draw = statsOf(r).draw;
    demand += draw;
    r.powered = false;
    const src = reactors.find((x) => x.id === r.powerFrom);
    if (!src) { r.powerFrom = null; continue; }
    if (dist(r, src) > statsOf(src).radius) continue;
    if ((load.get(src.id) ?? 0) + draw > statsOf(src).output) continue;
    load.set(src.id, (load.get(src.id) ?? 0) + draw);
    r.powered = true;
  }
  s.powerSupply = reactors.reduce((n, x) => n + statsOf(x).output, 0);
  s.powerDemand = demand;

  // Data links. A link works when its source is online (the hub, or a switch that is powered and has
  // its own working link back to the hub), the room is in range, and the source has a free port.
  // Sources come online in passes, so a switch cut off from the hub, or two switches linked to
  // each other, never work.
  const ports = new Map<number, number>();
  let compute = 0;
  const consumers = s.rooms.filter((r) => needsData(r.type));
  for (const r of consumers) {
    r.data = false;
    if (r.dataFrom !== null && !s.rooms.some((x) => isDataSource(x.type) && x.id === r.dataFrom)) r.dataFrom = null;
  }
  for (let changed = true; changed;) {
    changed = false;
    for (const r of consumers) {
      if (r.data) continue;
      const src = s.rooms.find((x) => x.id === r.dataFrom);
      if (!src || src === r) continue;
      const online = src.type === 'hub' || (src.powered && src.data);
      if (!online || dist(r, src) > statsOf(src).radius || (ports.get(src.id) ?? 0) >= statsOf(src).ports) continue;
      ports.set(src.id, (ports.get(src.id) ?? 0) + 1);
      r.data = true;
      changed = true;
    }
  }
  for (const r of s.rooms) if (r.type === 'rack' && r.powered && r.data) compute += statsOf(r).output;
  s.computeSupply = compute;

  const pipes = new Map<number, number>();
  const lounges = s.rooms.filter((r) => r.type === 'lounge' && r.powered);
  for (const r of s.rooms) {
    if (r.type !== 'quarters' && r.type !== 'hub') continue;
    if (r.type === 'hub') {
      r.breathable = true;
    } else {
      r.breathable = false;
      const plant = s.rooms.find((x) => x.type === 'oxygen' && x.id === r.airFrom);
      if (!plant) r.airFrom = null;
      else if (plant.powered && dist(r, plant) <= statsOf(plant).radius && (pipes.get(plant.id) ?? 0) < statsOf(plant).pipes) {
        pipes.set(plant.id, (pipes.get(plant.id) ?? 0) + 1);
        r.breathable = true;
      }
    }
    r.loungeCount = lounges.filter((f) => dist(r, f) <= statsOf(f).radius).length;
  }
}

export function housingSlots(s: State): Room[] {
  const slots: Room[] = [];
  for (const r of s.rooms) {
    if (r.type === 'hub') for (let i = 0; i < HUB_CAPACITY; i++) slots.push(r);
    else if (r.type === 'quarters' && r.powered && r.breathable) for (let i = 0; i < statsOf(r).beds; i++) slots.push(r);
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
    const where = `${nameOf(r)} at ${coord(r.x, r.y)}`;
    if (needsPower(r.type) && r.powerFrom !== null) {
      if (wasPowered && !r.powered) log.push({ kind: 'warn', text: `${where} lost power.` });
      if (!wasPowered && r.powered) log.push({ kind: 'ok', text: `${where} is online.` });
    }
    if (r.type === 'quarters' && wasBreathable && !r.breathable) log.push({ kind: 'warn', text: `${where} lost its air supply.` });
  }

  s.tick++;
  s.materials += 1 + s.crew.length * MATERIAL_PER_COLONIST;

  const made = (type: RoomType) => s.rooms.filter((r) => r.type === type && r.powered).reduce((n, r) => n + statsOf(r).output, 0);
  const o2Made = made('oxygen');
  const foodMade = made('garden');
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

  const funPerColonist = housedSlots.map((r) => clamp(0.15 + r.loungeCount * 0.45, 0, 1));
  s.mood = {
    air: clamp(s.oxygen / 30, 0, 1),
    food: clamp(s.food / 30, 0, 1),
    housing: s.crew.length ? housedSlots.length / s.crew.length : 1,
    fun: s.crew.length ? funPerColonist.reduce((a, b) => a + b, 0) / s.crew.length : 0,
  };
  const target = 100 * (s.mood.air + s.mood.food + s.mood.housing + s.mood.fun) / 4;
  s.happiness += (target - s.happiness) * 0.1;
  record(s);
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
