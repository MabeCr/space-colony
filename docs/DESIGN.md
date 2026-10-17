# Space Colony — Design Document

This document records the design decisions and implemented features of the game, so a new Claude session (for example on the phone app, with no access to the code) can pick up where the last one left off. Where it matters, it says whether something is **implemented** or **decided but not built**.

## Concept

A real-time colony survival sim played mostly through a **command line**. The player builds rooms on a grid, connects them with power wires and air pipes, and tries to keep a growing crew alive and happy. The map is a visual readout; **the console is the interface**. Scripting is the long-term goal (not built; see Vision and "Planned game design").

## Vision

**What the game is:** a roguelike space-colony management game where the only way to act is a command line. The top half of the screen is a read-only view of the station; the bottom half is the terminal. Long term, the real game is **automation**: the player starts typing every command by hand, then learns to write scripts that run the colony for them, and the colony grows and the threats scale until hand-play is not enough.

**Pillars**

1. **The terminal is the only way to act.** The map shows what is happening; it never acts (see Core design rules).
2. **Placement is strategy.** Everything has a radius (a reactor only powers rooms within reach, a purifier only serves nearby rooms). Where you put things is a puzzle you solve before trouble arrives. The player chooses which rooms and structures go where.
3. **Real-time, slowable, never pausable.** Time can be slowed to 1/2 and 1/4 (1/8 was floated and judged probably too slow). Not being able to pause is deliberate: it rewards getting fast with commands and, later, writing good scripts.
4. **Resources and threats pull in opposite directions.** Leaning too hard into resources leaves you easy prey for threats; leaning too hard into defense starves or demoralises your people. Both extremes should lose.
5. **Playable by non-programmers, deeper for programmers.** The audience is not assumed to be programmers, but being one makes the game easier. Early play uses plain verbs; scripting arrives gradually.
6. **Cozy that turns campy-gritty.** Between threats the tone is cozy management (calm, warm). During threat waves it shifts to gritty survival with action-movie campiness (red alert palette, different music, quips in the log). The contrast is a signature feature.

**Scale and shape.** A run is a roguelike session, targeted at roughly 30–45 minutes, structured in three acts (below). Failure ends the run and feeds permanent progression; it is not a dead end.

**Setting (decided).** A modular space station / colony the player expands room by room. Chosen over hacking, a rogue-AI story, a dungeon crawl and a sysadmin sim.

**Tower defense (decided, partial).** Tower-defense style defense is part of the game, built into the colony fantasy, but explicitly *not* all of it. Waves are one of several pressures alongside oxygen, food, power, morale and slow-burn failures.

- Name: the repo and package are `space-colony`. The in-game banner and page title still say "Station Shell" (not yet renamed).
- License: **GPL-3.0**, chosen on purpose so nobody can take the code and release it closed-source.
- Time cannot be paused. It can only be slowed (`speed 1 | 1/2 | 1/4`).

## Tech

- TypeScript + Vite, no framework. Run with `npm install`, `npm run dev`. `npm run typecheck` runs `tsc --noEmit`.
- Canvas for the map, plain DOM for the HUD and terminal.
- Files in `src/`:
  - `sim.ts` — game state, room definitions, tick simulation (no DOM).
  - `commands.ts` — command parsing, execution and tab completion (no DOM).
  - `render.ts` — canvas drawing and the `View` object (cursor, hover, focus, build ghost); `buildPreview()` and `linkPreview()` in `commands.ts` parse half-typed `build` and `wire`/`pipe` lines for the previews.
  - `main.ts` — input handling, HUD, main loop, wiring it all together.
- Branches: work happens on `dev`; `main` holds the initial commit only so far.

## Core design rules

1. **The map never acts directly.** Clicking or moving the cursor on the map only changes what the console can autofill. Every action is a typed command.
2. **Connections are explicit.** Rooms do not share power or air by adjacency; the player runs `wire` and `pipe` commands.
3. **Links persist even when broken.** A wire or pipe stays recorded if the source is out of range or overloaded; the room just reports no supply. Links are only removed by `unwire`/`unpipe` or when the source is demolished.
4. **Errors explain themselves.** Command failures say why and what to do (out of range by how much, spare power, etc.).

## World

