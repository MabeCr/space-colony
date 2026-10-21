// Headless checks of game behaviour: runs real commands against the sim, no browser needed.
// Run with: npm run smoke   (exits with an error if any check fails)
import { capacityOf, capacityText, hasCapacity, housingSlots, newState, roomAt, parseCoord, statsAt, statsOf, step, type Room, type State } from '../src/sim';
import { COMMANDS, execute, linkPreview, suggest } from '../src/commands';

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passed++;
  else { failed++; console.log(`FAIL  ${name}${detail ? '\n      ' + detail : ''}`); }
}

const text = (s: State, line: string): string => execute(s, line).lines.map((l) => l.text + (l.tag ? l.tag.text : '')).join('\n');
const kinds = (s: State, line: string): string[] => execute(s, line).lines.map((l) => l.kind);
const room = (s: State, cell: string): Room => {
  const p = parseCoord(cell)!;
  return roomAt(s, p.x, p.y)!;
};
const rich = (): State => { const s = newState(); s.materials = 10000; return s; };
const run = (s: State, ...lines: string[]): void => { for (const l of lines) execute(s, l); };

// --- Slice 1 and prep: nothing regressed ----------------------------------------------
{
  const s = newState();
  check('build lists categories', text(s, 'build').includes('habitat'));
  check('build <category> lists types', text(s, 'build habitat').includes('lounge'));
  check('view <category> highlights', (execute(s, 'view life').view?.highlight ?? []).includes('oxygen'));
}

// --- view and inspect: the newest command wins ------------------------------------------------
{
  const s = newState();
  const ins = execute(s, 'inspect h6');
  check('inspect on a room sets focus and clears a view highlight', ins.focus?.x === 7 && ins.view?.highlight === null);
  const emptyInspect = execute(s, 'inspect a1');
  check('inspect on empty space leaves a view highlight alone', emptyInspect.view === undefined && emptyInspect.focus === null);
  check('view <type> clears inspect focus', execute(s, 'view reactor').focus === null);
  check('view <category> clears inspect focus', execute(s, 'view life').focus === null);
  check('view with nothing built clears inspect focus', execute(s, 'view defense').focus === null);
  check('view reset clears inspect focus', execute(s, 'view reset').focus === null);
  check('view zoom leaves inspect focus alone', execute(s, 'view zoom in').focus === undefined);
}

// --- Slice 2: tier stats ----------------------------------------------------------------
{
  const mk1 = statsAt('reactor', 1);
  const mk2 = statsAt('reactor', 2);
  check('reactor Mk1 is 12 output, radius 4', mk1.output === 12 && mk1.radius === 4);
  check('reactor Mk2 is 18 output, radius 5', mk2.output === 18 && mk2.radius === 5);
  check('oxygen Mk2: 6 pipes, output 4, draw 4', statsAt('oxygen', 2).pipes === 6 && statsAt('oxygen', 2).output === 4 && statsAt('oxygen', 2).draw === 4);
  check('garden Mk2: output 3, draw 3', statsAt('garden', 2).output === 3 && statsAt('garden', 2).draw === 3);
  check('quarters Mk2: 3 beds', statsAt('quarters', 2).beds === 3);
  check('lounge Mk2: radius 4', statsAt('lounge', 2).radius === 4);
}

// --- Checklist 1: the list ---------------------------------------------------------------
{
  const s = newState();
  const out = text(s, 'upgrade');
  check('upgrade lists the reactor', /h6\s+Reactor\s+Mk1 -> Mk2\s+cost 25\s+output 12 -> 18, radius 4 -> 5/i.test(out), out);
  check('upgrade lists the oxygen plant', /j6\s+Oxygen Plant\s+Mk1 -> Mk2\s+cost 20/i.test(out), out);
  check('upgrade does not list the hub', !/i6/i.test(out), out);
  check('upgrade list shows pipes change', out.includes('pipes 4 -> 6'), out);
}

