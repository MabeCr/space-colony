# Slice 6: Multi-cell footprints

**Goal.** Let a room occupy more than one cell. This is the groundwork for Mk3 buildings, which are proposed to be 2x2 so that a player who leaves spare room is rewarded. This slice changes how the grid works and ships no new gameplay room.

**Status:** **Parked (2026-10-20).** Mk3 buildings are 1x1 and use an adjacency rule (Slice 7), so nothing needs this. Kept for reference in case Mk3 needs more weight later. **Depends on:** none.

## Why a separate slice

Today the grid assumes one cell per room. Everything that looks a room up by cell, measures distance, draws a room, previews a build or highlights a room has to learn about footprints. That is a cross-cutting change and deserves its own testing, independent of any new room.

## Rules

- A room has a **footprint** of width and height in cells. Every existing room is 1x1.
- A multi-cell room is **anchored** on its top-left cell. The `-location` given to `build` is the anchor, and the room occupies the anchor plus the cells to the right and below.
- A room that would extend past the grid edge, or overlap another room, is refused. The message names the cell that blocks it.
- **Occupancy:** every cell of a room is occupied. `roomAt` for any of its cells returns the room.
- **Distance:** distance to a multi-cell room is measured from the **centre of the footprint** to the other room's centre. This keeps the existing Euclidean rule and gives 2x2 rooms a centre on a cell corner. Whether to measure from the nearest edge instead is **Open**; keep the choice in one function so it can change.
- Radius rings are centred on the footprint centre.
- Wires, pipes and data links attach to the room as a whole. Their lines draw to the footprint centre.

## Commands and UI

- `build <type> -location <cell>`: the cell is the anchor. The ghost preview draws the whole footprint, and shows red if any cell is blocked or off-grid. The build still does not check cost or wiring in the preview, as today.
- Any command that takes a cell and refers to a room (`wire`, `pipe`, `net`, `unwire`, `demolish`, `inspect`, `upgrade`) accepts **any** cell of the room, not just the anchor. Messages that echo the cell use the anchor.
- `rooms` and `inspect` show the anchor cell and the footprint (`2x2`).
- Shift+Enter autofill: if the selected cell is part of a room, fill the room's anchor so the typed command is clear.
- The map highlights the whole footprint on hover and selection, and the cursor box covers it.
- `view <type>` lists anchors.

## Test room

This slice needs a multi-cell room to test with, but no real Mk3 room exists yet. Add a **developer-only** test room (placeholder type `testbed`, 2x2, cost 0, no power draw, no effect) that is only buildable when a dev flag is on (for example `?dev` in the URL). It must not appear in `build`, `help`, tab completion or `view` for normal play. Remove it, or leave it behind the flag, when Slice 7 lands.

## Human test checklist

All steps use the dev flag so the test room is available.

1. Load the page with the dev flag. `build testbed -l d3`. A 2x2 room appears on d3, e3, d4, e4.
2. Type `build testbed -l d3` again. It is refused as occupied, naming a blocking cell.
3. `build testbed -l p10` (last row and column). It is refused for running off the grid. Try `build testbed -l o9`, which fits exactly.
4. Type a build line with a free anchor but an overlapping neighbour, such as `build testbed -l e4` after step 1. The ghost shows red and the command is refused.
5. Hover each of the four cells of the room. The whole footprint highlights, not one cell.
6. `inspect e4`, a non-anchor cell. It inspects the testbed and reports the anchor d3 and the 2x2 footprint.
7. `demolish -l e4`. It removes the whole room and refunds as normal.
8. Build a 1x1 room next to the testbed and confirm radius and range for `wire` is measured from the footprint centre (a reactor 4 away by centre should work, and 4.3 should not). Compare against the `Out of range: ... is <d> cells` messages.
9. The map draws wires and pipes to the centre of the testbed when linked (`wire` may not apply to it; use a temporary data or power setting if needed, or skip this step if the test room cannot be linked and note it).
10. Click each of its cells and press Shift+Enter on `demolish`; the preview shows the anchor.
11. Existing 1x1 rooms behave exactly as before: build, wire, pipe, inspect, demolish, view, zoom and pan all still work.
12. Load without the dev flag. The test room is not offered anywhere.
13. `npm run typecheck` passes.

## Open questions

- Distance from footprint centre or nearest edge?
- Should the anchor be top-left, or should the player click any cell and the game place the room around it? Top-left is the simplest to type and test.
- How should the footprint interact with zoom and pan hit-testing? Mouse clicks should resolve to the room first, the cell second.
