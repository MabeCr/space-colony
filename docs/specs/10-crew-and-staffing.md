# Slice 10: Crew pool, roles and staffing

**Goal.** Make crew roles matter without making the player manage people. Crew are a pool counted by role. Mk2 rooms get a staff slot that gives a bonus when a matching-role colonist fills it, and the game assigns crew automatically.

**Status:** Not started. **Depends on:** Slice 2 (tiers). It benefits from Slices 3 and 5 for the scientist role, but does not require them.

## Scope

- Roles as counts, with a generalist default.
- Staff slots on Mk2 rooms, a staffing bonus, and auto-assignment.
- `assign` and `unassign` to pin which rooms are staffed first.
- A richer `crew` command, `view crew`, and pips on the map.
- Staffing information in `rooms`, `inspect`, `status colonists` and `status alerts`.

Out of scope: the academy and `train` (Slice 11), Mk3 staffing requirements (Slice 7 can add them once this exists), moving crew dots (later polish), crew loss in waves, and per-person simulation of any kind.

## Today's behaviour that changes

Today each colonist has a name and a random role from a list of eight labels, and the role does nothing. `crew` prints the population and one line per colonist: name, role, and `housed` or `NO BUNK`. Housing is assigned in order (hub holds 4, each working quarters 2). Materials income is 1 plus 0.5 per colonist.

After this slice, crew still have names (flavour), still need beds and still raise income, but their role carries meaning.

## Roles

*(placeholder mapping, from DESIGN.md)*

| Role | Staffs |
|---|---|
| engineer | power and life support rooms |
| botanist | food rooms |
| scientist | compute rooms (more compute) |
| mechanic | industry and maintenance rooms |
| medic | habitation rooms (bigger happiness effect) |
| pilot | defense rooms |
| generalist | nothing special; the default |

- The starting four colonists and later arrivals are **generalists** unless the game says otherwise. To make this slice testable, the starting crew may include one or two specialists *(placeholder: 1 engineer, 1 botanist, 2 generalists)*.
- Existing role labels that do not map to a category (Cook, Technician) are **Open**; the simplest choice is to drop them and keep the table above.
- Names stay in the data (used by `crew <role>` and the log) and have no mechanical effect.

## Staff slots and the bonus

- Every **Mk2** room has **one** staff slot *(placeholder)*. Mk1 rooms have none, so the opening game is unchanged.
- A slot is **filled** by a colonist of the matching role. The slot's room gets a bonus on top of its Mk2 stats *(placeholder: +20 percent of the room's output or effect)*.
- An empty slot costs nothing. The room just runs at plain Mk2.
- A colonist fills at most one slot. A colonist in a slot is still housed and still counts for income, food and oxygen.
- Whether a generalist can fill a slot at reduced effect is **Open**; default: no.
- Mk3 rooms will **require** staff (DESIGN.md, Proposed). That is added in Slice 7 or later, not here.

### What the bonus does for each Mk2 room *(placeholder)*

| Room | Bonus when staffed |
|---|---|
| Reactor Mk2 | +20 percent output |
| Oxygen plant Mk2 | +20 percent output |
| Hydroponics Mk2 | +20 percent output |
| Quarters Mk2 | none (no staff needed) |
| Lounge Mk2 | +20 percent happiness effect (medic) |
| Server rack Mk2 | +20 percent compute (scientist) |

Quarters take no staff. Slices that add Mk2 rooms later should declare their staff role, or none.

## Auto-assignment

- On any change (a colonist arrives, a room is built, upgraded, powered or lost, a pin changes), the game recomputes assignments: for each staff slot, if there is an unassigned colonist of the matching role, assign one.
- When there are fewer matching colonists than slots, **pinned rooms** (below) fill first, then rooms in a fixed order (placeholder: oldest first). Assignments should be stable: a filled slot is not reshuffled on every tick, only when its colonist or room changes.
- A room that is not powered or not working does not keep a colonist: they go back to the pool.

## Commands

Names are placeholders: `assign` and `unassign`.

```
assign -location <cell>
unassign -location <cell>
```