// --- Checklist 2 and 3: cost, success, stats ---------------------------------------------
{
  const s = newState();
  s.materials = 10;
  const before = text(s, 'upgrade -l h6');
  check('too few materials is refused', before.startsWith('Not enough materials'), before);
  check('refused upgrade changes nothing', room(s, 'h6').tier === 1 && s.materials === 10);

  s.materials = 100;
  const r = execute(s, 'upgrade -l h6');
  check('upgrade succeeds', r.lines[0].kind === 'ok' && room(s, 'h6').tier === 2, r.lines[0].text);
  check('cost is spent', s.materials === 75, String(s.materials));
  check('cursor moves to the room', r.select?.x === 7 && r.select?.y === 5);
  const ins = text(s, 'inspect h6');
  check('inspect shows Mk2, output 18, radius 5', ins.includes('Reactor Mk2') && ins.includes('Output: 18') && ins.includes('Radius: 5'), ins);
  check('power supply is 18 after upgrade', s.powerSupply === 18, String(s.powerSupply));
  step(s);
  check('status power reflects the reactor', text(s, 'status power').includes('/18 used'), text(s, 'status power'));
  check('rooms shows the tier', text(s, 'rooms').includes('Reactor Mk2'));
  for (const flag of ['-loc', '-l', '-location']) {
    const t = rich();
    check(`upgrade ${flag} works`, execute(t, `upgrade ${flag} h6`).lines[0].kind === 'ok' && room(t, 'h6').tier === 2);
  }
  check('upgrade -l with the cell first also works', (() => { const t = rich(); return execute(t, 'upgrade h6 -l h6').lines[0].kind === 'ok'; })());
  check('view reactor still works', (execute(s, 'view reactor').view?.highlight ?? []).includes('reactor'));
}

// --- Checklist 5: reactor radius 4 -> 5 brings a far room into reach ----------------------
{
  const s = rich();
  run(s, 'build garden -l c6'); // five cells from h6
  check('out of range with Mk1', text(s, 'wire -f h6 -t c6').startsWith('Out of range'), text(s, 'wire -f h6 -t c6'));
  const prevOff = linkPreview(s, 'wire -f h6 -t c6');
  check('preview is invalid with Mk1 radius', prevOff?.valid === false);
  run(s, 'upgrade -l h6');
  check('preview is valid with Mk2 radius', linkPreview(s, 'wire -f h6 -t c6')?.valid === true);
  check('wire works with Mk2', text(s, 'wire -f h6 -t c6').startsWith('Wired'), text(s, 'wire -f h6 -t c6'));
  check('the garden is powered', room(s, 'c6').powered);
}

// --- Checklist 6: quarters beds ----------------------------------------------------------
{
  const s = rich();
  run(s, 'build quarters -l j7', 'wire -f h6 -t j7', 'pipe -f j6 -t j7');
  check('quarters works', room(s, 'j7').powered && room(s, 'j7').breathable);
  step(s);
  check('beds: hub 4 + quarters 2', housingSlots(s).length === 6, String(housingSlots(s).length));
  run(s, 'upgrade -l j7');
  check('upgraded quarters adds a bed', housingSlots(s).length === 7, String(housingSlots(s).length));
  check('status colonists shows 7 beds', text(s, 'status colonists').includes('Beds      7'), text(s, 'status colonists'));
  check('inspect shows beds', text(s, 'inspect j7').includes('Beds: 3'));
}

// --- Checklist 7: oxygen plant pipes -----------------------------------------------------
{
  const s = rich();
  const cells = ['j7', 'k7', 'j8', 'k6', 'k5'];
  for (const c of cells) run(s, `build quarters -l ${c}`, `wire -f h6 -t ${c}`);
  for (const c of cells.slice(0, 4)) run(s, `pipe -f j6 -t ${c}`);
  const fifth = text(s, `pipe -f j6 -t ${cells[4]}`);
  check('fifth pipe refused at Mk1', fifth.includes('already feeds 4'), fifth);
  const up = text(s, 'upgrade -l j6');
  check('oxygen plant upgrades', up.startsWith('Upgraded'), up);
  check('inspect shows 6 pipes', text(s, 'inspect j6').includes('/ 6 in use'), text(s, 'inspect j6'));
  const fifthAgain = text(s, `pipe -f j6 -t ${cells[4]}`);
  check('fifth pipe works at Mk2', fifthAgain.startsWith('Piped'), fifthAgain);
}

// --- Checklist 8 and 9: refusals ---------------------------------------------------------
{
  const s = rich();
  run(s, 'upgrade -l h6');
  const again = text(s, 'upgrade -l h6');
  check('already Mk2 message', again === 'Reactor at H6 is already Mk2. Mk3 is a separate building.', again);
  check('cost not charged twice', s.materials === 10000 - 25);
  check('hub refused', text(s, 'upgrade -l i6') === 'The Command Hub cannot be upgraded.');
  check('empty cell refused', text(s, 'upgrade -l a1') === 'Nothing is built at A1.');
  check('missing cell value is an error', text(s, 'upgrade -l').startsWith('Missing'), text(s, 'upgrade -l'));
  check('bad cell refused', text(s, 'upgrade -l zz').includes('not a valid cell'));
  check('upgraded rooms leave the list', !/h6/i.test(text(s, 'upgrade')));
  check('Mk2 list entry still shows others', /j6/i.test(text(s, 'upgrade')));
}

