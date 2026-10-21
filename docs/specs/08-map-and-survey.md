# Slice 8: Larger map and `survey`

**Goal.** Make the map larger than the starting area, hide most of it behind fog, and add a `survey` command that spends compute to reveal it. This gives the colony somewhere to expand to, and later gives deposits and the rival colony somewhere to be.

**Status:** Not started. **Depends on:** Slices 3 and 5 (survey reuses the compute reservation that research introduces). Do this before Slice 9 (industry).

## Scope

- A larger world, with the start area revealed and the rest hidden.
- Fog drawn on the map, and a rule for what can be done on unrevealed cells.
- The `survey` command, which reserves compute for a duration and then reveals an area.
- A place in the data model for hidden features (deposits, hazards, the rival colony), without implementing any of them. Slice 9 adds deposits; the rival colony belongs to a later slice.

Out of scope: deposits and mines (Slice 9), the rival colony itself, waves and any danger that scales with the revealed area, outposts (parked).

## Design context

DESIGN.md, "Map expansion and survey". In short: survey is the outward-facing counterpart of research. Both occupy compute capacity, so they compete. Research leans toward Ascension, survey leans toward Conquest, and a Conquest run has to survey heavily to find the rival colony.

## World and cells

- The world is larger than 16 by 10 *(placeholder: 26 columns by 20 rows)*. Column letters currently run A to P, and the cell parser accepts a single letter plus a one- or two-digit row. A to Z gives 26 columns with no parser change; anything wider needs a new naming rule and is **Open**.
- **The starting layout must stay valid.** Hub I6, reactor H6, oxygen plant J6 and every example in API.md keep working. The simplest way to guarantee that is to keep the existing 16 by 10 block as the revealed start area and extend the world to the right and down. The drawback is that the hub then sits toward the top-left of the world, so expansion is lopsided. Re-centring the start area would change the starting coordinates and every example, so it is deferred. **Open**; default to extending right and down.
- The renderer's fit-everything view (zoom 1x) should fit the **revealed** area, not the whole world, so the start looks the same as today. Zoom and pan limits (0.5x to 4x, clamped) apply to the revealed area plus its fog border. Check that the clamps still keep a strip of the revealed map on screen.

## Fog

- Unrevealed cells draw as fog (placeholder: a dark hatched fill). The grid and column and row labels cover the full world so the player can see the extent. Whether labels for unrevealed areas are shown is **Open**.
- Fog has no contents until revealed. Do not draw hints of what is under it.
- **Targeting:** `build`, `wire`, `pipe`, `net` and any other command that places or connects something refuses an unrevealed cell with a clear message (for example `d12 is unsurveyed. Use survey to reveal it.`). `inspect` on an unrevealed cell says it is unsurveyed. `survey` is the only command that accepts an unrevealed cell. Map clicks and the keyboard cursor may land on fog; they only move the selection, as always.
- **Reach rules ignore fog.** Wires, pipes and data links already measure distance in cells. A link can only end on revealed cells, so in practice a link must be placed after the area is surveyed. Nothing special is needed beyond the targeting rule above.

## `survey`

Placeholder syntax:

```
survey -location <cell>
survey
survey cancel <cell>
```

**`survey -location <cell>`** starts a survey centred on the cell. It uses the existing global `-location` aliases (`-loc`, `-l`). Behaviour:

- It reveals the cells within a **survey radius** of the target *(placeholder: radius 3, so a revealed patch about 7 cells across)*. The radius ring appears as a preview while the line is typed, like the build preview for rooms with a radius.
- **Reserves compute** *(placeholder: 2 capacity)* for a duration *(placeholder: 30 ticks)*. If there is not enough free compute the command is refused with the shortfall, as `research` is. Use the same reservation mechanism as research (Slice 5), so the two compete for the same capacity.
- **Adjacency rule (placeholder):** the target cell must be within a short distance of already-revealed ground *(placeholder: within 3 cells of a revealed cell)*, so the player expands outward from the colony rather than jumping to a far corner. Out of reach gives: `d18 is too far from surveyed ground. Survey closer to the edge first.` Whether longer-range surveys should exist (higher cost, longer duration) is **Open**.
- When the survey finishes, the area is revealed permanently and the log says so, listing anything notable (once deposits and hazards exist: `Survey complete: 2 deposits found.`).
- A survey of an area that is already fully revealed is refused with a clear message.
- Several surveys may run at once if capacity allows. A survey that loses its compute (a rack goes offline) pauses and keeps its progress, exactly as research does.

