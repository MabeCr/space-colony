# Slice 7: Mk3 buildings and the coolant link

**Goal.** Add the first Mk3 buildings, which are new buildings with a larger boost, a larger footprint and a new link type. This slice introduces coolant and delivers the fusion core and the data core as the first two Mk3 rooms.

**Status:** Not started. **Depends on:** Slices 2, 5 and 6.

## Scope

- The coolant link and a coolant source room.
- Two Mk3 buildings: the fusion core (power) and the data core (compute).
- The rule for how a Mk3 relates to the Mk2 it grows out of.

Out of scope: the other Mk3 rooms (atmosphere processor, bio-dome, habitat ring, refinery, shield or beam array, antivirus core). They follow the same pattern and are added in later slices, each with the link type it introduces (data and cargo are already in Slices 4 and 8).

## Coolant

The verb names are placeholders: `chill` and `unchill`.

```
chill -from <coolant source> -to <consumer>
unchill -to <consumer>
```

- A **coolant source** is a new room, the **radiator** (placeholder; category: power; cost 25; power draw 1; radius 4; feeds up to 3 consumers).
- A **coolant consumer** is a room that needs cooling. Today that is the fusion core and the data core; later, turrets and other Mk3 rooms.
- Rules mirror pipes: a link works only if the source is powered, the consumer is within the source's radius, and the source has a free slot. Links persist when broken. Rerouting replaces an old link.
- Errors, `rooms` flags, `inspect`, the map colour (placeholder: pale blue-white), animation, previews, autofill and tab completion follow the same patterns as `pipe` and the data link. Flags: `NOT COOLED` (needs coolant, has no link) and `OVERHEATING` (has a link that is not delivering).
- An uncooled or overheating Mk3 room does not produce. A later slice may add damage. Do not add it here.

## Mk3 buildings

Mk3 buildings are separate room types with their own build entry, gated by research (Slice 5) and by a footprint of 2x2 (Slice 6).

| Type | Label | Category | Cost | Power | Footprint | Needs |
|---|---|---|---|---|---|---|
| `fusion` | Fusion Core | power | 120 *(placeholder)* | 0 | 2x2 | A coolant link |
| `datacore` | Data Core | compute | 90 *(placeholder)* | 4 | 2x2 | Power, data link and a coolant link |

Effects *(placeholder)*: the fusion core produces 40 power with radius 6; the data core provides 16 compute capacity.

New techs: `mk3-fusion` (requires `mk2-reactor`) and `mk3-datacore` (requires `mk2-rack`, plus the data link tech if any). Each reserves compute while researched, per Slice 5.

## Fork note

The fusion core and the data core are the **Ascension-flavour** Mk3 for their categories (stability, efficiency, research). DESIGN.md proposes a Conquest sibling for each, such as an overcharged core and a command core, to be added once the win paths are specced and probably exclusive per category. Do not build the siblings here. Do name types, techs and data structures so that adding a sibling later is a pure addition: for example, avoid a one-to-one `mk3` field on the Mk1 type, and keep tech ids specific (`mk3-fusion`, not `mk3-power`).

## How Mk3 relates to Mk2

This is the central design question. Two options; pick one, then record the choice in DESIGN.md and API.md.

- **Option A: Add-on (default).** The Mk3 is built on empty space, and the Mk2 stays. The player's base keeps both, and the Mk3 is an extra, large building. Simple to implement and to test.
- **Option B: Replace.** Building the Mk3 requires demolishing, or automatically consumes, a Mk2 of the same category within range, with a refund bonus. It reinforces "leave space and plan ahead" less, but gives a sharper puzzle about layout.

This spec assumes Option A. If Option B is chosen, add a requirement and error: `Needs a Mk2 <type> within <n> cells to replace.`

## Behaviour

- `build power` and `build compute` list the Mk3 types with their research lock and cost.
- Building a Mk3 shows the 2x2 ghost. The usual warning lists what is missing: wire (for the data core), net (for the data core), and chill (for both). Example: `Not cooled yet: chill -from <radiator> -to <cell>`.
- A cooled fusion core adds its power to the same reactor system as other reactors: `wire` from it works, `status power` includes it, and `inspect` shows load and radius. Treat it as a reactor with a larger output and radius. It should show as a reactor for `view reactor`.
- A data core adds capacity to the compute total when powered, networked and cooled.
- `status` and `status alerts` report overheating and not-cooled Mk3 rooms.

## Human test checklist

1. Start a game and research `mk2-reactor`, then `mk3-fusion` (Slice 5). Let both finish.
2. `build power` lists the radiator and the fusion core. `build fusion -l d3` is refused unless you have enough materials; wait or reduce costs while testing.
3. Build a radiator near the reactor and wire it. Build a fusion core on a free 2x2 area. You are warned it is not cooled.
4. `rooms` shows the fusion core as `NOT COOLED`. `status power` shows no extra supply from it yet.
5. `chill -f <radiator> -t <fusion>`. The flag clears. `status power` supply rises by the fusion core's output. `inspect` shows radius 6 on the map.
6. Wire a room beyond the original reactor's radius to the fusion core, then confirm it is powered. Confirm `view reactor` highlights the fusion core.
7. Fill the radiator's three slots with consumers; the fourth is refused with a no-free-slots message.
8. `unwire` the radiator. The fusion core reports `OVERHEATING` and stops producing. Rewire it to recover.
9. Build the data core, wire it, net it, chill it. Compute capacity rises by its amount. Break each of the three links in turn and confirm the right flag appears and the capacity falls.
10. Try building a 2x2 Mk3 on a spot with only a 1x2 gap: the ghost shows red and the build is refused.
11. `demolish` a Mk3. The refund is half the cost; links to it drop on the next recompute.
12. `npm run typecheck` passes.

## Open questions

- Add-on or replace (see above).
- The final coolant verb names.
- Should an overheating room eventually take damage or shut down permanently? Not in this slice.
- Where does coolant live on the Mk3 side of other categories (atmosphere processor, bio-dome)? Left for later slices.
- The Conquest-flavour siblings and whether the flavours are exclusive per category (DESIGN.md, Mk3 fork). Not decided here.