// --- Checklist 10: demolish refunds half of everything spent -----------------------------
{
  const s = rich();
  run(s, 'build garden -l g5', 'upgrade -l g5');
  let m = s.materials;
  run(s, 'demolish -l g5');
  check('Mk2 garden refunds half of 25+15 = 20', s.materials - m === 20, String(s.materials - m));
  run(s, 'build garden -l g5');
  m = s.materials;
  run(s, 'demolish -l g5');
  check('Mk1 garden refunds 12 (half of 25, rounded down)', s.materials - m === 12, String(s.materials - m));
  run(s, 'upgrade -l h6');
  m = s.materials;
  const out = text(s, 'demolish -l h6');
  check('Mk2 reactor refunds 32 (half of 65, rounded down)', s.materials - m === 32, `${s.materials - m}\n${out}`);
  check('demolish message names the tier', out.includes('Reactor Mk2'), out);
}

// --- Checklist 10a: a power-raising upgrade must fit ---------------------------------------
{
  const s = rich();
  // Reactor Mk1 gives 12: plant 3 + four gardens 8 + quarters 1 = 12, so no spare.
  for (const c of ['f5', 'f6', 'f7', 'e6']) run(s, `build garden -l ${c}`, `wire -f h6 -t ${c}`);
  run(s, 'build quarters -l g7', 'wire -f h6 -t g7');
  check('setup: reactor is full', s.powerDemand === 12 && s.powerSupply === 12, `${s.powerDemand}/${s.powerSupply}`);
  const mBefore = s.materials;
  const refused = text(s, 'upgrade -l f5');
  check('refused when the reactor has no spare', refused.includes('has 0 spare power') && refused.includes('needs 1 more'), refused);
  check('refused upgrade changes nothing', room(s, 'f5').tier === 1 && s.materials === mBefore);
  run(s, 'unwire -t f5');
  const m = s.materials;
  const warned = execute(s, 'upgrade -l f5');
  check('unpowered room can be upgraded', room(s, 'f5').tier === 2 && m - s.materials === 15, warned.lines.map((l) => l.text).join(' | '));
  check('warns that it is still not working', warned.lines.some((l) => l.kind === 'warn' && l.text.includes('NOT WIRED')), warned.lines.map((l) => l.text).join(' | '));
  check('still flagged in rooms', text(s, 'rooms').includes('Hydroponics Mk2') && /f5\s+Hydroponics Mk2\s+\[NOT WIRED\]/i.test(text(s, 'rooms')), text(s, 'rooms'));
  // Upgrading the reactor frees power, after which the Mk2 garden can be wired and runs on its larger draw.
  run(s, 'upgrade -l h6');
  check('reactor upgrade gives spare power', s.powerSupply === 18 && s.powerSupply - s.powerDemand === 5, `${s.powerDemand}/${s.powerSupply}`);
  check('Mk2 garden wires and draws 3', text(s, 'wire -f h6 -t f5').startsWith('Wired') && room(s, 'f5').powered && statsOf(room(s, 'f5')).draw === 3);
  check('demand is plant 3 + three gardens 6 + Mk2 garden 3 + quarters 1', s.powerDemand === 13, String(s.powerDemand));
}

// --- Simulation uses tier output ------------------------------------------------------------
{
  const gain = (up: boolean): number => {
    const s = newState();
    s.materials = 500;
    run(s, 'build garden -l g5', 'wire -f h6 -t g5');
    if (up) run(s, 'upgrade -l j6');
    s.oxygen = 50;
    s.food = 50;
    step(s);
    return s.oxygen;
  };
  check('Mk2 oxygen plant makes 1 more oxygen per tick', Math.abs(gain(true) - gain(false) - 1) < 1e-9, `${gain(true)} vs ${gain(false)}`);
  const food = (up: boolean): number => {
    const s = newState();
    s.materials = 500;
    run(s, 'build garden -l g5', 'wire -f h6 -t g5');
    if (up) run(s, 'upgrade -l g5');
    s.food = 50;
    step(s);
    return s.food;
  };
  check('Mk2 garden makes 1 more food per tick', Math.abs(food(true) - food(false) - 1) < 1e-9, `${food(true)} vs ${food(false)}`);
  const lounge = (up: boolean): number => {
    const s = newState();
    s.materials = 500;
    // Quarters 3.2 cells from the lounge: outside radius 3, inside radius 4.
    run(s, 'build quarters -l d6', 'wire -f h6 -t d6', 'build lounge -l g7', 'wire -f h6 -t g7');
    if (up) run(s, 'upgrade -l g7');
    return room(s, 'd6').loungeCount;
  };
  check('Mk2 lounge reaches one cell further', lounge(false) === 0 && lounge(true) === 1, `${lounge(false)} ${lounge(true)}`);
}

