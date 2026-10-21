import {
  BUILDABLE, CATEGORY_LABELS, CATEGORY_ORDER, COLONIST_FOOD, COLONIST_O2, COLS, HISTORY_CAP, HUB_CAPACITY, MATERIAL_PER_COLONIST, MAX_TIER, UPGRADE_COST,
  ROOM_DEFS, ROWS, STOCK_CAP, addRoom, coord, dist, housingSlots, isDataSource, nameOf, needsData, needsPower, parseCoord, plantPipes,
  capacityOf, capacityText, reactorLoad, recompute, refundFor, roomAt, roomById, sourcePorts, statsAt, statsOf, typesIn,
  type Category, type LogLine, type Room, type RoomType, type Sample, type State,
} from './sim';
import { asciiChart } from './chart';

/** A change to the map camera or highlight, applied by the UI after the command runs. */
export interface ViewAction {
  /** Multiply the zoom by this, about the centre of the map panel. */
  zoom?: number;
  /** Move the camera by this many cells (positive x is right, positive y is down). */
  pan?: { x: number; y: number };
  /** Return to the fit-everything view. */
  reset?: boolean;
  /** Light up every room of these types and dim the rest; null clears it. Omitted leaves it alone. */
  highlight?: RoomType[] | null;
}

export interface CommandResult {
  lines: LogLine[];
  view?: ViewAction;
  clear?: boolean;
  /** Coordinate to highlight in the map after this command. */
  select?: { x: number; y: number } | null;
  /** Room whose wire and pipe connections stay lit while the rest of the map dims. */
  focus?: { x: number; y: number } | null;
}

interface Args {
  pos: string[];
  flags: Record<string, string>;
  /** Flags that were given without a value. */
  bare: string[];
}

interface Command {
  usage: string;
  summary: string;
  /** What the command does to the colony: changes it, reads it, or only changes the view or terminal. */
  tag: 'action' | 'query' | 'ui';
  /** Flags this command understands, with a short description of their value. */
  flags?: Record<string, string>;
  /** Extra explanation shown only by `help <command>`, so the one-line hint stays short. */
  details?: string;
  run: (s: State, a: Args) => CommandResult;
}

const ok = (text: string): LogLine => ({ kind: 'ok', text });
const info = (text: string): LogLine => ({ kind: 'info', text });
const warn = (text: string): LogLine => ({ kind: 'warn', text });
const err = (text: string): CommandResult => ({ lines: [{ kind: 'err', text }] });

const SPEEDS: Record<string, number> = { '1': 1, '1/2': 0.5, '0.5': 0.5, '1/4': 0.25, '0.25': 0.25 };

/** Short forms accepted for flags. */
const ALIASES: Record<string, string> = { '-loc': '-location', '-l': '-location', '-src': '-from', '-f': '-from', '-t': '-to', '-dest': '-to', '-destination': '-to' };

function parseArgs(tokens: string[]): Args {
  const a: Args = { pos: [], flags: {}, bare: [] };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith('-') && t.length > 1) {
      const name = ALIASES[t] ?? t;
      const next = tokens[i + 1];
      if (next !== undefined && !next.startsWith('-')) { a.flags[name] = next; i++; }
      else a.bare.push(name);
    } else a.pos.push(t);
  }
  return a;
}

function isRoomType(t: string): t is RoomType {
  return (BUILDABLE as string[]).includes(t);
}

const ROOM_TYPES = Object.keys(ROOM_DEFS) as RoomType[];

function isCategory(t: string): t is Category {
  return (CATEGORY_ORDER as string[]).includes(t);
}

/** Categories that have at least one buildable type; empty ones stay hidden until they do. */
const activeCategories = (): Category[] => CATEGORY_ORDER.filter((c) => typesIn(c).length > 0);

/** One line per type in a category: type, label, cost, power draw, radius. Columns size to the longest entry. */
function categoryListing(c: Category): LogLine[] {
  const types = typesIn(c);
  const rows = types.map((t) => {
    const d = ROOM_DEFS[t];
    return [t, d.label, String(d.cost), `draw ${d.draw}`, d.radius ? `radius ${d.radius}` : ''];
  });
  const widths = [0, 1, 2, 3].map((i) => Math.max(...rows.map((r) => r[i].length)));
  return rows.map((r) => info('  ' + r.map((v, i) => (i === 2 ? v.padStart(widths[i]) : v.padEnd(widths[i]))).join('  ').trimEnd()));
}

const categoryNames = () => activeCategories().join(', ');
const ZOOM_STEP = 1.25;
const MAX_ZOOM_STEPS = 10;
const DEFAULT_PAN_CELLS = 2;
const MAX_PAN_CELLS = 50;
/** Pan directions move the camera, so "left" shows what is to the left of the current view. */
const PAN_DIRS: Record<string, { x: number; y: number }> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

/** Parse an optional positive amount; returns the default if absent, null if invalid or too big. */
function amount(t: string | undefined, dflt: number, max: number): number | null {
  if (t === undefined) return dflt;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 && n <= max ? n : null;
}

const cellErr =(t: string) => `"${t}" is not a valid cell. Use a column A-${String.fromCharCode(64 + COLS)} and row 1-${ROWS}, like B4.`;

/** Look up a room from a cell flag, returning either the room or an error result. */
function roomFlag(s: State, a: Args, flag: string): Room | CommandResult {
  const v = a.flags[flag];
  if (!v) return err(`Missing ${flag} <cell>.`);
  const p = parseCoord(v);
  if (!p) return err(cellErr(v));
  const r = roomAt(s, p.x, p.y);
  if (!r) return err(`Nothing is built at ${coord(p.x, p.y)}.`);
  return r;
}
const isResult = (v: Room | CommandResult): v is CommandResult => 'lines' in v;
const at = (r: Room) => `${nameOf(r)} at ${coord(r.x, r.y)}`;

// --- upgrades ----------------------------------------------------------------------

const canUpgrade = (r: Room): boolean => r.tier < MAX_TIER && UPGRADE_COST[r.type] !== undefined;

/** The stat changes of a Mk1 to Mk2 upgrade for a room type, e.g. "output 12 -> 18, radius 4 -> 5". */
function upgradeChanges(type: RoomType): string {
  const a = statsAt(type, 1);
  const b = statsAt(type, 2);
  const names: [keyof typeof a, string][] = [['output', 'output'], ['radius', 'radius'], ['pipes', 'pipes'], ['beds', 'beds'], ['draw', 'power draw']];
  return names.filter(([k]) => a[k] !== b[k]).map(([k, n]) => `${n} ${a[k]} -> ${b[k]}`).join(', ');
}