- Grid: 16 columns (A–P) by 10 rows (1–10). Cells are written like `h5` (case-insensitive).
- Start: a Command Hub in the centre (I6), a Reactor to its left (H6) and an Oxygen Plant to its right (J6), with the plant already wired to the reactor. 4 colonists, 100 materials, oxygen 70, food 70, happiness 60.

## Rooms

| Room | Cost | Power draw | Radius | Notes |
|---|---|---|---|---|
| Command Hub | — | 0 | — | Cannot be built or demolished. Houses 4 on cots. Always has air. |
| Reactor | 40 | 0 | 4 | Produces 12 power. Wire it to rooms within its radius. |
| Oxygen Plant | 30 | 3 | 4 | Needs power. Produces 3 oxygen per tick. Pipes to up to 4 quarters in radius. |
| Hydroponics | 25 | 2 | — | Needs power. Produces 2 food per tick. |
| Quarters | 20 | 1 | — | Needs a power wire and an air pipe. Houses 2. Draws new arrivals. |
| Lounge | 30 | 2 | 3 | Needs power. Quarters within its radius get a happiness boost. |

Distance is straight-line (Euclidean) between cell centres. A wire is "working" only if the room is in the reactor's radius and the reactor has spare capacity; a pipe is working only if the plant is powered, the quarters are in radius, and the plant has fewer than 4 pipes in use.

## Simulation (one tick = 1 second at 1x)

- Materials: +1 plus 0.5 per colonist each tick.
- Oxygen and food are capped at 100. Colonists consume 0.5 oxygen and 0.3 food each per tick.
- Colonists arrive every 15 ticks when there is a free bed **and** happiness is at least 50. Beds beyond the crew count sit empty; a colonist without a working bed is flagged "NO BUNK".
- Happiness drifts 10% per tick toward a target, the average of four moods (each 0–1): **air** (oxygen/30), **food** (food/30), **housing** (housed/crew) and **fun** (0.15 base per housed colonist, plus 0.45 per powered lounge in range of their quarters).
- Log messages fire for things like lost power, lost air, low reserves (below 20), oxygen depleted, and new arrivals.

## Commands (implemented)

Flags can be abbreviated: `-loc`/`-l` for `-location`, `-f`/`-src` for `-from`, `-t`/`-dest` for `-to`.

- `help [command]` — list commands or explain one.
- `status` — colony-wide overview (power, oxygen, food, materials, population, happiness score).
- `status <oxygen|food|materials|colonists|happiness> [-time <ticks>]` — a column graph of that total over the last 30 ticks (or `-time`, 2–300), a trend line, and diagnostics: production versus consumption with a run-out forecast for oxygen and food; income and what is affordable for materials; beds and the next arrival for colonists; the four moods and the weakest one for happiness. The sim keeps the last 300 ticks of `history` (a `Sample` per tick, recorded at the end of `step()`); the chart drawing is in `chart.ts` and the reports are in `commands.ts`. `-time` has no `-t` alias because `-t` already means `-to`.
- `status power` — same graph and trend for power wanted, plus per-reactor load and spare, and every room that is unwired, out of range or on an overloaded reactor. History samples include `powerSupply` and `powerDemand` for this.
- `status alerts` — one list of everything currently wrong: low or falling oxygen and food, power shortfall, any room `rooms` would flag, unhoused colonists, happiness below 50. `All clear.` when empty. Uses the shared `roomProblems()` helper that `rooms` also uses.
- Plain `status` shows a trend arrow (▲ ▼ –) on each line, comparing now to 10 ticks ago (`TREND_TICKS`). The arrows are direction only, not good/bad colouring.
- `build <type> -location <cell>` — spend materials to build. Warns if the new room still needs wiring or piping.
- `wire -from <reactor> -to <room>` / `unwire -to <room>` — power lines.
- `pipe -from <oxygen plant> -to <quarters>` / `unpipe -to <quarters>` — air pipes.
- `demolish -location <cell>` — 50% refund. The hub cannot be demolished.
- `inspect -location <cell>` — details for a room (load, pipes, power/air state, nearby lounges) and its radius on the map. Also highlights its connections (below).
- `inspect reset` — clears the connection highlight.
- `rooms` — list every room with problem flags (NOT WIRED, NO POWER, NOT PIPED, NO AIR); working rooms get a green `[OPERATIONAL]` tag. This uses an optional `tag` (coloured suffix) on `LogLine`, which `main.ts` renders as a span.
- `crew` — who is in the colony and who has a bunk.
- `speed <1 | 1/2 | 1/4>`, `clear`.