// --- Slice 3: compute capacity and the data link ------------------------------------------------
{
  const s = rich();
  check('build compute lists the rack', text(s, 'build compute').includes('rack') && text(s, 'build compute').includes('Server Rack') && text(s, 'build compute').includes('35'), text(s, 'build compute'));
  check('compute is now a visible category', text(s, 'build').includes('compute'));
  check('status has no compute line before a rack', !text(s, 'status').includes('Compute'));
  step(s);
  check('status compute explains there are no racks', text(s, 'status compute').includes('No server racks yet'), text(s, 'status compute'));

  const built = execute(s, 'build rack -l g5');
  const warns = built.lines.filter((l) => l.kind === 'warn').map((l) => l.text).join(' | ');
  check('build rack warns about wire and data', warns.includes('Not wired yet') && warns.includes('No data yet: net -from <hub or switch> -to G5'), warns);
  check('rack flags: not wired and not networked', /g5\s+Server Rack\s+\[NOT WIRED, NOT NETWORKED\]/i.test(text(s, 'rooms')), text(s, 'rooms'));
  check('status shows a compute line once a rack exists', text(s, 'status').includes('Compute     0 used / 0 capacity'), text(s, 'status'));
  check('alerts report the rack', text(s, 'status alerts').includes('NOT WIRED, NOT NETWORKED'), text(s, 'status alerts'));

  run(s, 'wire -f h6 -t g5');
  check('wired but not networked gives no compute', s.computeSupply === 0 && text(s, 'rooms').includes('NOT NETWORKED'));
  check('status compute tells you how to link it', text(s, 'status compute').includes('net -from <hub or switch> -to g5'), text(s, 'status compute'));

  const linked = execute(s, 'net -f i6 -t g5');
  check('net links the rack', linked.lines[0].kind === 'ok' && linked.lines[0].text.startsWith('Linked data'), linked.lines[0].text);
  check('cursor moves to the rack', linked.select?.x === 6 && linked.select?.y === 4);
  check('compute capacity is 4', s.computeSupply === 4 && s.computeUsed === 0, String(s.computeSupply));
  check('rack is operational', /g5\s+Server Rack\s+\[OPERATIONAL\]/i.test(text(s, 'rooms')), text(s, 'rooms'));
  step(s);
  check('status shows capacity', text(s, 'status').includes('Compute     0 used / 4 capacity'), text(s, 'status'));
  const sc = text(s, 'status compute');
  check('status compute shows capacity and the rack', sc.includes('Capacity  4   used 0   free 4') && sc.includes('online, +4'), sc);
  check('status compute -time works', !text(s, 'status compute -time 2').includes('must be'));
  const ins = text(s, 'inspect g5');
  check('inspect shows compute and data', ins.includes('Compute: +4') && ins.includes('(online)') && ins.includes('Data: linked'), ins);
  check('inspect hub shows data radius and ports', text(s, 'inspect i6').includes('Data radius: 5') && text(s, 'inspect i6').includes('Data ports: 1 / 6'), text(s, 'inspect i6'));

  check('net preview is valid for a rack in range', linkPreview(s, 'net -f i6 -t g5')?.valid === true);
  check('net preview is invalid for a non-rack target', linkPreview(s, 'net -f i6 -t h6')?.valid === false);
  check('net preview is invalid from a non-source', linkPreview(s, 'net -f h6 -t g5')?.valid === false);

  run(s, 'unwire -t g5');
  check('losing power drops compute to 0', s.computeSupply === 0);
  run(s, 'wire -f h6 -t g5');
  check('rewiring restores it', s.computeSupply === 4);
  const un = text(s, 'unnet -t g5');
  check('unnet disconnects', un.startsWith('Disconnected data') && s.computeSupply === 0 && text(s, 'rooms').includes('NOT NETWORKED'), un);
  check('unnet again is an error', text(s, 'unnet -t g5').includes('has no data link'));
  run(s, 'net -f i6 -t g5');

  run(s, 'build rack -l g6', 'wire -f h6 -t g6', 'net -f i6 -t g6');
  check('two racks give 8', s.computeSupply === 8, String(s.computeSupply));

  // Errors.
  check('net from a non-hub is refused', text(s, 'net -f h6 -t g5').includes('is not a data source'), text(s, 'net -f h6 -t g5'));
  check('net to a non-rack is refused', text(s, 'net -f i6 -t j6').includes('does not use a data link'), text(s, 'net -f i6 -t j6'));
  run(s, 'build rack -l c3');
  const far = text(s, 'net -f i6 -t c3');
  check('net out of range is refused with the distance', far.startsWith('Out of range') && far.includes('data radius') && far.includes('is 6.7 cells'), far);
  check('net with a missing flag', text(s, 'net -f i6').startsWith('Missing -to'), text(s, 'net -f i6'));
  check('net with nothing built', text(s, 'net -f i6 -t a1') === 'Nothing is built at A1.');

  // Ports: the hub has 6. Two racks are linked already.
  for (const c of ['g7', 'i4', 'i8', 'k5']) run(s, `build rack -l ${c}`, `net -f i6 -t ${c}`);
  check('hub shows 6 ports in use', text(s, 'inspect i6').includes('Data ports: 6 / 6'), text(s, 'inspect i6'));
  run(s, 'build rack -l k7');
  const full = text(s, 'net -f i6 -t k7');
  check('seventh link is refused for ports', full.includes('no free ports') && full.includes('6 of 6'), full);
  const dup = text(s, 'net -f i6 -t g5');
  check('repeating a net link says it already exists, even with full ports', dup === 'Server Rack at G5 is already linked to the Command Hub at I6.', dup);

  // Upgrade and refund.
  run(s, 'wire -f h6 -t g7');
  const before = s.computeSupply;
  const up = text(s, 'upgrade -l g5');
  check('rack upgrades to Mk2 for 20', up.startsWith('Upgraded Server Rack') && s.materials < 10000, up);
  check('Mk2 rack gives 6 instead of 4', s.computeSupply === before + 2, `${before} -> ${s.computeSupply}`);
  check('Mk2 rack draws 3', statsOf(room(s, 'g5')).draw === 3);
  const m = s.materials;
  run(s, 'demolish -l g5');
  check('Mk2 rack refunds 27 (half of 35+20)', s.materials - m === 27, String(s.materials - m));
  const m2 = s.materials;
  run(s, 'demolish -l g6');
  check('Mk1 rack refunds 17', s.materials - m2 === 17, String(s.materials - m2));

  // View, history, completion, tags.
  check('view compute highlights racks', (execute(s, 'view compute').view?.highlight ?? []).includes('rack'));
  check('view rack works', (execute(s, 'view racks').view?.highlight ?? []).includes('rack'));
  check('history records compute', s.history.length > 0 && s.history[s.history.length - 1].computeSupply === s.computeSupply);
  check('net -f completes to the hub only', suggest(s, 'net -f ').completions.join(' ') === 'i6', suggest(s, 'net -f ').completions.join(' '));
  check('net -t completes to racks only', suggest(s, 'net -f i6 -t ').completions.every((c) => room(s, c).type === 'rack'));
  check('unnet -t completes to linked racks only', suggest(s, 'unnet -t ').completions.every((c) => room(s, c).dataFrom !== null) && suggest(s, 'unnet -t ').completions.length > 0);
  check('net and unnet are actions', COMMANDS.net.tag === 'action' && COMMANDS.unnet.tag === 'action');
  check('demolish drops data links to a missing room cleanly', (() => { const t = rich(); run(t, 'build rack -l g5', 'wire -f h6 -t g5', 'net -f i6 -t g5', 'demolish -l g5'); step(t); return t.computeSupply === 0; })());
}

