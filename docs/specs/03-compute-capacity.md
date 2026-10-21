# Slice 3: Compute capacity and the data link

**Goal.** Add compute as a capacity resource, like power, produced by a new room that needs both power and a data link. Nothing consumes compute yet; this slice builds the supply side, the data link from the hub, and the reporting, so that research (Slice 5) and scripts have something to draw on.

**Status:** Built. Automated checks: `npm run smoke`. The browser checklist below is still to run. **Depends on:** Slice 1.

**Scope change (2026-10-20).** The data link (`net` and `unnet`, with the Command Hub as the data source) moved into this slice from Slice 4, because a rack that needs only power would be redesigned straight away. Slice 4 is now only the network switch and chaining.

## Scope

- A Compute category with one room, the server rack, plus a Mk2 rack.
- A compute capacity total in the simulation.
- The data link: `net` and `unnet`, with the Command Hub as the only data source (radius and ports below).
- Compute shown in `status`, `status compute`, the HUD, `rooms`, `inspect` and `status alerts`.

Out of scope: the network switch and chained data (Slice 4), research and scripts as consumers (Slice 5 and later).

## The server rack

| Field | Value |
|---|---|
| Type | `rack` |
| Label | Server Rack |
| Category | `compute` |
| Cost | 35 *(placeholder)* |
| Power draw | 2 *(placeholder)* |
| Radius | none |
| Needs | Power (`wire`) **and** a data link (`net`) |
| Effect | Produces 4 compute capacity while powered and networked *(placeholder)* |
| Mk2 | Upgrade cost 20; produces 6 compute, power draw 3 *(placeholder)* |

A rack that is not powered or not networked produces nothing. Compute capacity is the sum over racks that are powered **and** have a working data link. Compute **used** is zero in this slice (a field exists for later consumers). Compute **free** is capacity minus used. The hub provides no baseline compute for now; Slice 5 revisits this.

## The data link

- The Command Hub is the root of the data network and the only data source in this slice. Its **data radius is 5** and it has **6 ports** *(placeholders)*. `inspect` on the hub shows ports in use.
- A data link runs from a data source to a room that needs data (racks now; later turrets and Mk3 rooms). A link **works** only while the room is within the source's data radius and the source has a free port.
- A room takes one data link. Linking it again reroutes it.
- Links persist when broken, like wires and pipes. They drop when the source is demolished.

Commands:

```
net -from <hub> -to <rack>
unnet -to <rack>
```

Flags use the existing aliases. `net` refuses a source that is not a data source, a target that does not use data, and a target out of the data radius; it also refuses when the source has no free ports. The messages are in [API.md](../API.md#net). Range and ports are checked when linking, as `pipe` does. The verb names `net` and `unnet` are placeholders.

Reporting: new `rooms` flags `NOT NETWORKED` (no link) and `NO DATA` (a link that is not delivering); `status alerts` includes them; the map draws data links in violet, animated when working and dotted red when broken; `inspect` highlights data links in the connection highlight; the `net` line has a translucent preview (red and dotted if it would be refused); Shift+Enter fills `-from` then `-to`; Tab completes the hub for `-from` and racks for `-to`.

## Behaviour

**`status`** gains a Compute line once at least one rack has been built: `used used / capacity capacity`, with the same trend arrow style (it compares capacity to 10 ticks ago).

**HUD.** A Compute chip (`used/capacity`) appears once a rack exists. It is yellow at capacity 0 (nothing working yet) and red if used exceeds capacity.

**`status compute`** follows the `status power` pattern: a column graph of capacity over time (`-time` works), a trend line, capacity, used and free, each rack online or with its flags and the fix, and a warning to build another rack when compute is in use and none is free (quiet while used is zero). With no rack it says how to build one.

**`status alerts`** reports racks with their problem flags like any room. It does not alert on "no compute".

**`rooms`** lists racks with the standard flags. A working rack ends with the green `[OPERATIONAL]` tag.

**`inspect`** on a rack shows compute produced, power, and its data state. On the hub it shows the data radius and ports.

**`build rack`** warns: `Not wired yet: wire ...` and `No data yet: net -from <hub> -to <cell>`. The rack has its own colour and a server-stack icon on the map. `view compute` and `view rack` highlight racks.

## Human test checklist

Start from a fresh page load. Materials rise about 3 per tick; use `speed 1/4` if you want more time to read.

1. `status` shows no Compute line and the HUD has no Compute chip. `status compute` says there are no racks yet.
2. `build compute` lists the rack with cost, draw and radius. `build` lists `compute` among the categories.
3. `build rack -l g5`. You get two warnings: not wired and no data yet (`net -from <hub> -to G5`).
4. `rooms` shows the rack flagged `NOT WIRED, NOT NETWORKED`. `status alerts` lists it. `status` now shows a Compute line at 0 / 0, and the HUD chip appears (yellow).
5. `wire -f h6 -t g5`. The rack is still flagged `NOT NETWORKED`, and compute is still 0.
6. Type `net -f i6 -t g5` without pressing Enter. A translucent violet link appears from the hub to the rack. Change the target to `h6` (the reactor): the preview turns red and dotted.
7. Press Enter on the valid line. You see `Linked data from the Command Hub ... to Server Rack ...`, the cursor moves to the rack, and compute capacity becomes 4. `rooms` shows `[OPERATIONAL]`; `status`, the HUD chip and `status compute` all show capacity 4.
8. `inspect g5` shows compute +4 (online) and its data link, and the connection highlight lights the hub link. `inspect i6` shows the data radius 5 and ports 1 / 6.
9. `unwire -t g5`: capacity drops to 0 and the flag is `NOT WIRED`. Rewire it: capacity returns to 4.
10. `unnet -t g5`: capacity drops to 0 and the flag is `NOT NETWORKED`. `unnet -t g5` again is an error. Run `net` again to restore.
11. Build a second rack (`g6`), wire and net it. Capacity is 8.
12. Errors: `net -f h6 -t g5` (not a data source), `net -f i6 -t j6` (does not use a data link), and a rack at `c3` (`build rack -l c3`, then `net -f i6 -t c3`) gives the out-of-range message with the distance.
13. Ports: build and net racks until the hub shows 6 / 6 (for example at `g7`, `i4`, `i8`, `k5`), then try a seventh. You get the no-free-ports message.
14. `upgrade -l g5`: the rack becomes Mk2 (inner border), capacity rises by 2, and its power draw rises by 1. `demolish` it: the refund is 27. Demolishing a Mk1 rack refunds 17.
15. `view compute` highlights racks; `view rack` does too. `status compute -time 10` after waiting about 30 ticks shows a graph with the changes.
16. Type `net -f ` and press Tab (offers the hub cell only), then `net -f i6 -t ` and Tab (offers racks only). `unnet -t ` offers linked racks only. Click a cell and press Shift+Enter on a `net` line: `-from` is filled first, then `-to`.
17. `npm run typecheck` and `npm run smoke` pass.

## Open questions

- Does the hub itself provide a small baseline of compute (so early research is possible with no rack)? Default: zero. Revisit in Slice 5.
- Final verb names (`net`, `unnet`). Settled enough to build; change them everywhere if they change.
- Should an overloaded reactor shed racks last? Not decided; racks are powered in room order like everything else.