Note: `status` is the colony-wide overview. `inspect` is the per-structure status check, and the connection highlight is attached to it.

## Console UX (implemented)

- Tab completes commands, flags, room types and valid cells for the current flag. Up/Down (without Shift) recall command history. Esc clears the typed line (and any build, wire or pipe preview with it) without touching the map cursor. A hint line shows usage for the command being typed.
- **Build preview.** While a `build <type>` line is being typed (not yet submitted), the map shows a half-transparent copy of that room, plus its radius ring if the type has one (reactor, oxygen plant, lounge).
  - The preview sits on the cell given by `-location` (or `-loc`/`-l`) as soon as it parses, so `build quarters -location g6` shows a ghost quarters on G6. Typing, Tab completion and Shift+Enter autofill all update it.
  - Until a valid `-location` is typed, it follows the **mouse hover** cell instead.
  - It is only drawn on an empty cell, and the type must be complete and buildable. It disappears when the line is submitted or edited into something else.
  - The preview does not check cost, wiring or range; it only shows where and what.
  - The ghost room is drawn at 40% opacity (`GHOST_ALPHA` in `render.ts`).
- **Wire and pipe preview.** While a `wire` or `pipe` line has both `-from` and `-to` set to cells that hold rooms (any alias), the map draws a translucent animated link between them, amber for wires and cyan for pipes, at the same opacity as the ghost room.
  - If the command would be refused for type or range (source is not a reactor / oxygen plant, target does not take that connection, or it is out of radius), the link is drawn red and dotted, like a broken link. Spare reactor capacity and the plant's 4-pipe limit are not checked.
  - Nothing is drawn until both ends are set, so Shift+Enter autofill shows it as soon as the second cell is filled. `unwire` and `unpipe` have no preview.

### Connection highlight

After `inspect` on a room, that room, its wires and pipes (in and out), and the rooms on the far ends stay lit. Everything else dims to about 22% opacity but stays visible. The highlight stays until another `inspect`, `inspect reset`, inspecting empty space, or `demolish`. Other commands leave it alone. The dim level is the `DIM` constant in `render.ts`.

### Keyboard map cursor and autofill

Decision: clicking a cell only targets it, exactly as if the cursor had been moved there with Shift+Arrow keys. It does not inspect, run a command, or change the typed line. The map cursor is a general-purpose cell picker whose cell can be inserted into whatever command is being typed.

- **Click** a cell, or press **Shift+Arrow keys**, to move the white selection box. Both do the same thing.
- **Shift+Enter** types the selected cell into the current command:
  - `build <type>` → adds `-location <cell>`
  - `wire` / `pipe` → first fill is `-from`, then `-to`; once both exist, further fills replace `-to`
  - `unwire` / `unpipe` → `-to`
  - `demolish` → `-location`
  - empty line or `inspect` → `inspect -location <cell>`
  - any other command (such as `speed` or `help`) is left unchanged
- A **preview line** above the hint shows `⇧↵  <resulting command>` live, so the player can see exactly what Shift+Enter will do. It hides when nothing is selected or the fill would change nothing.
- Typical flow: click a cell, type `build lounge `, press Shift+Enter, press Enter.
- Moving the keyboard cursor clears the mouse hover so the keyboard takes over. If nothing is selected yet, the first Shift+Arrow starts at the centre of the map.

## Map rendering

- **Zoom and pan (mouse only, implemented).** The mouse wheel zooms about the pointer, so the cell under it stays put. Dragging with the left button pans. Double-click resets to the fit-everything view. Zoom ranges from 0.5x to 4x of the size that fits the whole grid (`MIN_ZOOM`/`MAX_ZOOM` in `render.ts`), and panning is clamped so at least a strip of the grid stays on screen. A drag must move 4px before it counts, so a plain click still just moves the cursor, and a drag never does. The view is not saved. The same controls exist as the `view` command (below).
- **`view` command (implemented).**
  - `view zoom <in|out> [steps]` zooms about the centre of the panel; each step is 1.25x, default 1, max 10.
  - `view pan <up|down|left|right> [cells]` moves the camera, so `left` shows what is to the left. Default 2 cells, max 50. Cells scale with the zoom.
  - `view reset` restores the fit-everything view and clears any highlight.
  - `view <room type>` (also the plural, e.g. `view gardens`) lights up every room of that type and dims the other rooms and links, then lists the cells. Types: hub, reactor, oxygen, garden, quarters, lounge. Nothing built of that type clears it with a warning. The highlight stays until `view reset`. `inspect` focus takes precedence while it is active.
  - Commands report camera and highlight changes through a `view` field on `CommandResult` (`ViewAction` in `commands.ts`); `main.ts` applies it to the renderer.
