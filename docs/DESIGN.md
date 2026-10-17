# Space Colony — Design Document

This document records the design decisions and implemented features of the game, so a new Claude session (for example on the phone app, with no access to the code) can pick up where the last one left off. Where it matters, it says whether something is **implemented** or **decided but not built**.

## Concept

A real-time colony survival sim played mostly through a **command line**. The player builds rooms on a grid, connects them with power wires and air pipes, and tries to keep a growing crew alive and happy. The map is a visual readout; **the console is the interface**. The README also mentions "custom scripts" as a long-term goal (not built, no design yet).

- Name: the repo and package are `space-colony`. The in-game banner and page title still say "Station Shell" (not yet renamed).
- License: **GPL-3.0**, chosen on purpose so nobody can take the code and release it closed-source.
- Time cannot be paused. It can only be slowed (`speed 1 | 1/2 | 1/4`).

## Tech

- TypeScript + Vite, no framework. Run with `npm install`, `npm run dev`. `npm run typecheck` runs `tsc --noEmit`.
- Canvas for the map, plain DOM for the HUD and terminal.
- Files in `src/`:
  - `sim.ts` — game state, room definitions, tick simulation (no DOM).
  - `commands.ts` — command parsing, execution and tab completion (no DOM).
  - `render.ts` — canvas drawing and the `View` object (cursor, hover, focus, build ghost).
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
| Rec Room | 30 | 2 | 3 | Needs power. Quarters within its radius get a happiness boost. |

Distance is straight-line (Euclidean) between cell centres. A wire is "working" only if the room is in the reactor's radius and the reactor has spare capacity; a pipe is working only if the plant is powered, the quarters are in radius, and the plant has fewer than 4 pipes in use.

## Simulation (one tick = 1 second at 1x)

- Materials: +1 plus 0.5 per colonist each tick.
- Oxygen and food are capped at 100. Colonists consume 0.5 oxygen and 0.3 food each per tick.
- Colonists arrive every 15 ticks when there is a free bed **and** happiness is at least 50. Beds beyond the crew count sit empty; a colonist without a working bed is flagged "NO BUNK".
- Happiness drifts 10% per tick toward a target, the average of four moods (each 0–1): **air** (oxygen/30), **food** (food/30), **housing** (housed/crew) and **fun** (0.15 base per housed colonist, plus 0.45 per powered rec room in range of their quarters).
- Log messages fire for things like lost power, lost air, low reserves (below 20), oxygen depleted, and new arrivals.

## Commands (implemented)

Flags can be abbreviated: `-loc`/`-l` for `-location`, `-f`/`-src` for `-from`, `-t`/`-dest` for `-to`.

- `help [command]` — list commands or explain one.
- `status` — colony-wide overview (power, oxygen, food, materials, population, happiness breakdown).
- `build <type> -location <cell>` — spend materials to build. Warns if the new room still needs wiring or piping.
- `wire -from <reactor> -to <room>` / `unwire -to <room>` — power lines.
- `pipe -from <oxygen plant> -to <quarters>` / `unpipe -to <quarters>` — air pipes.
- `demolish -location <cell>` — 50% refund. The hub cannot be demolished.
- `inspect -location <cell>` — details for a room (load, pipes, power/air state, nearby rec rooms) and its radius on the map. Also highlights its connections (below).
- `inspect reset` — clears the connection highlight.
- `rooms` — list every room with problem flags (NOT WIRED, NO POWER, NOT PIPED, NO AIR).
- `crew` — who is in the colony and who has a bunk.
- `speed <1 | 1/2 | 1/4>`, `clear`.

Note: `status` is the colony-wide overview. `inspect` is the per-structure status check, and the connection highlight is attached to it.

## Console UX (implemented)

- Tab completes commands, flags, room types and valid cells for the current flag. Up/Down (without Shift) recall command history. A hint line shows usage for the command being typed.
- Typing `build <type>` shows a ghost radius preview on the map under the hover cell.

### Connection highlight

After `inspect` on a room, that room, its wires and pipes (in and out), and the rooms on the far ends stay lit. Everything else dims to about 22% opacity but stays visible. The highlight stays until another `inspect`, `inspect reset`, inspecting empty space, or `demolish`. Other commands leave it alone. The dim level is the `DIM` constant in `render.ts`.

### Keyboard map cursor and autofill

Decision: clicking a cell is no longer just "inspect". The map cursor is a general-purpose cell picker whose cell can be inserted into whatever command is being typed.

- **Click** a cell, or press **Shift+Arrow keys**, to move the white selection box. This does not change the typed line.
- **Shift+Enter** types the selected cell into the current command:
  - `build <type>` → adds `-location <cell>`
  - `wire` / `pipe` → first fill is `-from`, then `-to`; once both exist, further fills replace `-to`
  - `unwire` / `unpipe` → `-to`
  - `demolish` → `-location`
  - empty line or `inspect` → `inspect -location <cell>`
  - any other command (such as `speed` or `help`) is left unchanged
- A **preview line** above the hint shows `⇧↵  <resulting command>` live, so the player can see exactly what Shift+Enter will do. It hides when nothing is selected or the fill would change nothing.
- Typical flow: click a cell, type `build rec `, press Shift+Enter, press Enter.
- Moving the keyboard cursor clears the mouse hover so the keyboard takes over. If nothing is selected yet, the first Shift+Arrow starts at the centre of the map.

## Map rendering

- Wires are amber, pipes are cyan. Working links animate as moving dashes; broken ones are dotted red.
- Rooms with missing power or air pulse red and show a bolt or droplet badge.
- Hovered or selected rooms with a radius show a range ring and light up the in-range cells.

## Ideas not built yet

- Custom scripts (from the README) — no design yet.
- Rename the in-game title from "Station Shell" to Space Colony.
- Optional: add `"license": "GPL-3.0-only"` to `package.json`.
- Optional: clear the connection highlight automatically when the layout changes (`build`, `wire`, `pipe`).
- Optional: make click-to-inspect still happen when the command line is empty.
