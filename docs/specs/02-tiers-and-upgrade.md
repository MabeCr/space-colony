# Slice 2: Tiers and `upgrade`

**Goal.** Give rooms a tier and let the player upgrade Mk1 to Mk2 in place with a command. This keeps the player's opening base design useful.

**Status:** Not started. **Depends on:** Slice 1.

## Scope

- A tier on every room (1 to 3). Rooms start at Mk1.
- `upgrade` lists upgradable rooms. `upgrade -location <cell>` upgrades one from Mk1 to Mk2.
- Mk2 stats for the five existing buildable types.

Out of scope: Mk3 (Slice 7), research gating (Slice 5), new link types. In this slice Mk2 is available to everyone for a materials cost. Slice 5 later puts it behind research.

## Behaviour

**`upgrade -location <cell>`** (aliases `-loc`, `-l`, as everywhere):

- The room must exist, must be a buildable type, and must be at Mk1.
- Spends the upgrade cost from materials. Fails with the usual `Not enough materials` style message.
- The room keeps its cell, its wires and its pipes. Its stats change immediately.
- The map cursor moves to the room.
- A Mk2 room cannot be upgraded further here. Say so: `Reactor at h6 is already Mk2. Mk3 is a separate building.` The Mk3 wording is a placeholder until Slice 7.
- The Command Hub cannot be upgraded.

**`upgrade` with no arguments** lists every room that can be upgraded, with the cost and the change:

```
> upgrade
  h6  Reactor        Mk1 -> Mk2   cost 25   output 12 -> 18, radius 4 -> 5
  j6  Oxygen Plant   Mk1 -> Mk2   cost 20   pipes 4 -> 6
```

**Errors** follow the existing style: missing `-location`, invalid cell, `Nothing is built at <cell>.`, hub, already Mk2, not enough materials.

**Display.** `rooms`, `inspect` and the map show the tier (for example `Reactor Mk2`). Mk1 may omit the suffix. The map should show Mk2 in a way that is visible at a glance, such as a small pip. Exact styling is up to the implementer.

## Mk2 numbers (placeholder)

| Type | Change | Upgrade cost |
|---|---|---|
| reactor | Output 12 to 18, radius 4 to 5 | 25 |
| oxygen | Pipes 4 to 6, output 3 to 4 | 20 |
| garden | Output 2 to 3 | 15 |
| quarters | Beds 2 to 3 | 12 |
| lounge | Radius 3 to 4 | 18 |

Power draw rises modestly where the room does more (placeholder: +1 for the oxygen plant and the garden). Costs are roughly 60 percent of the build cost.

Existing constants (`REACTOR_OUTPUT`, `OXYGEN_PIPES`, `OXYGEN_OUTPUT`, `GARDEN_OUTPUT`, `QUARTERS_CAPACITY`) become per-tier lookups instead of single values. Everything that reads them must use the room's tier: `recompute`, the housing slot count, the status diagnostics, the range checks in `wire` and `pipe`, the radius rings and the previews.

## Interactions to get right

- Upgrading a reactor changes its radius. Links that were out of range may start working, and none should break. The reverse (a downgrade) does not exist.
- A reactor upgrade that adds capacity can fix an overloaded reactor. `status power` and `status alerts` must reflect it on the next tick.
- Upgrading quarters adds a bed. Housing assignment (hub 4, then each working quarters) must use the room's capacity.
- `demolish` refunds half the **build** cost for now. Whether the refund should include the upgrade spend is **Open**. Leave it as is and note the choice.
- Wire and pipe previews and radius rings use the current tier's radius.
- Autofill: `upgrade` takes `-location` like `build`. Shift+Enter fills `-location` for `upgrade`. Add it to the autofill table in API.md.

## Human test checklist

1. Load the page. Type `upgrade`. You see the Reactor and Oxygen Plant listed with costs. The hub is not listed. Materials may be too low at first; if so, wait.
2. Type `upgrade -l h6` with too few materials. You get a not-enough-materials error and nothing changes.
3. Wait until you have enough, then `upgrade -l h6`. It succeeds. `inspect h6` shows Mk2, output 18 and radius 5. The radius ring on the map is larger when you hover or select it.
4. `status power`. Supply is now higher than before.
5. Build a garden at the edge of the old reactor radius so it is out of range (a cell 5 away), try `wire -f h6 -t <cell>`: it now works with Mk2.
6. Build quarters, wire and pipe them. `status colonists` shows total beds. Upgrade the quarters: total beds rises by one.
7. Upgrade the oxygen plant. `inspect j6` shows the higher pipe limit. Pipe a fifth quarters to it; it works.
8. Try `upgrade -l h6` again. You get the already-Mk2 message.
9. Try `upgrade -l i6` (the hub). You get a clear refusal. Try `upgrade -l a1` (empty). You get `Nothing is built at a1.`
10. `demolish` an upgraded room. It refunds half the build cost (not the upgrade). Wires and pipes from it drop as before.
11. Type `upgrade -l ` and press Shift+Enter with a cell selected. The cell is filled in. Check the preview line.
12. `rooms` and `view reactor` still work and show the tier.
13. `npm run typecheck` passes.

## Open questions

- Does `demolish` refund the upgrade spend?
- Should the tier be shown on the map as a pip, a number or a colour change?
- Should upgrading require the room to be working, or may a broken room be upgraded?