- Wires are amber, pipes are cyan. Working links animate as moving dashes; broken ones are dotted red.
- Rooms with missing power or air pulse red and show a bolt or droplet badge.
- Hovered or selected rooms with a radius show a range ring and light up the in-range cells.

## Planned game design (not built yet)

Everything in this section is the intended direction, agreed in design discussion but not implemented. Items are labelled **Decided**, **Proposed** (suggested and liked, but not locked in) or **Open**.

### Happiness (partly built)

**Decided.** Happiness is the blend of the basics (air, food, housing) plus "fun": how many fun things there are to do. The blend and the lounge's effect are built. Later, happiness should have teeth in both directions: high happiness boosts output (the cozy reward) and low happiness causes trouble such as sabotage or colonists leaving **(Proposed)**.

### Colonists

**Decided.** The crew is not fixed. The colony starts with 4 named colonists and grows as the player builds quarters, which is what justifies needing more food, oxygen and power (built). Colonists are mechanically thin for now: abstract, with a name and a role, and their needs roll up into the shared happiness score. This may change later, for example towards individuals with personalities, but not yet.

### Scripting

**Decided direction, no detailed design.** The long-term hook. The ladder is: manual commands, then repetition, then scripts.

- **Wiring and piping are natural early scripting targets** (for example, a script that wires a new building to the nearest reactor with spare capacity). Wire and pipe were made explicit commands partly with this in mind.
- **Proposed:** a `record`/`stop` macro command, where the player does things by hand and the game writes the script, which they can then open and edit. This bridges "using commands" to "programming" for non-programmers.
- **Proposed:** a deliberately tiny shell-like language (variables, `if`, loops, functions, event handlers such as `on <event>`), interpreted in the game with a per-tick instruction budget so efficiency matters. Rejected for now: running real JavaScript, since it is harder to sandbox and less thematic.
- **Proposed:** scripts are unlocked progressively (see Meta-progression): early runs force hand-typing; later runs unlock `repeat`, `on <event>`, `define`, so the player's *capability* grows, not just their stats.
- Scripts run as background processes the player can list and stop. Idea: automation is what lets the player scale up, and it also creates new problems (see Corruption).

### Threats and waves

**Decided.** Waves of enemies and non-combat events pressure the colony. Pressure from scarcity and from threats should be equal in weight.

- **Randomness is loose, not scheduled.** Each wave has a window (for example "between minute X and Y") and spawns at a random moment inside it, so the player cannot count on exact timing. A short early warning telegraphs it in the GUI. Non-combat events (solar flare, supply drop, mood swing, corruption spike) are drawn from a weighted pool whose weights shift by act. Each run uses a seed **(Proposed)**, which would also allow shared or daily runs later.
- **Self-correcting balance (Proposed).** Waves scale partly with how rich or visible the colony is, so hoarding attracts bigger attacks, and overbuilding defense drains power, food and happiness so the colony fails from the inside.
- **Defenses are scripted (Proposed).** Turrets need power, ammo and heat, and the player decides targeting rules; drones can repair or reroute power mid-fight. Defending well means planning layout ahead and automating the reaction.

### Enemy factions

**Decided.** Three factions, differing in quantity versus durability, so each stresses a different part of the colony:

| Faction | Count / health / speed | Punishes | Natural counter |
|---|---|---|---|
| Aliens | Many, fragile, fast | Single-target defenses and slow reactions | Area damage, chokepoints, good retargeting |
| Rogue machines | Few, tanky, slow | Weak damage output, low power | Sustained high-power turrets, repairing during the slow approach |
| Space pirates | Middle on both | Predictable layouts | Prioritising what they target |

