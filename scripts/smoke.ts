// Headless checks of game behaviour: runs real commands against the sim, no browser needed.
// Run with: npm run smoke   (exits with an error if any check fails)
import { housingSlots, newState, roomAt, parseCoord, statsAt, statsOf, step, type Room, type State } from '../src/sim';
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