// --- Slice 4: the network switch ---------------------------------------------------------------------
// A second reactor and a switch at L6 (3 cells from the hub), so racks beyond the hub's radius work.
const base = (): State => {
  const t = rich();
  run(t, 'build reactor -l m5', 'build switch -l l6', 'wire -f m5 -t l6', 'net -f i6 -t l6');
  return t;
};
{
  const s = rich();
  check('build compute lists the switch', text(s, 'build compute').includes('switch') && text(s, 'build compute').includes('Network Switch'), text(s, 'build compute'));
  const built = execute(s, 'build switch -l i4');
  check('build switch warns about wire and data', built.lines.filter((l) => l.kind === 'warn').map((l) => l.text).join(' | ').includes('No data yet'));
  check('switch flags: not wired and not networked', /i4\s+Network Switch\s+ports \d+\/\d+\s+\[NOT WIRED, NOT NETWORKED\]/i.test(text(s, 'rooms')), text(s, 'rooms'));
  run(s, 'wire -f h6 -t i4');
  check('wired but unlinked switch is still not networked', text(s, 'rooms').includes('NOT NETWORKED'));
  check('hub links the switch', text(s, 'net -f i6 -t i4').startsWith('Linked data'));
  check('switch is operational', /i4\s+Network Switch\s+ports \d+\/\d+\s+\[OPERATIONAL\]/i.test(text(s, 'rooms')), text(s, 'rooms'));
  const si = text(s, 'inspect i4');
  check('inspect switch shows ports and hub connection', si.includes('Data ports: 0 / 4') && si.includes('Data radius: 4') && si.includes('connected to the hub'), si);
  check('hub counts the switch as a port', text(s, 'inspect i6').includes('Data ports: 1 / 6'));
  check('switch cannot be upgraded', text(s, 'upgrade -l i4').includes('cannot be upgraded') && !/i4/i.test(text(s, 'upgrade')), text(s, 'upgrade -l i4'));
  check('switch refund is 10', (() => { const m = s.materials; run(s, 'demolish -l i4'); return s.materials - m === 10; })());
}
{
  const s = base();
  run(s, 'build rack -l o6', 'wire -f m5 -t o6');
  step(s);
  const far = text(s, 'net -f i6 -t o6');
  check('rack beyond the hub radius is refused from the hub', far.startsWith('Out of range') && far.includes('6.0 cells'), far);
  check('the switch can link it', text(s, 'net -f l6 -t o6').startsWith('Linked data from the Network Switch'));
  check('rack behind the switch gives compute', s.computeSupply === 4, String(s.computeSupply));
  check('inspect switch shows 1 port in use', text(s, 'inspect l6').includes('Data ports: 1 / 4'));
  check('status compute lists the switch', text(s, 'status compute').includes('Network Switch L6  relaying, ports 1 / 4'), text(s, 'status compute'));

  run(s, 'unwire -t l6');
  check('unwiring the switch cuts everything behind it', s.computeSupply === 0 && /o6\s+Server Rack\s+\[NO DATA\]/i.test(text(s, 'rooms')), text(s, 'rooms'));
  check('the cut-off switch is flagged', /l6\s+Network Switch\s+ports \d+\/\d+\s+\[NOT WIRED\]/i.test(text(s, 'rooms')));
  check('the link stays recorded', room(s, 'o6').dataFrom === room(s, 'l6').id);
  check('status compute explains a cut-off rack', text(s, 'status compute').includes('Everything behind it has no data') && text(s, 'status compute').includes('cut off from the hub'), text(s, 'status compute'));
  run(s, 'wire -f m5 -t l6');
  check('rewiring the switch restores it', s.computeSupply === 4);

  run(s, 'unnet -t l6');
  check('unlinking the switch cuts the rack, keeping its link', s.computeSupply === 0 && room(s, 'o6').dataFrom !== null && /o6\s+Server Rack\s+\[NO DATA\]/i.test(text(s, 'rooms')) && /l6\s+Network Switch\s+ports \d+\/\d+\s+\[NOT NETWORKED\]/i.test(text(s, 'rooms')), text(s, 'rooms'));
  check('status alerts lists both', text(s, 'status alerts').includes('Network Switch at L6') && text(s, 'status alerts').includes('Server Rack at O6'), text(s, 'status alerts'));
  run(s, 'net -f i6 -t l6');
  check('relinking restores everything', s.computeSupply === 4);
}
{
  // Ports.
  const s = base();
  for (const c of ['o6', 'm6', 'm7', 'n6', 'n7']) run(s, `build rack -l ${c}`, `wire -f m5 -t ${c}`);
  for (const c of ['o6', 'm6', 'm7', 'n6']) run(s, `net -f l6 -t ${c}`);
  check('four racks behind the switch give 16', s.computeSupply === 16, String(s.computeSupply));
  check('inspect shows 4 / 4', text(s, 'inspect l6').includes('Data ports: 4 / 4'));
  const full = text(s, 'net -f l6 -t n7');
  check('fifth link is refused for ports', full.includes('Network Switch') && full.includes('no free ports') && full.includes('4 of 4'), full);
  check('repeating a net link says it already exists, even when full', text(s, 'net -f l6 -t o6') === 'Server Rack at O6 is already linked to the Network Switch at L6.', text(s, 'net -f l6 -t o6'));
}
{
  // Reroute from the hub to a switch.
  const s = rich();
  run(s, 'build switch -l i4', 'wire -f h6 -t i4', 'net -f i6 -t i4', 'build rack -l g5', 'wire -f h6 -t g5', 'net -f i6 -t g5');
  check('hub has two ports in use', text(s, 'inspect i6').includes('Data ports: 2 / 6'));
  const re = text(s, 'net -f i4 -t g5');
  check('net from the switch reroutes the rack', re.startsWith('Rerouted data from the Network Switch'), re);
  check('hub frees a port and the switch takes it', text(s, 'inspect i6').includes('Data ports: 1 / 6') && text(s, 'inspect i4').includes('Data ports: 1 / 4'));
  check('the rack still works', s.computeSupply === 4);
}
{
  // Chaining.
  const s = base();
  run(s, 'build switch -l p6', 'wire -f m5 -t p6', 'build rack -l p4', 'wire -f m5 -t p4');
  check('second switch links from the first', text(s, 'net -f l6 -t p6').startsWith('Linked data from the Network Switch'));
  check('rack behind the chain links', text(s, 'net -f p6 -t p4').startsWith('Linked data'));
  check('compute works through two switches', s.computeSupply === 4, String(s.computeSupply));
  run(s, 'unnet -t l6');
  check('cutting the first switch cuts the whole chain', s.computeSupply === 0 && /p6\s+Network Switch\s+ports \d+\/\d+\s+\[NO DATA\]/i.test(text(s, 'rooms')) && /p4\s+Server Rack\s+\[NO DATA\]/i.test(text(s, 'rooms')), text(s, 'rooms'));
  run(s, 'net -f i6 -t l6');
  check('restoring the first switch restores the chain', s.computeSupply === 4);
  run(s, 'unwire -t p6');
  check('unwiring the second switch cuts only its rack', s.computeSupply === 0);
  run(s, 'wire -f m5 -t p6');

  // Loops and self links.
  check('a switch cannot link to itself', text(s, 'net -f l6 -t l6').includes('cannot be linked to itself'));
  check('self link preview is invalid', linkPreview(s, 'net -f l6 -t l6')?.valid === false);
  check('switch to switch preview is valid', linkPreview(s, 'net -f l6 -t p6')?.valid === true);
  run(s, 'net -f p6 -t l6');
  check('two switches linked to each other both fail', !room(s, 'l6').data && !room(s, 'p6').data && s.computeSupply === 0, `${room(s, 'l6').data} ${room(s, 'p6').data}`);
  run(s, 'net -f i6 -t l6');
  check('relinking from the hub breaks the loop', room(s, 'l6').data && room(s, 'p6').data && s.computeSupply === 4);
}
{
  // Demolishing a switch.
  const s = base();
  run(s, 'build rack -l o6', 'wire -f m5 -t o6', 'net -f l6 -t o6');
  check('setup: rack works through the switch', s.computeSupply === 4);
  run(s, 'demolish -l l6');
  check('demolishing the switch drops the link and the compute', s.computeSupply === 0 && room(s, 'o6').dataFrom === null && /o6\s+Server Rack\s+\[NOT NETWORKED\]/i.test(text(s, 'rooms')), text(s, 'rooms'));
}
{
  // Views and completion.
  const s = base();
  run(s, 'build rack -l o6');
  check('view switch highlights switches', (execute(s, 'view switch').view?.highlight ?? []).includes('switch'));
  check('view compute highlights racks and switches only', (() => { const h = execute(s, 'view compute').view?.highlight ?? []; return h.includes('rack') && h.includes('switch') && !h.includes('reactor'); })());
  check('net -f offers the hub and switches', suggest(s, 'net -f ').completions.slice().sort().join(' ') === 'i6 l6', suggest(s, 'net -f ').completions.join(' '));
  check('net -t offers racks and switches', suggest(s, 'net -f i6 -t ').completions.slice().sort().join(' ') === 'l6 o6', suggest(s, 'net -f i6 -t ').completions.join(' '));
  check('net preview from a switch to a rack is valid', linkPreview(s, 'net -f l6 -t o6')?.valid === true);
  check('net preview from a rack is invalid', linkPreview(s, 'net -f o6 -t l6')?.valid === false);
}

