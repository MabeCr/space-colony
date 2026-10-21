# Slice 2: Tiers and `upgrade`

**Goal.** Give rooms a tier and let the player upgrade Mk1 to Mk2 in place with a command. This keeps the player's opening base design useful.

**Status:** Built. Automated checks: `npm run smoke`. The browser checklist below, including the map border, is still to run. **Depends on:** Slice 1.

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

**Display.** `rooms`, `inspect` and the map show the tier (for example `Reactor Mk2`). Mk1 may omit the suffix. On the map, Mk2 is a **second, inner border** inside the room's normal border, visible at a glance even at the fit-everything zoom. Do not use pips for the tier: pips are reserved for staff slots (Slice 10). The hover label also says Mk2.

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

## Design for growth

The Mk3 step is a new building, and a category may eventually have two Mk3 flavours (an Ascension one and a Conquest one, see DESIGN.md). So the data model should not assume exactly one Mk3 per Mk1 type. The only Mk3 behaviour in this slice is the already-Mk2 message, which should say that Mk3 is a separate building without naming a specific one.

Mk2 rooms will also get a crew staff slot and a staffing bonus in Slice 10. Nothing for that is needed here, but keep the per-tier stat lookup separate from any bonus multiplier so the staff bonus can be applied afterwards without changing the tier table.

## Interactions to get right

- Upgrading a reactor changes its radius. Links that were out of range may start working, and none should break. The reverse (a downgrade) does not exist.
- A reactor upgrade that adds capacity can fix an overloaded reactor. `status power` and `status alerts` must reflect it on the next tick.
- Upgrading quarters adds a bed. Housing assignment (hub 4, then each working quarters) must use the room's capacity.
- **`demolish` refunds half of everything spent on the room** (build cost plus the upgrade cost, if upgraded), rounded down. No new state is needed: the amount follows from the room's tier.
- **A broken room can be upgraded.** The upgrade works and is paid for, but the room is still broken until it is repaired (wired, powered, in range). After a successful upgrade of a room that is not working, print a warning saying so.
- **Upgrades that raise power draw** (the oxygen plant and garden at Mk2): if the room is currently powered and its reactor lacks the spare power for the extra draw, refuse, as `wire` does: `Reactor at <cell> has <n> spare power, and the upgrade needs <m> more. Build another reactor or upgrade this one.` If the room is not currently powered, the upgrade goes ahead with the warning above.
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
10. `demolish` an upgraded room. It refunds half of build plus upgrade cost, rounded down. Wires and pipes from it drop as before.
10a. Overload a reactor so a garden on it has no spare power, then `upgrade` that garden: it is refused with the spare-power message. `unwire` the garden and upgrade it: it succeeds with a warning that it is still not working.
11. Type `upgrade -l ` and press Shift+Enter with a cell selected. The cell is filled in. Check the preview line.
12. `rooms` and `view reactor` still work and show the tier.
13. `npm run typecheck` passes.

## Open questions

None open. Decided 2026-10-20: refund half of everything spent; inner border on the map; broken rooms can be upgraded but stay broken; power-raising upgrades are refused when the reactor lacks spare. Revisit the broken-room rule if play shows it is unfair.