// --- status reports ----------------------------------------------------------------

const DEFAULT_WINDOW = 30;
/** Ticks of history the trend arrows in plain `status` look back over. */
const TREND_TICKS = 10;

/** Why a room is not working, as the short flags `rooms` prints. Empty when it is fine. */
function roomProblems(r: Room): string[] {
  const flags: string[] = [];
  if (needsPower(r.type) && r.powerFrom === null) flags.push('NOT WIRED');
  else if (needsPower(r.type) && !r.powered) flags.push('NO POWER');
  if (r.type === 'quarters' && r.airFrom === null) flags.push('NOT PIPED');
  else if (r.type === 'quarters' && !r.breathable) flags.push('NO AIR');
  if (needsData(r.type) && r.dataFrom === null) flags.push('NOT NETWORKED');
  else if (needsData(r.type) && !r.data) flags.push('NO DATA');
  return flags;
}

/** Net change per tick of the oxygen or food stock at the current setup, ignoring the stock cap. */
function stockNet(s: State, key: 'oxygen' | 'food'): number {
  const [type, perHead] = key === 'oxygen' ? (['oxygen', COLONIST_O2] as const) : (['garden', COLONIST_FOOD] as const);
  return s.rooms.filter((r) => r.type === type && r.powered).reduce((n, r) => n + statsOf(r).output, 0) - s.crew.length * perHead;
}

/** ▲ / ▼ / – for how a series has moved over the last few ticks. */
function arrow(s: State, key: keyof Sample): string {
  const w = s.history.slice(-(TREND_TICKS + 1));
  if (w.length < 2) return ' ';
  const slope = (w[w.length - 1][key] - w[0][key]) / (w.length - 1);
  return Math.abs(slope) < 0.05 ? '–' : slope > 0 ? '▲' : '▼';
}

/** Everything that is currently wrong, worst first. */
function alerts(s: State): LogLine[] {
  const lines: LogLine[] = [];
  const bad = (text: string) => lines.push(warn(text));
  for (const [key, label] of [['oxygen', 'Oxygen'], ['food', 'Food']] as const) {
    const net = stockNet(s, key);
    if (s[key] <= 0) lines.push({ kind: 'err', text: `${label} is depleted. Net ${signed(net)}/tick.` });
    else if (s[key] < 20) bad(`${label} is low (${s[key].toFixed(0)}). Net ${signed(net)}/tick. See "status ${key}".`);
    else if (net < 0) bad(`${label} is falling ${signed(net)}/tick. ${forecast(s[key], net, STOCK_CAP, label)}`);
  }
  if (s.powerDemand > s.powerSupply) bad(`Power is short: ${s.powerDemand} wanted, ${s.powerSupply} produced. See "status power".`);
  for (const r of s.rooms) {
    const flags = roomProblems(r);
    if (flags.length) bad(`${nameOf(r)} at ${coord(r.x, r.y)}: ${flags.join(', ')}.`);
  }
  const unhoused = s.crew.filter((c) => !c.housed);
  if (unhoused.length) bad(`${plural(unhoused.length, 'colonist')} with no bunk: ${unhoused.map((c) => c.name).join(', ')}.`);
  if (s.happiness < 50) bad(`Happiness is ${s.happiness.toFixed(0)}, below 50, so no new colonists will arrive. See "status happiness".`);
  return lines.length ? [info(`Alerts (${lines.length}):`), ...lines] : [ok('All clear. Nothing needs attention.')];
}

type Report = (s: State, window: Sample[]) => LogLine[];

const signed = (n: number, digits = 1) => (n > 0 ? '+' : '') + n.toFixed(digits);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Heading, graph and a one-line trend summary shared by every category report. */
function graph(title: string, series: number[], top: number, unit = ''): LogLine[] {
  const n = series.length;
  const first = series[0];
  const last = series[n - 1];
  const perTick = (last - first) / (n - 1);
  const word = Math.abs(perTick) < 0.05 ? 'steady' : perTick > 0 ? 'rising' : 'falling';
  return [
    info(`${title}: last ${n} ticks`),
    ...asciiChart(series, top).map(info),
    info(`  Now ${last.toFixed(unit === '' ? 0 : 1)}${unit}, ${word} (${signed(last - first)} over ${n - 1} ticks, ${signed(perTick, 2)}/tick). Low ${Math.min(...series).toFixed(0)}, high ${Math.max(...series).toFixed(0)}.`),
  ];
}

/** How a stock will change at a steady net rate, as a sentence fragment. */
function forecast(stock: number, net: number, cap: number, what: string): string {
  if (net < -0.005 && stock <= 0) return `${what} is depleted.`;
  if (net < -0.005) return `${what} runs out in about ${plural(Math.ceil(stock / -net), 'tick')}.`;
  if (net > 0.005 && stock < cap) return `${what} fills in about ${plural(Math.ceil((cap - stock) / net), 'tick')}.`;
  return stock >= cap ? `${what} is full.` : `${what} is holding steady.`;
}

function stockReport(title: string, key: 'oxygen' | 'food', unitLabel: string, makers: Room[], perHead: number, remedy: string): Report {
  return (s, w) => {
    const working = makers.filter((r) => r.powered);
    const made = working.reduce((n, r) => n + statsOf(r).output, 0);
    const used = s.crew.length * perHead;
    const net = made - used;
    const lines = [
      ...graph(title, w.map((x) => x[key]), STOCK_CAP),
      info(`  Made      ${made.toFixed(1)}/tick  (${working.length} of ${plural(makers.length, unitLabel)} powered)`),
      info(`  Used      ${used.toFixed(1)}/tick  (${plural(s.crew.length, 'colonist')} x ${perHead})`),
      (net < 0 ? warn : info)(`  Net       ${signed(net)}/tick. ${forecast(s[key], net, STOCK_CAP, title)}`),
    ];
    if (working.length < makers.length) lines.push(warn(`  ${plural(makers.length - working.length, unitLabel)} offline. Check "rooms" for NOT WIRED or NO POWER.`));
    if (net < 0) lines.push(warn(`  ${remedy}`));
    return lines;
  };
}

