# Slice 4: Data link and network switch

**Goal.** Add the data link, with the Command Hub as the root of the data network, and a network switch that lets the player build the network in sections.

**Status:** Not started. **Depends on:** Slice 3.

## Scope

- A new link type, data, with its own command and un-command.
- The hub as root of the data network.
- The network switch room.
- Compute rooms (racks) now need a working data connection to count.

Out of scope: research (Slice 5), coolant and cargo links (Slices 7 and 8), the Mk3 data users.

## Rules

- A data link runs from a **data source** to a **data consumer**.
- Data sources are the Command Hub and network switches. The hub has a data radius *(placeholder: 5)* and a limit on direct links *(placeholder: 6)*.
- Data consumers are compute rooms (racks now; later turrets and Mk3 rooms). Switches are also consumers: a switch must itself be linked from the hub or another switch.
- A link is **working** only if the source is itself connected back to the hub through working links, the consumer is within the source's data radius, and the source has a free port. If a switch is cut off from the hub, everything it feeds stops working. The links stay recorded (persistent when broken, like wires and pipes).
- A consumer takes one data link. Linking it again to a different source reroutes it.

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
| Needs | Power (`wire`) and an upstream data link |

A switch without power does not relay. Port use counts the working or recorded links out of it, as the oxygen plant counts pipes in use.

## Commands

The verb names below are placeholders: `net` and `unnet`.

```
net -from <hub or switch> -to <consumer>
unnet -to <consumer>
```

Flags use the existing global aliases (`-f`/`-src`, `-t`/`-dest`). Nothing new to learn.

**`net`** records the link, moves the cursor to the consumer, and rewires if the consumer already had a different source. Errors, in the existing style:

| Condition | Message (intent) |
|---|---|
| `-from` or `-to` missing | `Missing -from <cell>.` / `Missing -to <cell>.` |
| Invalid cell, nothing built | The usual messages |
| Source is not a hub or switch | `<room> at <cell> is not a data source.` |
| Target does not use data | `<room> at <cell> does not use a data link.` |
| Out of range | `Out of range: <room> is <d> cells away, and the radius is <r>.` |
| Source has no free ports | `The <room> at <cell> has no free ports. Build another switch.` |

Range, spare ports and upstream connectivity are not refused at link time if the link would simply be broken, in line with the existing rule that links persist even when broken. Wrong types and out-of-radius **are** refused, as `wire` does today.

**`unnet -to <cell>`** removes the link: `Disconnected data to <room> at <cell>.`

## Reporting

- `rooms` flags: `NOT NETWORKED` (needs data, has no link) and `NO DATA` (has a link that is not delivering: source offline, cut off from the hub, out of range or out of ports).
- `inspect` shows data state on consumers and switches: source, ports in use (`n / 4`), and for a switch whether it is connected to the hub.
- `status compute` lists racks that are not networked or have no data, with the fix. Racks without working data **do not count** toward capacity.
- `status alerts` includes both new flags.
- A **data** colour on the map (placeholder: violet) and an animated dash for working links, dotted red for broken, as wires and pipes do now. `inspect` highlights data links in the connection highlight.
- Preview: while a `net` line has both ends set, draw a translucent link, red and dotted if it would be refused for type or range.
- Autofill: `net` fills `-from` then `-to`, like `wire` and `pipe`. `unnet` fills `-to`.
- `view` accepts `switch`. `build compute` lists the switch.

## Migration note

Racks built in Slice 3 only needed power. From this slice on they also need a data link. Nothing from Slice 3 has shipped to players, so no migration is needed, but the Slice 3 checklist changes: a rack counts toward capacity only after `net`. Update the Slice 3 test steps and the `build rack` warning, which should now also say `No data yet: net -from <hub or switch> -to <cell>`.

## Human test checklist

1. Load the page. Build a rack and wire it. `rooms` shows it as `NOT NETWORKED`. `status compute` shows capacity 0 and tells you to link it.
2. `net -f i6 -t <rack cell>` with the rack within the hub's data radius. The rack becomes operational and capacity rises.
3. Build a rack beyond the hub's data radius. `net -f i6 -t <that cell>` is refused with the out-of-range message and the distance.
4. Build a switch within the hub's radius. Wire it. `net -f i6 -t <switch>`. `inspect` shows 0/4 ports and connected to hub.
5. Build a rack within the switch's radius but beyond the hub's. `net -f <switch> -t <rack>`. It works. `inspect` on the switch shows 1/4.
6. `unwire` the switch. Racks behind it report `NO DATA`. Capacity drops. Wire the switch again and they recover.
7. `unnet -t <switch>`. Racks behind it report `NO DATA` and the links remain recorded. Run `net` again to restore.
8. Fill a switch with four racks, then try a fifth: you get the no-free-ports error.
9. Reroute a rack from the hub to the switch with `net`. The old link is replaced.
10. Type a `net` line with both ends set and see the preview, including the red dotted version for a wrong target type.
11. `demolish` the switch. Everything behind it loses data; the links to the demolished switch drop on the next recompute.
12. Check `status alerts`, `view switch`, and the connection highlight (`inspect` on the switch lights its data links).
13. `npm run typecheck` passes.

## Open questions

- Final verb names (`net`, `unnet`, or something else).
- Should switches chain more than one deep, and is there a hop limit? Default: no limit.
- Should a damaged or destroyed switch generate a log line telling the player which section went dark?