- **`assign -location <cell>`** pins a room, so that it is staffed **before** unpinned rooms when crew are scarce. It does not create a slot, does not assign a specific person and does not need a role (the room decides the role). Errors: nothing built, room has no staff slot (not Mk2), already pinned.
- **`unassign -location <cell>`** removes the pin. If the room is staffed, the colonist returns to the pool unless the room is still first in the normal order. Errors: nothing built, not pinned.
- Both use the existing `-location` aliases (`-loc`, `-l`), and Shift+Enter fills `-location` like `build`.

## The `crew` command

`crew` becomes a summary, because lists of individuals do not scale (DESIGN.md: crew are a pool):

```
> crew
Crew: 6 (4 housed in hub, 2 in quarters, 0 no bunk)
  engineer     2   1 assigned   1 idle
  botanist     1   1 assigned   0 idle
  scientist    0
  generalist   3   -            3 idle
```

- `crew <role>` lists the colonists in that role: name, where (the room's cell, or `idle`), and what they are doing (`working`, `sleeping`, `relaxing`, `idle`). **Where and doing are derived** from the pool, not simulated. Assigned colonists are `working` at their room. Unassigned colonists are `sleeping` or `relaxing` according to a simple rule (for example, `relaxing` when a lounge is in range of their quarters, otherwise `sleeping`). Anything consistent and cheap is fine; this is flavour and display only.
- `crew` still flags colonists with no bunk (the existing `NO BUNK` warning) as a count in the header, and `crew <role>` marks them.
- `status colonists` gains a role breakdown with free and used staff slots.

## Display

- **Pips on rooms:** a Mk2 room shows one pip for its staff slot, coloured by the role it needs and filled when a colonist is assigned, hollow when empty. Pip drawing must not clutter the map at the fit-everything zoom; show pips only above a zoom threshold if needed.
- `inspect` on a Mk2 room shows the staff slot (`staff: engineer needed` or `staff: engineer, +20% output`).
- `rooms` appends staff state only where it matters: no flag for an empty bonus slot.
- `status alerts` does **not** alert on empty bonus slots. It will alert on required slots once Mk3 staffing exists.
- `view crew` lights up rooms that currently have staff, dims the rest, and lists idle crew by role in the output. It uses the same highlight mechanism as `view <room type>`.
- `view <role>` is **Open**; skip for now.

## Interactions to get right

- Slice 2's tier model owns the Mk2 stats. The staff bonus is a separate multiplier applied after the tier lookup, so downgrading or demolishing a room cleanly removes it.
- Demolishing a staffed room returns the colonist to the pool.
- Upgrading Mk1 to Mk2 creates the slot; the next recompute fills it if a matching colonist is idle.
- Happiness and income are unchanged except through the room bonuses above.
- A colony with zero specialists plays exactly as before this slice, apart from the `crew` output format.

## Human test checklist

1. Load the page. `crew` shows a role summary with the starting crew. It does not list every colonist.
2. `crew engineer` lists the engineer by name, with `idle`.
3. Upgrade a reactor to Mk2 (Slice 2). Within a tick, the engineer is assigned. `crew` shows 1 assigned. `inspect h6` shows the staff slot filled and the bonus. `status power` supply rises by the bonus.
4. Zoom in on the reactor. A filled pip is drawn in the engineer's colour. A Mk2 room with no matching colonist shows a hollow pip.
5. Upgrade a second room that needs the same role while only one such colonist exists. Only one room is staffed. `assign -l <second room>` pins it, and the colonist moves to it. `unassign` reverses it.
6. `assign -l <Mk1 room>` is refused because it has no slot. `assign -l a1` is refused as empty.
7. Demolish the staffed reactor. The engineer returns to the pool, and `crew` shows idle again.
8. `unwire` a staffed room so it loses power. The colonist returns to the pool, and the slot refills when power returns.
9. `view crew` lights up the staffed rooms. `view reset` clears it.
10. `status colonists` shows the role breakdown and slot counts.
11. Wait for new arrivals (15 ticks apart at `speed 1`). They appear as generalists in `crew`.
12. Confirm that a game with only generalists plays exactly as before.
13. `npm run typecheck` passes.

## Open questions

- Generalists filling slots at reduced effect, or only matching roles.
- The fate of the Cook and Technician labels.
- Whether `view <role>` is worth adding.
- Whether staff bonuses should show up in the HUD rather than only in `inspect` and pips.
