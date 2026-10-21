# Slice 4: Network switch

**Goal.** Extend the data network with a network switch that relays data to rooms within its own radius, so the player can build the network in sections without running data across the whole map.

**Status:** Not started. **Depends on:** Slice 3.

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

1. Build a switch within the hub's radius, wire it. `rooms` shows it `NOT NETWORKED`. `net -f i6 -t <switch>`; `inspect` shows 0 / 4 ports and connected to the hub.
2. Build a rack within the switch's radius but beyond the hub's (more than 5 cells from the hub). `net -f <switch> -t <rack>` works; `inspect` on the switch shows 1 / 4. Wire the rack and capacity rises.
3. `unwire` the switch. Racks behind it report `NO DATA` and capacity drops. Wire it again and they recover.
4. `unnet -t <switch>`. Racks behind it report `NO DATA` and the links remain recorded. `net` again restores them.
5. Fill a switch with four racks, then try a fifth: you get the no-free-ports error.
6. Reroute a rack from the hub to the switch with `net`; the old link is replaced.
7. Chain a second switch off the first. Racks behind it work. Cut the first switch's link to the hub: everything behind both goes `NO DATA`.
8. Type a `net` line with both ends set and check the preview, including the red dotted version for a wrong target.
9. `demolish` a switch. Everything behind it loses data, and the links to the demolished switch drop on the next recompute.
10. Check `status alerts`, `view switch`, and the connection highlight (`inspect` on the switch lights its data links).
11. `npm run typecheck` and `npm run smoke` pass.

## Open questions

- Should switches chain more than one deep, and is there a hop limit? Default: no limit.
- Should a damaged or destroyed switch generate a log line telling the player which section went dark?
