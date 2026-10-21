# Slice 7: Mk3 buildings and the coolant link

**Goal.** Add the first Mk3 buildings, which are new buildings with a larger boost, a placement rule (next to a Mk2) and a new link type. This slice introduces coolant and delivers the fusion core and the data core as the first two Mk3 rooms.

**Status:** Not started. **Depends on:** Slices 2 and 5.

## Scope

- The coolant link and a coolant source room.
- Two Mk3 buildings: the fusion core (power) and the data core (compute).
- The rule for how a Mk3 relates to the Mk2 it grows out of.

Out of scope: the other Mk3 rooms (atmosphere processor, bio-dome, habitat ring, refinery, shield or beam array, antivirus core). They follow the same pattern and are added in later slices, each with the link type it introduces (data and cargo are already in Slices 4 and 9).

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

Mk3 buildings are separate room types with their own build entry, gated by research (Slice 5) and by a placement rule: a Mk3 must be built next to a Mk2 room of the same category (see below). They are 1x1.

| Type | Label | Category | Cost | Power | Placed next to | Needs |
|---|---|---|---|---|---|---|
| `fusion` | Fusion Core | power | 120 *(placeholder)* | 0 | A Mk2 reactor | A coolant link |
| `datacore` | Data Core | compute | 90 *(placeholder)* | 4 | A Mk2 compute room (rack or switch) | Power, data link and a coolant link |

Effects *(placeholder)*: the fusion core produces 40 power with radius 6; the data core provides 16 compute capacity.

New techs: `mk3-fusion` (requires `mk2-reactor`) and `mk3-datacore` (requires `mk2-rack`, plus the data link tech if any). Each reserves compute while researched, per Slice 5.

## Fork note

The fusion core and the data core are the **Ascension-flavour** Mk3 for their categories (stability, efficiency, research). DESIGN.md proposes a Conquest sibling for each, such as an overcharged core and a command core, to be added once the win paths are specced and probably exclusive per category. Do not build the siblings here. Do name types, techs and data structures so that adding a sibling later is a pure addition: for example, avoid a one-to-one `mk3` field on the Mk1 type, and keep tech ids specific (`mk3-fusion`, not `mk3-power`).

## How Mk3 relates to Mk2

This is the central design question. Two options; pick one, then record the choice in DESIGN.md and API.md.

**Decided 2026-10-20: add-on, with an adjacency rule.** The Mk3 is built on an empty cell **next to a Mk2** room of the same category *(placeholder: any of the 8 surrounding cells; any Mk2 in the category, not only the same type)*, and the Mk2 stays. This makes the Mk3 a placement decision (plan where the Mk2 goes and leave a free cell beside it) without multi-cell footprints, which are parked (Slice 6).

- **The Mk2 is a standing requirement, not only a build check.** The rule is checked when building, and every tick after. If the Mk2 next to a Mk3 is demolished, the Mk3 **stops working** until a Mk2 of its category is next to it again. This works like a broken link: the Mk3 stays built and shows a flag (`NO HOST`, placeholder), produces nothing, and keeps its wires, coolant and data links. A log line says which Mk3 went offline and why.
- `demolish` on a Mk2 that hosts a Mk3 still works, but the output warns: `This Mk2 hosts the Fusion Core at <cell>, which will stop working.` (it is not a confirmation prompt; time cannot be paused).
- Refused with: `A Mk3 <label> must be built next to a Mk2 <category> room. None is next to <cell>.`
- The build ghost does not check this, like it does not check cost or wiring today.
- A radiator (Mk1) does not count as the Mk2 for any Mk3.

## Behaviour

- `build power` and `build compute` list the Mk3 types with their research lock and cost.
- Building a Mk3 shows the usual ghost. The usual warning lists what is missing: wire (for the data core), net (for the data core), and chill (for both). Example: `Not cooled yet: chill -from <radiator> -to <cell>`.
- A cooled fusion core adds its power to the same reactor system as other reactors: `wire` from it works, `status power` includes it, and `inspect` shows load and radius. Treat it as a reactor with a larger output and radius. It should show as a reactor for `view reactor`.
- A data core adds capacity to the compute total when powered, networked and cooled.
- `status` and `status alerts` report overheating and not-cooled Mk3 rooms.

## Human test checklist

1. Start a game and research `mk2-reactor`, then `mk3-fusion` (Slice 5). Let both finish.
2. `build power` lists the radiator and the fusion core. `build fusion -l d3` is refused unless you have enough materials; wait or reduce costs while testing.
3. Build a radiator near the reactor and wire it. Build a fusion core on a free cell next to the Mk2 reactor. You are warned it is not cooled.
4. `rooms` shows the fusion core as `NOT COOLED`. `status power` shows no extra supply from it yet.
5. `chill -f <radiator> -t <fusion>`. The flag clears. `status power` supply rises by the fusion core's output. `inspect` shows radius 6 on the map.
6. Wire a room beyond the original reactor's radius to the fusion core, then confirm it is powered. Confirm `view reactor` highlights the fusion core.
7. Fill the radiator's three slots with consumers; the fourth is refused with a no-free-slots message.
8. `unwire` the radiator. The fusion core reports `OVERHEATING` and stops producing. Rewire it to recover.
9. Build the data core, wire it, net it, chill it. Compute capacity rises by its amount. Break each of the three links in turn and confirm the right flag appears and the capacity falls.
10. Try building a Mk3 on a free cell that is not next to a Mk2 of its category: the build is refused with the adjacency message. Build one diagonally next to the Mk2: it works.
11. `demolish` a Mk3. The refund is half the cost; links to it drop on the next recompute.
11a. With a working Mk3 next to its only Mk2, `demolish` the Mk2. The output warns that the Mk3 will stop. The Mk3 shows `NO HOST`, stops producing (power supply or compute capacity falls), and a log line explains it. Its wires and links stay recorded. Build another Mk2 of the category next to it: it resumes.
12. `npm run typecheck` passes.

## Open questions

- Adjacency details: 4 or 8 neighbours, and same type or same category.
- Whether one Mk2 can host several Mk3 rooms at once, or only one. Default: several, since the Mk2 only has to be next to each.
- Whether the hosting Mk2 must itself be working (powered, in range), or only standing. Default: only standing.
- The final coolant verb names.
- Should an overheating room eventually take damage or shut down permanently? Not in this slice.
- Where does coolant live on the Mk3 side of other categories (atmosphere processor, bio-dome)? Left for later slices.
- The Conquest-flavour siblings and whether the flavours are exclusive per category (DESIGN.md, Mk3 fork). Not decided here.
