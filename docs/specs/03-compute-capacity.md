# Slice 3: Compute capacity

**Goal.** Add compute as a capacity resource, like power, produced by a new room. Nothing consumes it yet; this slice builds the supply side and the reporting so that research (Slice 5) and scripts have something to draw on.

**Status:** Not started. **Depends on:** Slice 1.

## Scope

- A Compute category with one room, the server rack.
- A compute capacity total in the simulation.
- Compute shown in `status`, `status compute`, `rooms`, `inspect` and `status alerts`.

Out of scope: data links and the network switch (Slice 4), research and scripts as consumers (Slice 5 and later), Mk2 racks (they come with the Slice 2 tier table; add the Mk2 rack row there when this slice lands).

## The server rack

| Field | Value |
|---|---|
| Type | `rack` |
| Label | Server Rack |
| Category | `compute` |
| Cost | 35 *(placeholder)* |
| Power draw | 2 *(placeholder)* |
| Radius | none |
| Effect | Produces 4 compute capacity while powered *(placeholder)* |

A rack needs power (`wire` from a reactor) like other power-using rooms. A rack that is not powered produces nothing and is flagged `NOT WIRED` or `NO POWER` by the existing `rooms` logic. No new link type is needed in this slice.

Compute capacity is the sum of 4 for every powered rack. Compute **used** is zero in this slice. Compute **free** is capacity minus used.

## Behaviour

**`status`** gains a Compute line in the colony overview: used and capacity, with the same trend arrow style as the other lines (`used / capacity`, arrow compares capacity to 10 ticks ago). Show it only once at least one rack has been built, so the early screen is unchanged.

**`status compute`** follows the existing `status power` pattern:

- A column graph of capacity over time, using `-time <ticks>` as the other graphs do. History samples gain `computeSupply` and `computeUsed`.
- A trend line.
- Diagnostics: capacity, used, free; each rack with its state; each rack that is unwired, out of range or on an overloaded reactor; a suggestion to build another rack when free capacity is zero (only relevant once consumers exist; keep the text ready but quiet when used is zero).

**`status alerts`** reports racks with the same problem flags as other rooms. It does not alert on "no compute" before anything uses it.

**`rooms`** lists racks with the standard flags. A working rack ends with the green `[OPERATIONAL]` tag.

**`inspect`** on a rack shows its power state and its capacity contribution.

**`build compute`** (from Slice 1) now lists the rack. Update the category table in Slice 1's docs.

**Autofill and previews.** `wire` works on racks with no change to the autofill rules. The build ghost shows the rack. The map draws the rack with its own colour and a small chip-style icon; the exact look is up to the implementer.

## Human test checklist

1. Load the page. `status` shows no Compute line.
2. `build compute` lists the rack with cost, draw and effect.
3. `build rack -l h5` (adjust to a free cell within reactor range). You are warned that it is not wired yet.
4. `rooms` shows the rack flagged `NOT WIRED`.
5. `wire -f h6 -t h5`. `rooms` now shows the rack as operational.
6. `status` now shows a Compute line with capacity 4 and used 0.
7. `status compute` shows a graph, the trend and the rack listed. Wait about 30 ticks (at `speed 1`), run `status compute -time 10` and confirm the graph updates.
8. `unwire -t h5`. Compute capacity drops to 0 on the next tick and `status` reflects it.
9. Rewire, then build a second rack and wire it. Capacity is 8.
10. Overload the reactor (build several power-using rooms until spare power is gone) and confirm racks on the overloaded reactor report `NO POWER` and do not count toward capacity.
11. `demolish` a rack. Capacity drops accordingly and the refund is half the cost rounded down.
12. `view compute` highlights racks.
13. `npm run typecheck` passes.

## Open questions

- Should compute capacity show in the HUD as well as in `status`?
- Does the hub itself provide a small amount of base compute (so early research is possible with no rack)? DESIGN.md says the hub is smart enough to provide research; this slice should decide whether that means a baseline capacity of 1 or 2. Default to zero baseline and revisit in Slice 5.