const STATUS_REPORTS: Record<string, Report> = {
  power: (s, w) => {
    const reactors = s.rooms.filter((r) => r.type === 'reactor');
    const top = Math.max(...w.map((x) => Math.max(x.powerDemand, x.powerSupply)), 1);
    const spare = s.powerSupply - s.powerDemand;
    const lines = [
      ...graph('Power wanted', w.map((x) => x.powerDemand), top),
      (spare < 0 ? warn : info)(`  Wanted ${s.powerDemand}, produced ${s.powerSupply} (${plural(reactors.length, 'reactor')}): ${spare < 0 ? `${-spare} short` : `${spare} spare`}.`),
    ];
    for (const rx of reactors) {
      const load = reactorLoad(s, rx.id);
      const fed = s.rooms.filter((r) => r.powerFrom === rx.id).length;
      const out = statsOf(rx).output;
      lines.push((load >= out ? warn : info)(`  ${nameOf(rx)} ${coord(rx.x, rx.y)}  ${load}/${out} used, ${out - load} spare, wired to ${plural(fed, 'room')}`));
    }
    for (const r of s.rooms) {
      if (!needsPower(r.type)) continue;
      const where = `${nameOf(r)} at ${coord(r.x, r.y)}`;
      const src = roomById(s, r.powerFrom);
      if (!src) lines.push(warn(`  ${where}: not wired. Needs ${statsOf(r).draw}.`));
      else if (!r.powered) {
        const far = dist(r, src) > statsOf(src).radius;
        lines.push(warn(`  ${where}: wired to ${coord(src.x, src.y)} but ${far ? 'out of range' : 'that reactor is overloaded'}. Needs ${statsOf(r).draw}.`));
      }
    }
    if (spare < 0) lines.push(warn('  Build another reactor, then wire the unpowered rooms to it.'));
    return lines;
  },
  oxygen: (s, w) => stockReport('Oxygen', 'oxygen', 'oxygen plant', s.rooms.filter((r) => r.type === 'oxygen'), COLONIST_O2,
    'Build and wire another oxygen plant, or upgrade one (each colonist breathes 0.5).')(s, w),
  food: (s, w) => stockReport('Food', 'food', 'garden', s.rooms.filter((r) => r.type === 'garden'), COLONIST_FOOD,
    'Build and wire another garden, or upgrade one (each colonist eats 0.3).')(s, w),
  materials: (s, w) => {
    const income = 1 + s.crew.length * MATERIAL_PER_COLONIST;
    const lines = [
      ...graph('Materials', w.map((x) => x.materials), Math.max(...w.map((x) => x.materials)), ''),
      info(`  Income    ${income.toFixed(1)}/tick  (1 base + ${MATERIAL_PER_COLONIST} per colonist x ${s.crew.length})`),
      info('  Affordable:'),
    ];
    for (const t of BUILDABLE) {
      const cost = ROOM_DEFS[t].cost;
      const wait = Math.ceil((cost - s.materials) / income);
      lines.push((wait > 0 ? warn : info)(`    ${t.padEnd(9)} ${String(cost).padStart(3)}  ${wait <= 0 ? 'now' : `in ${plural(wait, 'tick')}`}`));
    }
    return lines;
  },
  colonists: (s, w) => {
    const slots = housingSlots(s);
    const free = slots.length - s.crew.length;
    const unhoused = s.crew.filter((c) => !c.housed).length;
    const quarters = s.rooms.filter((r) => r.type === 'quarters');
    const idle = quarters.filter((r) => !(r.powered && r.breathable));
    const lines = [
      ...graph('Colonists', w.map((x) => x.colonists), Math.max(...w.map((x) => x.colonists), 1)),
      info(`  Beds      ${slots.length}  (hub ${HUB_CAPACITY} + ${slots.length - HUB_CAPACITY} in ${quarters.length - idle.length} working quarters), ${Math.max(free, 0)} free`),
      (unhoused ? warn : info)(`  Housed    ${s.crew.length - unhoused} of ${s.crew.length}${unhoused ? `, ${unhoused} with no bunk` : ''}`),
    ];
    if (idle.length) lines.push(warn(`  ${plural(idle.length, 'quarters room')} not counted: needs both power and air. See "rooms".`));
    if (free <= 0) lines.push(warn('  Next arrival: blocked, no free beds. Build and connect more quarters.'));
    else if (s.happiness < 50) lines.push(warn(`  Next arrival: paused until happiness reaches 50 (now ${s.happiness.toFixed(0)}).`));
    else lines.push(info(`  Next arrival: in ${plural(s.arrival, 'tick')}.`));
    return lines;
  },
  compute: (s, w) => {
    const racks = s.rooms.filter((r) => r.type === 'rack');
    if (!racks.length) return [warn('No server racks yet. Build one: build rack -location <cell>, then wire it and net it.')];
    const free = s.computeSupply - s.computeUsed;
    const lines = [
      ...graph('Compute capacity', w.map((x) => x.computeSupply), Math.max(...w.map((x) => x.computeSupply), 1)),
      info(`  Capacity  ${s.computeSupply}   used ${s.computeUsed}   free ${free}`),
    ];
    const fixes: Record<string, string> = {
      'NOT WIRED': 'wire -from <reactor> -to <cell>',
      'NO POWER': 'out of range, or its reactor is overloaded',
      'NOT NETWORKED': 'net -from <hub or switch> -to <cell>',
      'NO DATA': 'out of the source\'s data radius, its ports are full, or the source is cut off from the hub',
    };
    for (const r of s.rooms.filter((x) => x.type === 'switch')) {
      const flags = roomProblems(r);
      const here = coord(r.x, r.y);
      const used = sourcePorts(s, r.id);
      if (!flags.length) lines.push(info(`  ${nameOf(r)} ${here}  relaying, ports ${used} / ${statsOf(r).ports}`));
      else lines.push(warn(`  ${nameOf(r)} ${here}  ${flags.join(', ')}: ${flags.map((f) => fixes[f].replace('<cell>', here.toLowerCase())).join('; ')}. Everything behind it has no data.`));
    }
    for (const r of racks) {
      const flags = roomProblems(r);
      const here = coord(r.x, r.y);
      if (!flags.length) lines.push(info(`  ${nameOf(r)} ${here}  online, +${statsOf(r).output}`));
      else lines.push(warn(`  ${nameOf(r)} ${here}  ${flags.join(', ')}: ${flags.map((f) => fixes[f].replace('<cell>', here.toLowerCase())).join('; ')}`));
    }
    if (s.computeUsed > 0 && free <= 0) lines.push(warn('  No free compute. Build another rack.'));
    return lines;
  },
  happiness: (s, w) => {
    const target = 100 * (s.mood.air + s.mood.food + s.mood.housing + s.mood.fun) / 4;
    const parts: [string, number, string][] = [
      ['air', s.mood.air, 'Oxygen stock is low. See "status oxygen".'],
      ['food', s.mood.food, 'Food stock is low. See "status food".'],
      ['housing', s.mood.housing, 'Colonists have no bunk. See "status colonists".'],
      ['fun', s.mood.fun, 'Build lounges near your quarters.'],
    ];
    const weakest = parts.reduce((a, b) => (b[1] < a[1] ? b : a));
    const lines = [
      ...graph('Happiness', w.map((x) => x.happiness), 100),
      info(`  Heading toward ${target.toFixed(0)} (moves 10% of the gap each tick).`),
      ...parts.map(([k, v]) => (v < 0.5 ? warn : info)(`  ${k.padEnd(8)} ${pct(v).padStart(4)}  ${'█'.repeat(Math.round(v * 10)).padEnd(10, '░')}`)),
    ];
    if (weakest[1] < 1) lines.push(warn(`  Weakest: ${weakest[0]}. ${weakest[2]}`));
    if (s.happiness < 50) lines.push(warn('  Below 50: no new colonists will arrive.'));
    return lines;
  },
};

