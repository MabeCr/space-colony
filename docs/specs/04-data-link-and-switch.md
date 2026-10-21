# Slice 4: Network switch

**Goal.** Extend the data network with a network switch that relays data to rooms within its own radius, so the player can build the network in sections without running data across the whole map.

**Status:** Built. Automated checks: `npm run smoke`. The browser checklist below is still to run. **Depends on:** Slice 3.

**Scope change (2026-10-20).** The data link itself (`net`, `unnet`, the hub as the data source, the violet map links, the `NOT NETWORKED` and `NO DATA` flags, the preview and autofill) was built in [Slice 3](03-compute-capacity.md). This slice adds only the switch and chaining. Read Slice 3 first.

## Scope

- The network switch room.
- Switches as data sources and as data consumers: a switch must itself be linked from the hub or from another switch.
- Upstream connectivity: a link works only if its source is connected back to the hub.

Out of scope: research (Slice 5), coolant and cargo links (Slices 7 and 9), the Mk3 data users.

## Rules

- A data source is the Command Hub or a working network switch. The hub has a data radius of 5 and 6 ports (Slice 3). A switch has its own radius and ports (below).
- A link is **working** only if the source is itself connected back to the hub through working links, the consumer is within the source's data radius, and the source has a free port. If a switch is cut off from the hub, everything it feeds stops working. The links stay recorded (persistent when broken, like wires and pipes).
- A consumer takes one data link. Linking it again to a different source reroutes it.
- A switch without power does not relay.
- A room cannot be linked to itself. Two switches linked to each other never work, because neither is online without the other.
- Built as passes over the links in `recompute`: sources come online until nothing changes, so chains of any depth resolve and loops stay offline.

## The network switch

| Field | Value |
|---|---|
| Type | `switch` |
| Label | Network Switch |
| Category | `compute` |
| Cost | 20 *(placeholder)* |
| Power draw | 1 *(placeholder)* |
| Data radius | 4 *(placeholder)* |
| Ports | 4 *(placeholder)* |
| Needs | Power (`wire`) and an upstream data link (`net`) |
| Tiers | None for now. It cannot be upgraded. |

Port use counts the links out of it, as the oxygen plant counts pipes in use and as the hub counts ports in Slice 3.

## Changes to Slice 3's pieces

- `net -from` accepts a switch as well as the hub. Its error `... is not a data source` now covers everything except the hub and switches.
- `rooms` flags for a switch: `NOT WIRED` / `NO POWER` (power), `NOT NETWORKED` (no upstream link) and `NO DATA` (the upstream link is not delivering, or the switch is cut off from the hub).
- `inspect` on a switch shows ports in use (`n / 4`) and whether it is connected to the hub.
- Racks behind a switch that is cut off, unpowered or out of ports report `NO DATA` and do not count toward compute.
- `status compute` lists switches and which racks are cut off, with the fix.
- `view switch` works; `build compute` lists the switch. `inspect` on a switch highlights its data links.
- Tab completion for `net -from` offers the hub and switches; `-to` offers racks and switches.

## Human test checklist

Start from a fresh page load. A rack beyond the hub's data radius (5) is also too far from the starting reactor, so these steps add a second reactor at M5. Materials run short, so wait or use `speed 1/4` between steps.

1. `build switch -l i4` (2 cells from the hub). You are warned about wire and data. `rooms` shows `[NOT WIRED, NOT NETWORKED]`.
2. `wire -f h6 -t i4`, then `net -f i6 -t i4`. `rooms` shows it `[OPERATIONAL]`. `inspect i4` shows the data radius 4, ports 0 / 4 and "connected to the hub". `inspect i6` shows ports 1 / 6. `upgrade -l i4` says it cannot be upgraded. `demolish -l i4` refunds 10 (or leave it; the next steps use a different switch).
3. Build the second reactor and a switch: `build reactor -l m5`, `build switch -l l6`, `wire -f m5 -t l6`, `net -f i6 -t l6`.
4. `build rack -l o6` and `wire -f m5 -t o6`. Then `net -f i6 -t o6` is refused: out of range, 6.0 cells. `net -f l6 -t o6` works, compute becomes 4, and `inspect l6` shows ports 1 / 4. `status compute` lists the switch as relaying.
5. `unwire -t l6`. The rack reports `NO DATA`, the switch `NOT WIRED`, compute drops to 0, and both rooms show the data badge. The map shows the rack's data link as dotted red. `status compute` says everything behind the switch has no data. `wire -f m5 -t l6` restores it.
6. `unnet -t l6`. The rack still reports `NO DATA` (its link stays recorded) and the switch `NOT NETWORKED`. `status alerts` lists both. `net -f i6 -t l6` restores it.
7. Ports: build and wire racks at `m6`, `m7`, `n6` and `n7` (wire them from M5), and `net -f l6 -t` the first three (with `o6` that makes 4). `inspect l6` shows 4 / 4, and `net -f l6 -t n7` is refused for ports.
8. Chain: `build switch -l p6`, `wire -f m5 -t p6`, `net -f l6 -t p6` (the switch is full, so first `unnet` one of its racks), `build rack -l p4`, `wire -f m5 -t p4`, `net -f p6 -t p4`. The rack works through two switches. `unnet -t l6` takes the whole chain offline; `net -f i6 -t l6` restores it.
9. Reroute: with a rack hub-linked at `g5`, `net -f i4 -t g5` (using a switch at `i4`) reports "Rerouted", and the hub's port count drops by one.
10. Loops and self links: `net -f l6 -t l6` is refused. Link two connected switches to each other (`net -f p6 -t l6`): both report `NO DATA`. `net -f i6 -t l6` fixes it.
11. Type a `net` line with both ends set and check the preview, including the red dotted version for a wrong target and for a switch linked to itself.
12. `demolish -l l6`. Everything behind it loses data and shows `NOT NETWORKED`.
13. Check `view switch`, `view compute` (racks and switches), and the connection highlight (`inspect` on a switch lights its data links). Check Tab on `net -f` (hub and switches) and `net -f i6 -t` (racks and switches), and the switch icon on the map.
14. `npm run typecheck` and `npm run smoke` pass.

## Open questions

- Should switches chain more than one deep, and is there a hop limit? Default: no limit.
- Should a damaged or destroyed switch generate a log line telling the player which section went dark?