// --- Capacity: how much of a limited resource is used -------------------------------------------------
{
  const s = rich();
  const cap = (cell: string) => capacityOf(s, room(s, cell));
  check('the hub has no capacity row', cap('i6') === null);
  check('reactor shows power load against output', JSON.stringify(cap('h6')) === JSON.stringify({ resource: 'power', label: 'load', used: 3, total: 12, broken: 0, offline: false }), JSON.stringify(cap('h6')));
  check('oxygen plant shows pipes', cap('j6')?.used === 0 && cap('j6')?.total === 4 && cap('j6')?.resource === 'air');
  check('rooms shows the numbers', text(s, 'rooms').includes('Reactor  load 3/12') && text(s, 'rooms').includes('Oxygen Plant  pipes 0/4'), text(s, 'rooms'));
  run(s, 'build garden -l g5', 'build lounge -l g4', 'build rack -l g6');
  check('garden, lounge and rack have no capacity row', cap('g5') === null && cap('g4') === null && cap('g6') === null);
  check('hasCapacity matches', hasCapacity('switch') && hasCapacity('quarters') && !hasCapacity('hub') && !hasCapacity('garden'));

  // Pipes: used counts recorded pipes; broken counts the ones that are not delivering.
  run(s, 'build quarters -l j7', 'wire -f h6 -t j7', 'pipe -f j6 -t j7', 'build quarters -l k7', 'wire -f h6 -t k7', 'pipe -f j6 -t k7');
  check('two pipes in use, none broken', cap('j6')?.used === 2 && cap('j6')?.broken === 0 && capacityText(cap('j6')!) === 'pipes 2/4');
  run(s, 'unwire -t j6');
  check('an unpowered plant makes its pipes broken', cap('j6')?.used === 2 && cap('j6')?.broken === 2, JSON.stringify(cap('j6')));
  run(s, 'wire -f h6 -t j6', 'unpipe -t k7');
  check('unpipe frees a pipe', cap('j6')?.used === 1 && cap('j6')?.broken === 0);

  // Beds: the hub fills first, then working quarters in order.
  check('quarters start empty while the hub has room', cap('j7')?.used === 0 && cap('j7')?.total === 2 && cap('j7')?.offline === false, JSON.stringify(cap('j7')));
  for (let i = 0; i < 3; i++) s.crew.push({ name: `Extra${i}`, role: 'Engineer', housed: true });
  check('extra crew fill the quarters once the hub is full', cap('j7')?.used === 2, JSON.stringify(cap('j7')));
  check('rooms shows beds', text(s, 'rooms').includes('Quarters  beds 2/2'), text(s, 'rooms'));
  run(s, 'upgrade -l j7');
  check('Mk2 quarters have 3 beds and take the 7th crew member', cap('j7')?.total === 3 && cap('j7')?.used === 3, JSON.stringify(cap('j7')));
  run(s, 'unwire -t j7');
  check('quarters without power are offline and empty', cap('j7')?.offline === true && cap('j7')?.used === 0 && capacityText(cap('j7')!).includes('(offline)'), JSON.stringify(cap('j7')));
  run(s, 'upgrade -l h6');
  check('reactor Mk2 total is 18', cap('h6')?.total === 18);
}
{
  const s = base();
  const cap = () => capacityOf(s, room(s, 'l6'))!;
  check('switch starts with free ports', cap().used === 0 && cap().total === 4 && cap().resource === 'data' && cap().broken === 0, JSON.stringify(cap()));
  run(s, 'build rack -l o6', 'wire -f m5 -t o6', 'net -f l6 -t o6');
  check('a linked rack uses a port', cap().used === 1 && capacityText(cap()) === 'ports 1/4');
  run(s, 'unwire -t l6');
  check('a cut-off switch shows its links as broken', cap().used === 1 && cap().broken === 1, JSON.stringify(cap()));
  run(s, 'wire -f m5 -t l6', 'unnet -t o6');
  check('unnet frees the port', cap().used === 0 && cap().broken === 0);
}

