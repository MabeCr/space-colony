import {
  BUILDABLE, COLS, OXYGEN_PIPES, ROOM_DEFS, ROWS, REACTOR_OUTPUT, addRoom, coord, dist, needsPower, parseCoord, plantPipes,
  reactorLoad, recompute, roomAt, roomById,
  type LogLine, type Room, type RoomType, type State,
} from './sim';

export interface CommandResult {
  lines: LogLine[];
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
  /** Flags this command understands, with a short description of their value. */
  flags?: Record<string, string>;
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

const cellErr = (t: string) => `"${t}" is not a valid cell. Use a column A-${String.fromCharCode(64 + COLS)} and row 1-${ROWS}, like B4.`;

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
const at = (r: Room) => `${ROOM_DEFS[r.type].label} at ${coord(r.x, r.y)}`;

export const COMMANDS: Record<string, Command> = {
  help: {
    usage: 'help [command]',
    summary: 'List commands, or explain one.',
    run: (_s, { pos: [name] }) => {
      if (name && COMMANDS[name]) {
        const c = COMMANDS[name];
        const flagLines = Object.entries(c.flags ?? {}).map(([f, d]) => info(`    ${f.padEnd(10)} ${d}`));
        return { lines: [info(`${c.usage}\n  ${c.summary}`), ...flagLines] };
      }
      const w = Math.max(...Object.keys(COMMANDS).map((k) => k.length));
      return { lines: [info('Commands (Tab completes, ↑/↓ recalls history):'), ...Object.entries(COMMANDS).map(([k, c]) => info(`  ${k.padEnd(w)}  ${c.summary}`))] };
    },
  },
  status: {
    usage: 'status',
    summary: 'Resource and happiness overview.',
    run: (s) => ({
      lines: [
        info(`Power       ${s.powerDemand} wanted / ${s.powerSupply} produced`),
        info(`Oxygen      ${s.oxygen.toFixed(0)}`),
        info(`Food        ${s.food.toFixed(0)}`),
        info(`Materials   ${Math.floor(s.materials)}`),
        info(`Population  ${s.crew.length}`),
        info(`Happiness   ${s.happiness.toFixed(0)}  (air ${pct(s.mood.air)}, food ${pct(s.mood.food)}, housing ${pct(s.mood.housing)}, fun ${pct(s.mood.fun)})`),
      ],
    }),
  },
  build: {
    usage: 'build <type> -location <cell>   e.g. build reactor -location B4',
    summary: `Construct a room. Types: ${BUILDABLE.join(', ')}.`,
    flags: { '-location': 'Cell to build on (alias -loc, -l).' },
    run: (s, a) => {
      const type = a.pos[0];
      const cell = a.flags['-location'];
      if (!type || !cell) return err('Usage: build <type> -location <cell>   (try "help build")');
      if (!isRoomType(type)) return err(`Unknown room type "${type}". Options: ${BUILDABLE.join(', ')}.`);
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
      return { lines, select: p };
    },
  },
  wire: {
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
      const d = dist(from, to);
      if (d > ROOM_DEFS.reactor.radius) return err(`Out of range: ${at(to)} is ${d.toFixed(1)} cells from the reactor, and its radius is ${ROOM_DEFS.reactor.radius}.`);
      const load = reactorLoad(s, from.id) - (to.powerFrom === from.id && to.powered ? ROOM_DEFS[to.type].draw : 0);
      const draw = ROOM_DEFS[to.type].draw;
      if (load + draw > REACTOR_OUTPUT) return err(`Reactor at ${coord(from.x, from.y)} has ${REACTOR_OUTPUT - load} spare power, and ${ROOM_DEFS[to.type].label} needs ${draw}. Build another reactor.`);
      const rewired = to.powerFrom !== null && to.powerFrom !== from.id;
      to.powerFrom = from.id;
      recompute(s);
      return { lines: [ok(`${rewired ? 'Rewired' : 'Wired'} ${at(to)} to the reactor at ${coord(from.x, from.y)}.`)], select: { x: to.x, y: to.y } };
    },
  },
  unwire: {
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
    usage: 'pipe -from <oxygen plant> -to <quarters>',
    summary: `Pipe air from an oxygen plant to quarters within its radius (max ${OXYGEN_PIPES} per plant).`,
    flags: { '-from': 'Oxygen plant cell (alias -f).', '-to': 'Quarters cell (alias -t).' },
    run: (s, a) => {
      const from = roomFlag(s, a, '-from');
      if (isResult(from)) return from;
      const to = roomFlag(s, a, '-to');
      if (isResult(to)) return to;
      if (from.type !== 'oxygen') return err(`${at(from)} is not an oxygen plant.`);
      if (to.type !== 'quarters') return err(`${at(to)} does not need piped air.`);
      const d = dist(from, to);
      if (d > ROOM_DEFS.oxygen.radius) return err(`Out of range: ${at(to)} is ${d.toFixed(1)} cells away, and the plant's radius is ${ROOM_DEFS.oxygen.radius}.`);
      const used = s.rooms.filter((r) => r.airFrom === from.id && r !== to).length;
      if (used >= OXYGEN_PIPES) return err(`The plant at ${coord(from.x, from.y)} already feeds ${OXYGEN_PIPES} rooms. Build another oxygen plant.`);
      const rerouted = to.airFrom !== null && to.airFrom !== from.id;
      to.airFrom = from.id;
      recompute(s);
      return { lines: [ok(`${rerouted ? 'Rerouted' : 'Piped'} air from the plant at ${coord(from.x, from.y)} to ${at(to)}.`)], select: { x: to.x, y: to.y } };
    },
  },
  unpipe: {
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
  demolish: {
    usage: 'demolish -location <cell>',
    summary: 'Tear down a room for a 50% refund.',
    flags: { '-location': 'Cell to clear (alias -loc, -l).' },
    run: (s, a) => {
      const r = roomFlag(s, a, '-location');
      if (isResult(r)) return r;
      if (r.type === 'hub') return err('You cannot demolish the Command Hub.');
      const refund = Math.floor(ROOM_DEFS[r.type].cost / 2);
      s.rooms = s.rooms.filter((x) => x !== r);
      s.materials += refund;
      recompute(s);
      return { lines: [ok(`Demolished ${at(r)}. Refunded ${refund}.`)], select: null, focus: null };
    },
  },
  inspect: {
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
      const lines = [info(`${def.label} at ${coord(r.x, r.y)}  (#${r.id})`), info(`  ${def.desc}`)];
      if (def.radius) lines.push(info(`  Radius: ${def.radius}`));
      if (r.type === 'reactor') {
        const served = s.rooms.filter((x) => x.powerFrom === r.id);
        lines.push(info(`  Load: ${reactorLoad(s, r.id)} / ${REACTOR_OUTPUT}, wired to ${served.length} room(s)`));
      } else if (r.type === 'oxygen') {
        lines.push(info(`  Pipes: ${plantPipes(s, r.id)} / ${OXYGEN_PIPES} in use`));
      }
      if (needsPower(r.type)) {
        const src = roomById(s, r.powerFrom);
        lines.push(r.powerFrom === null ? warn('  Power: NOT WIRED') : r.powered ? info(`  Power: online (reactor at ${coord(src!.x, src!.y)})`) : warn('  Power: wired, but no supply (out of range or reactor overloaded)'));
      }
      if (r.type === 'quarters') {
        const src = roomById(s, r.airFrom);
        lines.push(r.airFrom === null ? warn('  Air: NOT PIPED') : r.breathable ? info(`  Air: flowing (plant at ${coord(src!.x, src!.y)})`) : warn('  Air: piped, but no supply (plant unpowered, out of range, or full)'));
        lines.push(info(`  Rec rooms in range: ${r.recCount}`));
      }
      return { lines, select: p, focus: p };
    },
  },
  rooms: {
    usage: 'rooms',
    summary: 'List every room and whether it is working.',
    run: (s) => ({
      lines: s.rooms.map((r) => {
        const flags: string[] = [];
        if (needsPower(r.type) && r.powerFrom === null) flags.push('NOT WIRED');
        else if (needsPower(r.type) && !r.powered) flags.push('NO POWER');
        if (r.type === 'quarters' && r.airFrom === null) flags.push('NOT PIPED');
        else if (r.type === 'quarters' && !r.breathable) flags.push('NO AIR');
        const l = `  ${coord(r.x, r.y).padEnd(4)} ${ROOM_DEFS[r.type].label}${flags.length ? '  [' + flags.join(', ') + ']' : ''}`;
        return flags.length ? warn(l) : info(l);
      }),
    }),
  },
  crew: {
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
    usage: 'speed <1 | 1/2 | 1/4>',
    summary: 'Slow time down. There is no pause.',
    run: (s, { pos: [v] }) => {
      const sp = v !== undefined ? SPEEDS[v] : undefined;
      if (sp === undefined) return err('Usage: speed <1 | 1/2 | 1/4>');
      s.speed = sp;
      return { lines: [ok(`Speed set to ${sp === 1 ? '1x' : sp === 0.5 ? '1/2x' : '1/4x'}.`)] };
    },
  },
  clear: {
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

/** Cells of rooms that make sense as the value of a given flag, for completion. */
function cellsFor(s: State, cmd: string, flag: string): string[] {
  const rooms = s.rooms.filter((r) => {
    if (flag === '-from') return cmd === 'wire' ? r.type === 'reactor' : r.type === 'oxygen';
    if (cmd === 'wire') return needsPower(r.type);
    if (cmd === 'pipe') return r.type === 'quarters';
    if (cmd === 'unwire') return r.powerFrom !== null;
    if (cmd === 'unpipe') return r.airFrom !== null;
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
  else if (flagContext && COMMANDS[name]?.flags?.[flagContext]) {
    options = cellsFor(s, name, flagContext);
    hint = `${flagContext} expects a cell like B4. ${options.length ? 'Valid: ' + options.join(' ') : ''}`;
  } else if (name === 'build' && tokens.length === 1) {
    options = BUILDABLE;
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