**`survey`** with no arguments lists active surveys with progress, free compute, and how much of the world is revealed (`Surveyed: 34% of the map`).

**`survey cancel <cell>`** cancels an active survey and releases its compute. Progress is lost.

**Tab completion and autofill.** `survey` takes `-location` like `build`; Shift+Enter fills the selected cell. Tab completes `cancel` and the flag name.

**Reporting.** `status compute` shows survey reservations alongside research. `status alerts` reports paused surveys. `status` may show a `Surveyed` percentage line once the first survey has run. Add a log line when a survey starts.

## Hidden features

Slice 8 only creates the container:

- The world data model has a list of **features** (type, cell, hidden or revealed). A feature is revealed when its cell is revealed.
- No feature types are defined here. Slice 9 adds deposits. A later slice adds hazards and the rival colony. The rival colony is placed far from the hub at world generation and stays hidden until its cell is surveyed.
- World generation uses a seed (DESIGN.md, Proposed). Use a seeded random source so that features, once they exist, are reproducible for a given run.

## Interactions to get right

- The hub, the starting rooms and all existing behaviour are unchanged. Loading the game should look and play identically to today until `survey` is used.
- Previews: the survey preview draws the radius ring and, if the target is unreachable or the line would be refused, draws it red.
- `view` commands (zoom, pan, reset, room types, categories) keep working, and `view reset` restores the fit-everything view of the revealed area.
- Revealed area only ever grows. There is no way to re-fog it.
- `status` percentages and the fit-everything view should be recomputed when a survey completes, so the camera can offer the larger view (`view reset`).

## Human test checklist

1. Load the page. The map looks the same as today in the starting area, with fog around it. Column and row labels cover the larger world, or the fog border shows the extent.
2. Build rack, wire it, and net it so you have compute capacity (Slices 3 and 4). `status compute` shows free capacity.
3. Type `survey`. It lists no active surveys, free compute, and the surveyed percentage.
4. Type `survey -l <a fog cell adjacent to the revealed edge>`. A radius ring previews while typing. Press Enter. It starts and reserves compute. `status compute` shows the reservation.
5. Try `survey -l <a cell far from the revealed edge>`. You get the too-far message.
6. Try `build garden -l <fog cell>`. You get the unsurveyed message. Try `inspect <fog cell>`: it reports unsurveyed.
7. Wait for the survey to finish (use `speed 1/4` to watch progress in `survey`). The area is revealed, a log line appears, and the percentage rises.
8. `view reset`. The fit-everything view now includes the new area. Zoom and pan still work and are clamped sensibly.
9. Build something in the newly revealed area and connect it (reach rules unchanged).
10. Start two surveys when capacity allows both, then a third that does not fit: you get the shortfall message.
11. Start a survey, then `unwire` the rack. The survey pauses with a warning. Rewire it and it resumes.
12. `survey cancel <cell>` releases the compute and loses progress.
13. `survey -l <already revealed cell>` is refused with a clear message.
14. Shift+Enter with a fog cell selected fills `-location` for `survey`.
15. Reload the page and confirm the opening still plays exactly as before (hub I6, the starting rooms, and the starting coordinates in API.md still work).
16. `npm run typecheck` passes.

## Open questions

- World size and shape, and where the start area sits in it (default: keep the current coordinates and extend right and down).
- Cell names beyond column Z (not needed at 26 columns).
- Long-range surveys at higher cost, or only edge-adjacent surveys.
- Whether the map becomes more dangerous as more of it is revealed (enemy exposure on edges). Not in this slice.
- Whether survey and research share a single "projects" list in the UI (`projects`?) or stay separate commands. Lean toward separate commands with a shared reservation mechanism underneath.