- **Variety.** Enemies vary per run and per encounter: each run has a dominant faction that sets its flavour and final threat, and individual waves can mix in others.
- **Hard requirement: all factions must be about equally fun and about equally difficult.** The risk is a player starting a run, seeing the dominant faction, and restarting for an easier one. Mitigation: do **not** reveal the run's dominant faction at the start; reveal it once the run is well underway so the player is invested (the sunk-cost effect), and keep the factions' difficulty balanced.
- **Proposed flavour tricks:** pirates target the richest or happiest rooms and retreat when losing; aliens can attack through vents and life support, ignoring walls; machines can hack turrets, tying into corruption.

### Corruption

**Decided concept.** The computer running the colony randomly gets corrupted, and the player must manually reset affected objects. Its job: once scripts automate everything the player would otherwise have nothing to do, so corruption keeps hands on the keyboard.

Guidelines to keep it fun rather than a tax:

- **Proposed:** corruption is visible (glitch effect in the GUI) and diagnosable (a `diagnose <id>` style command says what is wrong), and there is always a visible warning and cause so it never feels unfair.
- **Proposed:** severity levels. Minor: a one-word fix such as `reset turret-3`. Major: edit a line of a script or complete a small repair task. Fixes should cost seconds of attention, not a minute of typing, since time cannot be paused.
- **Proposed:** corruption can hit scripts too (a corrupted script runs with a bad value), which is the scariest and most thematic form.
- **Proposed:** it scales with how much the player has automated (more automation, more surface area), and rogue machines raise the rate while a defensive "antivirus" room lowers it, making it a managed resource.

### Acts

**Decided.** A run has three acts:

1. **Survive.** Manual commands, a few rooms, one crisis at a time.
2. **Automate.** Scripts and routines take over; threats scale beyond what can be handled by hand.
3. **Expand.** Outposts, trade, research and bigger events, ending in the late-game commitment below.

A goal or mystery (for example a distress signal or an ancient structure) gives the colony a reason to exist beyond surviving **(Proposed)**.

### Win conditions

**Decided.** There is a win condition, with **two different win paths** that lean offensive versus defensive, so the player sets up for a late-game pivot into whichever they are stronger at.

| | Ascension (technology) | Conquest (domination) |
|---|---|---|
| Win by | Finishing a mega-project (such as a jump gate or terraformer) | Overtaking a rival colony (destroy or absorb it) |
| Rewards | Research, stable power, happiness, safe infrastructure | Weapons, fleet bays, surplus materials, aggressive scripting |
| Risk | Slow; the project must survive many waves while it charges | Fast; the colony is exposed while the strike force is out |

- **Proposed shape:** both paths share the same early economy and defense. Around the end of Act 2 the map reveals the rival colony and the mega-project blueprint, and the player commits.
- **Proposed:** the player can partially hedge (for example 70/30), but the final goal can only be completed on one path, so a half-built other path is wasted. This forces commitment without it being a menu click.
- **Open: how interactive Conquest should be.** Not decided, and it may not need to be interactive at all. Options on the table: scripted orders to a strike force, or a more abstract "build X ships, send them, watch a resolved battle".

### Environment and rival colony

**Decided.** Environmental factors set at the start of a run tilt whether the better choice is technology research or physical domination. They are partly hidden so the player scouts them. Examples **(Proposed)**: a rich asteroid belt (cheap materials, favours Conquest); an unstable star or nebula (research bonuses but constant radiation events, favours Ascension but needs shielding); a rival colony close by (earlier strike but earlier threat) or far; an anomaly site (a risky, one-off boost to one path).

**Decided.** The rival colony has an **aggression spectrum**: some are ravenous, war-hungry bandits; others focus on science and mostly keep to themselves. Whether it actively attacks and expands during the run or sits passively until struck is tied to this spectrum and not fully specified.

### Meta-progression

**Decided.** Vampire Survivors-style permanent unlocks that make future runs stronger and easier. Each run earns a meta-currency based on survival time, happiness and milestones, spent on a between-run screen. Two kinds of unlock **(Proposed)**:

- **Starting boosts:** a better starting reactor, an extra colonist, larger radii on purifiers.
- **New content and capability:** new room types, new commands, new script features (loops, event handlers), new colonist roles. Command unlocks as the tech tree is the best fit with the scripting theme. Unlocks can lean toward either win path so a player's permanent upgrades start to define a build.

### Failure