/** Everything `status` accepts as its first argument. */
const STATUS_VIEWS = [...Object.keys(STATUS_REPORTS), 'alerts'];

export const COMMANDS: Record<string, Command> = {
  help: {
    tag: 'query',
    usage: 'help [command]',
    summary: 'List commands, or explain one.',
    run: (_s, { pos: [name] }) => {
      if (name && COMMANDS[name]) {
        const c = COMMANDS[name];
        const flagLines = Object.entries(c.flags ?? {}).map(([f, d]) => info(`    ${f.padEnd(10)} ${d}`));
        return { lines: [info(`${c.usage}\n  ${c.summary}`), ...(c.details ? [info(`  ${c.details}`)] : []), ...flagLines] };
      }
      const w = Math.max(...Object.keys(COMMANDS).map((k) => k.length));
      return { lines: [info('Commands (Tab completes, ↑/↓ recalls history):'), ...Object.entries(COMMANDS).map(([k, c]) => info(`  ${k.padEnd(w)}  ${c.summary}`))] };
    },
  },
  status: {
    tag: 'query',
    usage: `status [${STATUS_VIEWS.join(' | ')}] [-time <ticks>]`,
    summary: 'Colony overview, "alerts" for everything wrong, or a graph and diagnosis of one category over the last 30 ticks.',
    flags: { '-time': `How many ticks of history to graph (2-${HISTORY_CAP}, default ${DEFAULT_WINDOW}).` },
    run: (s, a) => {
      const name = a.pos[0];
      if (name === 'alerts') return { lines: alerts(s) };
      if (name) {
        const report = Object.hasOwn(STATUS_REPORTS, name) ? STATUS_REPORTS[name] : undefined;
        if (!report) return err(`Unknown status option "${name}". Options: ${STATUS_VIEWS.join(', ')}.`);
        const raw = a.flags['-time'];
        const asked = raw === undefined ? DEFAULT_WINDOW : Number(raw);
        if (!Number.isInteger(asked) || asked < 2 || asked > HISTORY_CAP) return err(`-time must be a whole number of ticks from 2 to ${HISTORY_CAP}.`);
        if (s.history.length < 2) return { lines: [warn('Not enough history yet. Try again in a moment.')] };
        const n = Math.min(asked, s.history.length);
        const lines = report(s, s.history.slice(-n));
        if (n < asked) lines.splice(1, 0, warn(`Only ${n} ticks of history so far, so graphing those.`));
        return { lines };
      }
      return {
        lines: [
          info(`Power       ${s.powerDemand} wanted / ${s.powerSupply} produced ${arrow(s, 'powerDemand')}`),
          ...(s.rooms.some((r) => r.type === 'rack') ? [info(`Compute     ${s.computeUsed} used / ${s.computeSupply} capacity ${arrow(s, 'computeSupply')}`)] : []),
          info(`Oxygen      ${s.oxygen.toFixed(0)} ${arrow(s, 'oxygen')}`),
          info(`Food        ${s.food.toFixed(0)} ${arrow(s, 'food')}`),
          info(`Materials   ${Math.floor(s.materials)} ${arrow(s, 'materials')}`),
          info(`Population  ${s.crew.length} ${arrow(s, 'colonists')}`),
          info(`Happiness   ${s.happiness.toFixed(0)} ${arrow(s, 'happiness')}`),
          info(`Arrows show the change over the last ${TREND_TICKS} ticks. Try "status alerts" or "status <category>".`),
        ],
      };
    },
  },
  build: {
    tag: 'action',
    usage: 'build <type> -location <cell>   e.g. build reactor -location B4',
    summary: 'Construct a room. Try "build" alone.',
    details: `Types: ${BUILDABLE.join(', ')}. Categories: ${CATEGORY_ORDER.join(', ')}. Give a category instead of a type to list the types in it.`,
    flags: { '-location': 'Cell to build on (alias -loc, -l).' },
    run: (s, a) => {
      const type = a.pos[0];
      const cell = a.flags['-location'];
      if (!type && !cell) {
        const lines = [info('Categories:')];
        for (const c of activeCategories()) lines.push(info(`  ${c.padEnd(8)} ${plural(typesIn(c).length, 'type')}`));
        lines.push(info('Try: build <category>   or   build <type> -location <cell>'));
        return { lines };
      }
      if (!type) return err('Usage: build <type> -location <cell>   (try "help build")');
      if (!isRoomType(type) && isCategory(type)) {
        if (!typesIn(type).length) return { lines: [warn(`Nothing in ${type} (${CATEGORY_LABELS[type]}) is available yet. Categories with rooms: ${categoryNames()}.`)] };
        return { lines: [info(`${CATEGORY_LABELS[type]} (${type}):`), ...categoryListing(type), info('Build one with: build <type> -location <cell>')] };
      }
      if (!isRoomType(type)) return err(`Unknown room type "${type}". Options: ${BUILDABLE.join(', ')}. Categories: ${categoryNames()}.`);
      if (!cell) return err('Usage: build <type> -location <cell>   (try "help build")');
      const p = parseCoord(cell);
      if (!p) return err(cellErr(cell));
      if (roomAt(s, p.x, p.y)) return err(`${coord(p.x, p.y)} is already occupied.`);
      const def = ROOM_DEFS[type];
      if (s.materials < def.cost) return err(`Not enough materials: ${def.label} costs ${def.cost}, you have ${Math.floor(s.materials)}.`);
      s.materials -= def.cost;
      const room = addRoom(s, type, p.x, p.y);
      recompute(s);
      const here = coord(room.x, room.y);
      const lines = [ok(`Built ${def.label} at ${here} for ${def.cost}.`)];
      if (needsPower(type)) lines.push(warn(`Not wired yet: wire -from <reactor> -to ${here}`));
      if (type === 'quarters') lines.push(warn(`No air yet: pipe -from <oxygen plant> -to ${here}`));
      if (needsData(type)) lines.push(warn(`No data yet: net -from <hub or switch> -to ${here}`));
      return { lines, select: p };
    },
  },
  wire: {
    tag: 'action',
    usage: 'wire -from <reactor> -to <room>',
    summary: 'Run a power line from a reactor to a room within its radius.',
    flags: { '-from': 'Reactor cell (alias -f).', '-to': 'Room that needs power (alias -t).' },
    run: (s, a) => {
      const from = roomFlag(s, a, '-from');
      if (isResult(from)) return from;
      const to = roomFlag(s, a, '-to');
      if (isResult(to)) return to;
      if (from.type !== 'reactor') return err(`${at(from)} is not a reactor.`);
      if (!needsPower(to.type)) return err(`${at(to)} does not use wired power.`);
      if (to.powerFrom === from.id) return err(`${at(to)} is already wired to the reactor at ${coord(from.x, from.y)}.${to.powered ? '' : ' It is not getting power; see "rooms" for why.'}`);
      const d = dist(from, to);
      const { radius, output } = statsOf(from);
      if (d > radius) return err(`Out of range: ${at(to)} is ${d.toFixed(1)} cells from the reactor, and its radius is ${radius}.`);
      const draw = statsOf(to).draw;
      const load = reactorLoad(s, from.id) - (to.powerFrom === from.id && to.powered ? draw : 0);
      if (load + draw > output) return err(`Reactor at ${coord(from.x, from.y)} has ${output - load} spare power, and ${ROOM_DEFS[to.type].label} needs ${draw}. Build another reactor.`);
      const rewired = to.powerFrom !== null && to.powerFrom !== from.id;
      to.powerFrom = from.id;
      recompute(s);
      return { lines: [ok(`${rewired ? 'Rewired' : 'Wired'} ${at(to)} to the reactor at ${coord(from.x, from.y)}.`)], select: { x: to.x, y: to.y } };
    },
  },
  unwire: {
    tag: 'action',
    usage: 'unwire -to <room>',
    summary: 'Cut the power line to a room.',
    flags: { '-to': 'Room to disconnect (alias -t).' },
    run: (s, a) => {
      const to = roomFlag(s, a, '-to');
      if (isResult(to)) return to;
      if (to.powerFrom === null) return err(`${at(to)} has no power line.`);
      to.powerFrom = null;
      recompute(s);
      return { lines: [ok(`Disconnected power to ${at(to)}.`)] };
    },
  },
  pipe: {
    tag: 'action',
    usage: 'pipe -from <oxygen plant> -to <quarters>',
    summary: `Pipe air from an oxygen plant to quarters within its radius (4 per plant, more once upgraded).`,
    flags: { '-from': 'Oxygen plant cell (alias -f).', '-to': 'Quarters cell (alias -t).' },
    run: (s, a) => {
      const from = roomFlag(s, a, '-from');
      if (isResult(from)) return from;
      const to = roomFlag(s, a, '-to');
      if (isResult(to)) return to;
      if (from.type !== 'oxygen') return err(`${at(from)} is not an oxygen plant.`);
      if (to.type !== 'quarters') return err(`${at(to)} does not need piped air.`);
      if (to.airFrom === from.id) return err(`${at(to)} is already piped to the plant at ${coord(from.x, from.y)}.${to.breathable ? '' : ' It is not getting air; see "rooms" for why.'}`);
      const d = dist(from, to);
      const { radius, pipes } = statsOf(from);
      if (d > radius) return err(`Out of range: ${at(to)} is ${d.toFixed(1)} cells away, and the plant's radius is ${radius}.`);
      const used = s.rooms.filter((r) => r.airFrom === from.id && r !== to).length;
      if (used >= pipes) return err(`The plant at ${coord(from.x, from.y)} already feeds ${pipes} rooms. Build another oxygen plant.`);
      const rerouted = to.airFrom !== null && to.airFrom !== from.id;
      to.airFrom = from.id;
      recompute(s);
      return { lines: [ok(`${rerouted ? 'Rerouted' : 'Piped'} air from the plant at ${coord(from.x, from.y)} to ${at(to)}.`)], select: { x: to.x, y: to.y } };
    },
  },
  unpipe: {
    tag: 'action',
    usage: 'unpipe -to <quarters>',
    summary: 'Cut the air pipe to quarters.',
    flags: { '-to': 'Room to disconnect (alias -t).' },
    run: (s, a) => {
      const to = roomFlag(s, a, '-to');
      if (isResult(to)) return to;
      if (to.airFrom === null) return err(`${at(to)} has no air pipe.`);
      to.airFrom = null;
      recompute(s);
      return { lines: [ok(`Disconnected air to ${at(to)}.`)] };
    },
  },
  net: {
    tag: 'action',
    usage: 'net -from <hub or switch> -to <rack or switch>',
    summary: 'Link a rack or switch to the data network. The Command Hub is the root; switches relay.',
    flags: { '-from': 'Data source cell: the hub or a switch (alias -f).', '-to': 'Room that needs data (alias -t).' },
    run: (s, a) => {
      const from = roomFlag(s, a, '-from');
      if (isResult(from)) return from;
      const to = roomFlag(s, a, '-to');
      if (isResult(to)) return to;
      if (!isDataSource(from.type)) return err(`${at(from)} is not a data source.`);
      if (from === to) return err(`${at(to)} cannot be linked to itself.`);
      if (!needsData(to.type)) return err(`${at(to)} does not use a data link.`);
      if (to.dataFrom === from.id) return err(`${at(to)} is already linked to the ${ROOM_DEFS[from.type].label} at ${coord(from.x, from.y)}.${to.data ? '' : ' It is not getting data; see "rooms" for why.'}`);
      const d = dist(from, to);
      const { radius, ports } = statsOf(from);
      if (d > radius) return err(`Out of range: ${at(to)} is ${d.toFixed(1)} cells away, and the data radius of the ${ROOM_DEFS[from.type].label} is ${radius}.`);
      const used = s.rooms.filter((r) => r.dataFrom === from.id && r !== to).length;
      if (used >= ports) return err(`The ${ROOM_DEFS[from.type].label} at ${coord(from.x, from.y)} has no free ports (${ports} of ${ports} in use). Unlink one with "unnet".`);
      const rerouted = to.dataFrom !== null && to.dataFrom !== from.id;
      to.dataFrom = from.id;
      recompute(s);
      return { lines: [ok(`${rerouted ? 'Rerouted' : 'Linked'} data from the ${ROOM_DEFS[from.type].label} at ${coord(from.x, from.y)} to ${at(to)}.`)], select: { x: to.x, y: to.y } };
    },
  },
  unnet: {
    tag: 'action',
    usage: 'unnet -to <rack>',
    summary: 'Cut the data link to a room.',
    flags: { '-to': 'Room to disconnect (alias -t).' },
    run: (s, a) => {
      const to = roomFlag(s, a, '-to');
      if (isResult(to)) return to;
      if (to.dataFrom === null) return err(`${at(to)} has no data link.`);
      to.dataFrom = null;
      recompute(s);
      return { lines: [ok(`Disconnected data to ${at(to)}.`)] };
    },
  },
  upgrade: {
    tag: 'action',
    usage: 'upgrade | upgrade -location <cell>',
    summary: 'List rooms that can be upgraded, or upgrade one from Mk1 to Mk2 in place.',
    flags: { '-location': 'Room to upgrade (alias -loc, -l).' },
    run: (s, a) => {
      if (a.flags['-location'] === undefined && !a.bare.includes('-location')) {
        const list = s.rooms.filter(canUpgrade);
        if (!list.length) return { lines: [info('Nothing can be upgraded.')] };
        const w = Math.max(...list.map((r) => ROOM_DEFS[r.type].label.length));
        return {
          lines: [
            info(`Materials: ${Math.floor(s.materials)}. Upgrade with: upgrade -location <cell>`),
            ...list.map((r) => {
              const cost = UPGRADE_COST[r.type]!;
              const short = cost > s.materials ? `   (need ${Math.ceil(cost - s.materials)} more)` : '';
              return (short ? warn : info)(`  ${coord(r.x, r.y).padEnd(4)} ${ROOM_DEFS[r.type].label.padEnd(w)}  Mk1 -> Mk2   cost ${cost}   ${upgradeChanges(r.type)}${short}`);
            }),
          ],
        };
      }
      const r = roomFlag(s, a, '-location');
      if (isResult(r)) return r;
      const label = ROOM_DEFS[r.type].label;
      const here = coord(r.x, r.y);
      if (r.type === 'hub') return err('The Command Hub cannot be upgraded.');
      if (r.tier >= MAX_TIER) return err(`${label} at ${here} is already Mk${r.tier}. Mk3 is a separate building.`);
      const cost = UPGRADE_COST[r.type];
      if (cost === undefined) return err(`${label} at ${here} cannot be upgraded.`);
      if (s.materials < cost) return err(`Not enough materials: upgrading ${label} costs ${cost}, you have ${Math.floor(s.materials)}.`);
      // An upgrade that raises power draw must fit on the reactor, as wire requires.
      const extra = statsAt(r.type, 2).draw - statsOf(r).draw;
      const src = roomById(s, r.powerFrom);
      if (extra > 0 && r.powered && src) {
        const spare = statsOf(src).output - reactorLoad(s, src.id);
        if (extra > spare) return err(`Reactor at ${coord(src.x, src.y)} has ${spare} spare power, and the upgrade needs ${extra} more. Build another reactor or upgrade this one.`);
      }
      s.materials -= cost;
      r.tier = 2;
      recompute(s);
      const lines = [ok(`Upgraded ${label} at ${here} to Mk2 for ${cost}.`), info(`  ${upgradeChanges(r.type)}`)];
      const problems = roomProblems(r);
      if (problems.length) lines.push(warn(`Still not working (${problems.join(', ')}). Upgrading does not repair it; see "rooms".`));
      return { lines, select: { x: r.x, y: r.y } };
    },
  },
  demolish: {
    tag: 'action',
    usage: 'demolish -location <cell>',
    summary: 'Tear down a room for a 50% refund of everything spent on it (build plus upgrade).',
    flags: { '-location': 'Cell to clear (alias -loc, -l).' },
    run: (s, a) => {
      const r = roomFlag(s, a, '-location');
      if (isResult(r)) return r;
      if (r.type === 'hub') return err('You cannot demolish the Command Hub.');
      const refund = refundFor(r);
      s.rooms = s.rooms.filter((x) => x !== r);
      s.materials += refund;
      recompute(s);
      return { lines: [ok(`Demolished ${at(r)}. Refunded ${refund}.`)], select: null, focus: null };
    },
  },
  inspect: {
    tag: 'query',
    usage: 'inspect -location <cell> | inspect reset',
    summary: 'Details about a room, and its range and connections on the map. "reset" clears the highlight.',
    flags: { '-location': 'Cell to examine (alias -loc, -l).' },
    run: (s, a) => {
      if (a.pos[0] === 'reset' && !a.flags['-location']) return { lines: [ok('Map highlight cleared.')], focus: null };
      // Allow a bare cell too, since clicking the map produces "inspect <cell>".
      const raw = a.flags['-location'] ?? a.pos[0];
      const p = raw ? parseCoord(raw) : null;
      if (!p) return err('Usage: inspect -location <cell>   e.g. inspect -location B4');
      const r = roomAt(s, p.x, p.y);
      if (!r) return { lines: [info(`${coord(p.x, p.y)}: empty space.`)], select: p, focus: null };
      const def = ROOM_DEFS[r.type];
      const st = statsOf(r);
      const lines = [info(`${nameOf(r)} at ${coord(r.x, r.y)}  (#${r.id})`), info(`  ${def.desc}`)];
      if (st.radius) lines.push(info(`  ${isDataSource(r.type) ? 'Data radius' : 'Radius'}: ${st.radius}`));
      if (r.type === 'reactor') {
        const served = s.rooms.filter((x) => x.powerFrom === r.id);
        lines.push(info(`  Output: ${st.output}`), info(`  Load: ${reactorLoad(s, r.id)} / ${st.output}, wired to ${served.length} room(s)`));
      } else if (r.type === 'oxygen') {
        lines.push(info(`  Output: ${st.output} oxygen/tick`), info(`  Pipes: ${plantPipes(s, r.id)} / ${st.pipes} in use`));
      } else if (r.type === 'garden') {
        lines.push(info(`  Output: ${st.output} food/tick`));
      } else if (r.type === 'quarters') {
        lines.push(info(`  Beds: ${st.beds}`));
      }
      if (needsPower(r.type)) lines.push(info(`  Power draw: ${st.draw}`));
      if (canUpgrade(r)) lines.push(info(`  Upgrade: Mk2 for ${UPGRADE_COST[r.type]} (${upgradeChanges(r.type)})`));
      if (needsPower(r.type)) {
        const src = roomById(s, r.powerFrom);
        lines.push(r.powerFrom === null ? warn('  Power: NOT WIRED') : r.powered ? info(`  Power: online (reactor at ${coord(src!.x, src!.y)})`) : warn('  Power: wired, but no supply (out of range or reactor overloaded)'));
      }
      if (r.type === 'quarters') {
        const src = roomById(s, r.airFrom);
        lines.push(r.airFrom === null ? warn('  Air: NOT PIPED') : r.breathable ? info(`  Air: flowing (plant at ${coord(src!.x, src!.y)})`) : warn('  Air: piped, but no supply (plant unpowered, out of range, or full)'));
        lines.push(info(`  Lounges in range: ${r.loungeCount}`));
      } else if (r.type === 'hub') {
        lines.push(info(`  Data ports: ${sourcePorts(s, r.id)} / ${st.ports} in use`));
      } else if (r.type === 'switch') {
        const src = roomById(s, r.dataFrom);
        lines.push(info(`  Data ports: ${sourcePorts(s, r.id)} / ${st.ports} in use`));
        lines.push(r.dataFrom === null ? warn('  Data: NOT NETWORKED') : r.data && r.powered ? info(`  Data: connected to the hub (via ${ROOM_DEFS[src!.type].label} at ${coord(src!.x, src!.y)})`) : warn('  Data: not connected to the hub (no power, out of range, source full, or the source is cut off)'));
      } else if (r.type === 'rack') {
        const src = roomById(s, r.dataFrom);
        lines.push(info(`  Compute: +${st.output} while powered and networked${r.powered && r.data ? ' (online)' : ''}`));
        lines.push(r.dataFrom === null ? warn('  Data: NOT NETWORKED') : r.data ? info(`  Data: linked (${ROOM_DEFS[src!.type].label} at ${coord(src!.x, src!.y)})`) : warn('  Data: linked, but not delivering (out of range, the source has no free ports, or it is cut off from the hub)'));
      }
      return { lines, select: p, focus: p, view: { highlight: null } };
    },
  },
  rooms: {
    tag: 'query',
    usage: 'rooms',
    summary: 'List every room and whether it is working.',
    run: (s) => ({
      lines: s.rooms.map((r) => {
        const flags = roomProblems(r);
        const cap = capacityOf(s, r);
        const l = `  ${coord(r.x, r.y).padEnd(4)} ${nameOf(r)}${cap ? '  ' + capacityText(cap) : ''}${flags.length ? '  [' + flags.join(', ') + ']' : ''}`;
        return flags.length ? warn(l) : { kind: 'info', text: `${l}  `, tag: { text: '[OPERATIONAL]', kind: 'ok' } };
      }),
    }),
  },
  crew: {
    tag: 'query',
    usage: 'crew',
    summary: 'Who is in the colony, and who has a bunk.',
    run: (s) => ({
      lines: [
        info(`Population: ${s.crew.length}`),
        ...s.crew.map((c) => (c.housed ? info : warn)(`  ${c.name.padEnd(12)} ${c.role.padEnd(11)} ${c.housed ? 'housed' : 'NO BUNK'}`)),
      ],
    }),
  },
  speed: {
    tag: 'ui',
    usage: 'speed <1 | 1/2 | 1/4>',
    summary: 'Slow time down. There is no pause.',
    run: (s, { pos: [v] }) => {
      const sp = v !== undefined ? SPEEDS[v] : undefined;
      if (sp === undefined) return err('Usage: speed <1 | 1/2 | 1/4>');
      s.speed = sp;
      return { lines: [ok(`Speed set to ${sp === 1 ? '1x' : sp === 0.5 ? '1/2x' : '1/4x'}.`)] };
    },
  },
  view: {
    tag: 'ui',
    usage: 'view zoom <in|out> [steps] | view pan <up|down|left|right> [cells] | view <room type or category> | view reset',
    summary: 'Zoom, pan, or highlight the map by room type or category. "reset" restores the full view and clears any highlight.',
    run: (s, { pos: [sub, a, b] }) => {
      if (sub === 'reset') return { lines: [ok('View reset.')], view: { reset: true, highlight: null }, focus: null };

      if (sub === 'zoom') {
        if (a !== 'in' && a !== 'out') return err('Usage: view zoom <in|out> [steps]');
        const steps = amount(b, 1, MAX_ZOOM_STEPS);
        if (steps === null) return err(`Steps must be a number from above 0 to ${MAX_ZOOM_STEPS}.`);
        const factor = ZOOM_STEP ** steps;
        return { lines: [ok(`Zoomed ${a}.`)], view: { zoom: a === 'in' ? factor : 1 / factor } };
      }

      if (sub === 'pan') {
        const dir = a ? PAN_DIRS[a] : undefined;
        if (!dir) return err('Usage: view pan <up|down|left|right> [cells]');
        const cells = amount(b, DEFAULT_PAN_CELLS, MAX_PAN_CELLS);
        if (cells === null) return err(`Cells must be a number from above 0 to ${MAX_PAN_CELLS}.`);
        return { lines: [ok(`Panned ${a}.`)], view: { pan: { x: dir.x * cells, y: dir.y * cells } } };
      }

      if (sub) {
        // "view garden" (or "gardens"): light up every room of that type.
        const type = ROOM_TYPES.find((t) => t === sub || t + 's' === sub);
        if (type) {
          const found = s.rooms.filter((r) => r.type === type);
          if (!found.length) return { lines: [warn(`No ${ROOM_DEFS[type].label} built.`)], view: { highlight: null }, focus: null };
          const cells = found.map((r) => coord(r.x, r.y)).join(', ');
          return { lines: [ok(`Highlighting ${found.length} ${ROOM_DEFS[type].label}: ${cells}. "view reset" clears it.`)], view: { highlight: [type] }, focus: null };
        }
        // "view habitat": light up every room in that category.
        if (isCategory(sub)) {
          const types = ROOM_TYPES.filter((t) => ROOM_DEFS[t].category === sub);
          const found = s.rooms.filter((r) => types.includes(r.type));
          if (!found.length) return { lines: [warn(`No ${CATEGORY_LABELS[sub]} rooms built.`)], view: { highlight: null }, focus: null };
          const cells = found.map((r) => coord(r.x, r.y)).join(', ');
          return { lines: [ok(`Highlighting ${found.length} ${CATEGORY_LABELS[sub]} room${found.length === 1 ? '' : 's'}: ${cells}. "view reset" clears it.`)], view: { highlight: types }, focus: null };
        }
        return err(`Unknown view option "${sub}". Try: zoom, pan, reset, a room type (${ROOM_TYPES.join(', ')}) or a category (${categoryNames()}).`);
      }
      return err('Usage: view zoom <in|out> [steps] | view pan <dir> [cells] | view <room type or category> | view reset');
    },
  },
  clear: {
    tag: 'ui',
    usage: 'clear',
    summary: 'Clear the terminal.',
    run: () => ({ lines: [], clear: true }),
  },
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function execute(s: State, line: string): CommandResult {
  const tokens = line.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return { lines: [] };
  const [name, ...rest] = tokens;
  const cmd = COMMANDS[name];
  if (!cmd) return err(`Unknown command "${name}". Type "help".`);
  return cmd.run(s, parseArgs(rest));
}

/**
 * The room a half-typed `build` line would construct, for the map's ghost preview. `at` is the cell
 * from -location (any alias) when it parses, otherwise null. Returns null unless the type is complete.
 */
export function buildPreview(input: string): { type: RoomType; at: { x: number; y: number } | null } | null {
  const [name, ...rest] = input.trim().toLowerCase().split(/\s+/);
  if (name !== 'build') return null;
  const a = parseArgs(rest);
  const type = a.pos[0];
  if (!type || !isRoomType(type)) return null;
  const cell = a.flags['-location'];
  return { type, at: cell ? parseCoord(cell) : null };
}

/**
 * The connection a half-typed `wire` or `pipe` line would make, once both -from and -to are cells
 * holding rooms. `valid` covers room types and range, not spare capacity.
 */
export function linkPreview(s: State, input: string): { kind: 'wire' | 'pipe' | 'net'; from: { x: number; y: number }; to: { x: number; y: number }; valid: boolean } | null {
  const [name, ...rest] = input.trim().toLowerCase().split(/\s+/);
  if (name !== 'wire' && name !== 'pipe' && name !== 'net') return null;
  const a = parseArgs(rest);
  const fp = a.flags['-from'] ? parseCoord(a.flags['-from']) : null;
  const tp = a.flags['-to'] ? parseCoord(a.flags['-to']) : null;
  if (!fp || !tp) return null;
  const from = roomAt(s, fp.x, fp.y);
  const to = roomAt(s, tp.x, tp.y);
  if (!from || !to) return null;
  const srcOk = name === 'wire' ? from.type === 'reactor' : name === 'pipe' ? from.type === 'oxygen' : isDataSource(from.type) && from !== to;
  const dstOk = name === 'wire' ? needsPower(to.type) : name === 'pipe' ? to.type === 'quarters' : needsData(to.type);
  return { kind: name, from: fp, to: tp, valid: srcOk && dstOk && dist(from, to) <= statsOf(from).radius };
}

/** Cells of rooms that make sense as the value of a given flag, for completion. */
function cellsFor(s: State, cmd: string, flag: string): string[] {
  const rooms = s.rooms.filter((r) => {
    if (flag === '-from') return cmd === 'wire' ? r.type === 'reactor' : cmd === 'net' ? isDataSource(r.type) : r.type === 'oxygen';
    if (cmd === 'wire') return needsPower(r.type);
    if (cmd === 'pipe') return r.type === 'quarters';
    if (cmd === 'net') return needsData(r.type);
    if (cmd === 'unwire') return r.powerFrom !== null;
    if (cmd === 'unpipe') return r.airFrom !== null;
    if (cmd === 'unnet') return r.dataFrom !== null;
    if (cmd === 'upgrade') return canUpgrade(r);
    return cmd === 'demolish' ? r.type !== 'hub' : true;
  });
  return rooms.map((r) => coord(r.x, r.y).toLowerCase());
}

/** Candidates for the token currently being typed, plus a usage hint. */
export function suggest(s: State, input: string): { completions: string[]; partial: string; hint: string } {
  const endsSpace = /\s$/.test(input);
  const tokens = input.toLowerCase().split(/\s+/).filter(Boolean);
  const partial = endsSpace ? '' : tokens.pop() ?? '';
  const name = tokens[0];
  const cmd = COMMANDS[name ?? partial];
  const prev = tokens[tokens.length - 1];
  const flagContext = prev?.startsWith('-') ? (ALIASES[prev] ?? prev) : null;
  const usedFlags = new Set(tokens.filter((t) => t.startsWith('-')).map((t) => ALIASES[t] ?? t));

  let options: string[] = [];
  let hint = '';
  if (tokens.length === 0) options = Object.keys(COMMANDS);
  else if (name === 'help') options = Object.keys(COMMANDS);
  else if (name === 'speed') options = ['1', '1/2', '1/4'];
  else if (name === 'status') {
    if (flagContext === '-time') {
      options = ['10', '30', '60', '120'];
      hint = `-time expects a number of ticks, 2 to ${HISTORY_CAP}.`;
    } else {
      options = [...(tokens.length === 1 ? STATUS_VIEWS : []), ...(usedFlags.has('-time') ? [] : ['-time'])];
    }
  } else if (name === 'view') {
    if (tokens.length === 1) options = ['zoom', 'pan', 'reset', ...ROOM_TYPES, ...activeCategories()];
    else if (tokens.length === 2 && tokens[1] === 'zoom') options = ['in', 'out'];
    else if (tokens.length === 2 && tokens[1] === 'pan') options = Object.keys(PAN_DIRS);
  }
  else if (flagContext && COMMANDS[name]?.flags?.[flagContext]) {
    options = cellsFor(s, name, flagContext);
    hint = `${flagContext} expects a cell like B4. ${options.length ? 'Valid: ' + options.join(' ') : ''}`;
  } else if (name === 'build' && tokens.length === 1) {
    options = [...activeCategories(), ...BUILDABLE];
    hint = BUILDABLE.map((t) => `${t}(${ROOM_DEFS[t].cost})`).join('  ');
  } else if (COMMANDS[name]?.flags) {
    options = Object.keys(COMMANDS[name].flags!).filter((f) => !usedFlags.has(f));
    if (name === 'inspect' && tokens.length === 1) options.push('reset');
  }

  const completions = options.filter((o) => o.startsWith(partial) && o !== partial);
  if (!hint) {
    if (cmd) hint = `${cmd.usage} — ${cmd.summary}`;
    else if (completions.length) hint = completions.join('  ');
  }
  return { completions, partial, hint };
}