// --- Repeating a link ---------------------------------------------------------------------------------
{
  const s = rich();
  run(s, 'build garden -l g5', 'wire -f h6 -t g5', 'build quarters -l j7', 'wire -f h6 -t j7', 'pipe -f j6 -t j7', 'build rack -l g6', 'wire -f h6 -t g6', 'net -f i6 -t g6');
  const m = s.materials;
  check('repeating wire says it already exists', text(s, 'wire -f h6 -t g5') === 'Hydroponics at G5 is already wired to the reactor at H6.', text(s, 'wire -f h6 -t g5'));
  check('repeating pipe says it already exists', text(s, 'pipe -f j6 -t j7') === 'Quarters at J7 is already piped to the plant at J6.', text(s, 'pipe -f j6 -t j7'));
  check('repeating net says it already exists', text(s, 'net -f i6 -t g6') === 'Server Rack at G6 is already linked to the Command Hub at I6.', text(s, 'net -f i6 -t g6'));
  check('a repeated link is an error and changes nothing', kinds(s, 'net -f i6 -t g6')[0] === 'err' && s.materials === m && s.computeSupply === 4);
  check('a different source still reroutes', (() => { const t = rich(); run(t, 'build reactor -l f6', 'build garden -l g5', 'wire -f h6 -t g5'); return text(t, 'wire -f f6 -t g5').startsWith('Rewired'); })());
  // A link that exists but is not delivering says so.
  const cut = base();
  run(cut, 'build rack -l o6', 'wire -f m5 -t o6', 'net -f l6 -t o6', 'unwire -t l6');
  const note = text(cut, 'net -f l6 -t o6');
  check('a repeated link that is not delivering points at rooms', note === 'Server Rack at O6 is already linked to the Network Switch at L6. It is not getting data; see "rooms" for why.', note);
}

// --- Autofill / completion -------------------------------------------------------------------
{
  const s = rich();
  const names = suggest(s, 'upgrade -l ').completions;
  check('completion offers upgradable cells only', names.includes('h6') && names.includes('j6') && !names.includes('i6'), names.join(' '));
  run(s, 'upgrade -l h6');
  check('completion drops upgraded rooms', !suggest(s, 'upgrade -l ').completions.includes('h6'));
  check('upgrade is a command', suggest(s, 'upgr').completions.includes('upgrade'));
  check('help explains it', text(s, 'help upgrade').includes('upgrade -location'));
  check('upgrade is tagged as an action', COMMANDS.upgrade.tag === 'action');
  check('speed set stays ui', kinds(s, 'speed 1')[0] === 'ok');
}

console.log(`${passed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} smoke check(s) failed`);