**Open, partly resolved by the roguelike structure.** A run ends when the colony collapses (crew dead, core destroyed, or happiness at zero for too long). Exact conditions and whether collapse is gradual and recoverable (people leave, systems fail) are not yet decided.

### Intended first-run experience (Proposed)

A tiny station, a calm opening with a few manual commands, and a first wave around minute 8 that is deliberately beatable by hand. By the third wave, doing everything manually should not be enough, which is the cue to introduce `record` and scripts. The first run likely ends in collapse around 15–20 minutes, then shows what the meta-currency bought.

### Presentation notes

Text-only play risks fatigue, so small ASCII or GUI visualisations (maps, bars) give the player something to look at. Onboarding relies on good `help`, tab completion and the live hint line, and early scripts must be trivially easy.

### Suggested build order

1. **Slice 1 (done):** layout, ticks, radius rules, basic commands, one economy, explicit wire/pipe, population growth.
2. **Slice 2:** one wave type, turrets, simple scripts.
3. **Slice 3:** happiness consequences, corruption.
4. **Later:** enemy factions, win paths, meta-progression.

## Ideas under consideration

Work in progress. Nothing here is decided. Each entry records the problem, the options discussed and any current leaning, so a later session can pick it up. When an entry is settled, move it into "Planned game design" and mark it **Decided**; if it is dropped, say why instead of deleting it.

### Why the player must keep expanding

**Problem.** Once the colony is balanced (power, air, food, beds and happiness all in the green), nothing forces the player to build more. The current economy is also endlessly self-sustaining: materials arrive at 1 + 0.5 per colonist every tick forever. A stable colony can simply sit still, which undercuts the roguelike run structure and the three acts.

**Options discussed**

| Option | Kind | How it pushes | Concerns |
|---|---|---|---|
| Waves that outscale a static colony | Push | Threat strength rises with time, so a colony that stops growing eventually loses. Already planned (see Threats and waves). | A pure stick; works best when other options feel like opportunities. |
| Finite local resources | Push | Materials come from deposits near the hub that run dry, so the colony needs new sites. Fits the radius rules, since wire and pipe reach is limited, so spreading out means outposts that need their own power and air. | Needs a map with somewhere to expand to (see open questions). Needs deposits to be visible so the player can plan. |
| Upkeep and decay | Push | Rooms wear out and cost materials to repair, so income has to keep rising just to stay level. | Easily reads as a tax if overdone. |
| Arrivals keep coming and want more | Pull | Colonists already arrive when there are free beds and happiness is at least 50. Arrival pace could rise over time, or later arrivals could need specific roles or rooms. | Needs a reason the player cannot just refuse arrivals. |
| Goals and unlocks | Pull | The two win paths (Ascension, Conquest) and meta-progression unlocks only come from growth, so staying put means never winning or unlocking anything. | Needs the win paths to exist first. |

**Current leaning (Proposed).** Combine finite local resources with escalating waves, and use the win paths as the reason to care. Finite deposits give a specific, readable reason to expand ("the nearby ore is running out") instead of a vague timer. Waves keep the clock honest. Avoid leaning on upkeep alone.

**Guardrails**

- Avoid an expand-or-die treadmill with no breathing room. Early expansion should be optional, matching the calm opening in the first-run plan, and only become compulsory around Act 2.
- Pressure should come from information the player can see and plan around (deposit sizes, wave telegraphs), not from surprise losses.
- Cozy-leaning players should still have a choice of how to expand (more homes and gardens versus more defence), in line with the "resources and threats pull in opposite directions" pillar.

**Open questions**

- **Where does the colony expand to?** The grid is a fixed 16 by 10. Options: reveal more map over time, or separate outpost grids linked by a command (something like `link`). This decision shapes everything else here, so settle it first.
- Are deposits depleted by use, by time, or both? Can they be surveyed or prospected with a command?
- Does a second site need its own hub, or just a reactor and a connection back?
- How do the status commands show a running-out resource? (`status materials` already forecasts affordability, and could forecast depletion.)

## Small tasks not built yet

- Custom scripts (from the README) — see "Scripting" above for the direction; no detailed design.
- Rename the in-game title from "Station Shell" to Space Colony.
- Optional: add `"license": "GPL-3.0-only"` to `package.json`.
- Optional: clear the connection highlight automatically when the layout changes (`build`, `wire`, `pipe`).
- Optional: make click-to-inspect still happen when the command line is empty.