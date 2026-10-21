# Space Colony — Command Shell API

Reference for every command that can be typed into the shell at the bottom of the game. The source of truth is [`src/commands.ts`](../src/commands.ts) (commands, flags, aliases) and [`src/sim.ts`](../src/sim.ts) (rooms, numbers, cell parsing).

## Contents

1. [Syntax](#syntax)
2. [Cells](#cells)
3. [Flag aliases](#flag-aliases)
4. [Room types](#room-types)
5. [Tiers](#tiers)
6. [Command index](#command-index)
7. [Commands](#commands)
8. [Shell keyboard features](#shell-keyboard-features)
9. [Quick recipes](#quick-recipes)

---

## Syntax

```
<command> [positional arguments] [-flag value] ...
```

- Input is **case-insensitive**. The whole line is lower-cased before it is parsed, so `BUILD Reactor -L B4` is the same as `build reactor -l b4`.
- Tokens are separated by any amount of whitespace.
- A token that starts with `-` (and is longer than one character) is a **flag**. The token right after it is the flag's **value**, unless that token also starts with `-`, in which case the flag is treated as having no value.
- Every other token is a **positional argument**, kept in the order typed.
- Flags and positional arguments can be mixed in any order: `build -location b4 reactor` works the same as `build reactor -location b4`.
- If the same flag is given twice, the **last** value wins. Using an alias and its full name together counts as the same flag (see below).
- Unknown flags and extra positional arguments are **silently ignored**. Only the flags listed for a command are read.
- An empty line does nothing. An unknown command prints `Unknown command "<name>". Type "help".`

## Cells

A cell is a map coordinate written as **column letter + row number**, e.g. `b4`, `h6`, `P10`.

| Part | Range |
|---|---|
| Column | `A`–`P` (16 columns) |
| Row | `1`–`10` (10 rows) |

- Case-insensitive (`h6` = `H6`).
- Leading zeros in the row are accepted (`b04` = `b4`). The row may have at most two digits.
- Anything else (`4b`, `q1`, `a11`, `a0`, `b`) is rejected with: `"<text>" is not a valid cell. Use a column A-P and row 1-10, like B4.`
- Starting layout: Command Hub at `I6`, Reactor at `H6`, Oxygen Plant at `J6`.

## Flag aliases

Aliases are resolved globally before any command sees them, so they work the same on every command that uses the flag.

| Full flag | Meaning | Accepted forms |
|---|---|---|
| `-location` | The cell a command acts on (build site, demolish target, inspect target). | `-location`, `-loc`, `-l` |
| `-from` | The source of a connection (reactor for `wire`, oxygen plant for `pipe`, hub for `net`). | `-from`, `-f`, `-src` |
| `-to` | The destination of a connection (or the room to disconnect). | `-to`, `-t`, `-dest`, `-destination` |

Notes:

- Because aliases are global, a flag only does something on commands that read it. `wire -l h6` is turned into `wire -location h6`, which `wire` ignores, so it will complain `Missing -from <cell>.`
- Single-letter forms (`-l`, `-f`, `-t`) are the fastest to type; `-loc`, `-src` and `-dest` are readable middle grounds.
- There is no `-from`/`-to` shorthand for `inspect`; it uses `-location` (or a bare cell).

## Room types

Valid values for `build <type>`. The Command Hub (`hub`) exists from the start and **cannot** be built or demolished.

| Type | Label | Build cost | Power draw | Radius | Effect |
|---|---|---|---|---|---|
| `reactor` | Reactor | 40 | 0 | 4 | Produces 12 power. Wire it to rooms within its radius. |
| `oxygen` | Oxygen Plant | 30 | 3 | 4 | Needs power. Makes 3 oxygen per tick. Pipe it to up to 4 quarters within its radius. |
| `garden` | Hydroponics | 25 | 2 | — | Needs power. Makes 2 food per tick. |
| `quarters` | Quarters | 20 | 1 | — | Needs a power wire **and** an air pipe. Houses 2 colonists and attracts new arrivals. |
| `lounge` | Lounge | 30 | 2 | 3 | Needs power. Quarters within its radius get a happiness boost. |
| `rack` | Server Rack | 35 | 2 | — | Needs power **and** a data link. Produces 4 compute capacity while both work. |
| `switch` | Network Switch | 20 | 1 | 4 (data) | Needs power **and** a data link. Relays data to up to 4 racks or switches within its data radius. Cannot be upgraded. |

Other limits used by the commands:

- The Command Hub is the root of the data network: it has a **data radius of 5** and **6 ports**, so it can link up to 6 racks or switches within 5 cells. A network switch has a data radius of **4** and **4** ports. See [`net`](#net).
- A Mk1 reactor supplies **12** power total (Mk2: 18). A Mk1 oxygen plant feeds at most **4** quarters (Mk2: 6). See [Tiers](#tiers).
- Distances are straight-line (Euclidean) between cell centres, e.g. `h6` to `j7` is about 2.2.
- `demolish` refunds half of everything spent on the room (build plus upgrade), rounded down.

---

## Tiers

Every buildable room starts at **Mk1** and can be upgraded in place to **Mk2** with [`upgrade`](#upgrade). The room keeps its cell, wires and pipes. Mk2 stats *(placeholder numbers)*:

| Type | Upgrade cost | Mk1 | Mk2 |
|---|---|---|---|
| `reactor` | 25 | output 12, radius 4 | output 18, radius 5 |
| `oxygen` | 20 | output 3, 4 pipes, draw 3 | output 4, 6 pipes, draw 4 |
| `garden` | 15 | output 2, draw 2 | output 3, draw 3 |
| `quarters` | 12 | 2 beds | 3 beds |
| `lounge` | 18 | radius 3 | radius 4 |
| `rack` | 20 | compute 4, draw 2 | compute 6, draw 3 |

The hub cannot be upgraded. Mk3 is a separate building, not an upgrade (not built yet). Mk2 rooms show as `Reactor Mk2` in `rooms`, `inspect`, messages and the map hover label, and have a second, inner border on the map.

---

## Command index

| Command | Usage | Summary |
|---|---|---|
| [`help`](#help) | `help [command]` | List commands, or explain one. |
| [`status`](#status) | `status [oxygen | food | materials | colonists | happiness | power | compute | alerts] [-time <ticks>]` | Colony overview, an alert list, or a graph and diagnosis of one category. |
| [`build`](#build) | `build [<category>]`, `build <type> -location <cell>` | Construct a room, or list categories and their types. |
| [`wire`](#wire) | `wire -from <reactor> -to <room>` | Run a power line from a reactor to a room. |
| [`unwire`](#unwire) | `unwire -to <room>` | Cut the power line to a room. |
| [`pipe`](#pipe) | `pipe -from <oxygen plant> -to <quarters>` | Pipe air from an oxygen plant to quarters. |
| [`unpipe`](#unpipe) | `unpipe -to <quarters>` | Cut the air pipe to quarters. |
| [`net`](#net) | `net -from <hub or switch> -to <rack or switch>` | Link a rack or switch to the data network. |
| [`unnet`](#unnet) | `unnet -to <room>` | Cut the data link to a rack or switch. |
| [`upgrade`](#upgrade) | `upgrade`, `upgrade -location <cell>` | List upgradable rooms, or upgrade one from Mk1 to Mk2. |
| [`demolish`](#demolish) | `demolish -location <cell>` | Tear down a room for a 50% refund of everything spent on it. |
| [`inspect`](#inspect) | `inspect -location <cell>` / `inspect reset` | Room details and map highlight. |
| [`rooms`](#rooms) | `rooms` | List every room and whether it is working. |
| [`crew`](#crew) | `crew` | List colonists and who has a bunk. |
| [`speed`](#speed) | `speed <1 \| 1/2 \| 1/4>` | Slow time down (no pause). |
| [`view`](#view) | `view zoom <in\|out> [steps]`, `view pan <dir> [cells]`, `view <room type or category>`, `view reset` | Zoom, pan or highlight the map. |
| [`clear`](#clear) | `clear` | Clear the terminal. |

---

## Commands

### help

```
help [command]
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `command` | positional, command name | no | Name of a command to explain. |

- With no argument: prints every command with its one-line summary.
- With a command name: prints that command's usage, summary, and its flags (with their aliases).
- If the name is not a command, falls back to the full list.
- Has no flags.

```
help
help build
```

---

### status

```
status
status <oxygen | food | materials | colonists | happiness | power | compute> [-time <ticks>]
status alerts
```

| Parameter | Form | Required | Description |
|---|---|---|---|
| `category` | positional | no | One of `oxygen`, `food`, `materials`, `colonists`, `happiness`, `power`, `compute`, or `alerts`. Omit for the colony-wide overview. |
| `-time <ticks>` | flag (no aliases; `-t` means `-to`) | no | How many ticks of history to graph, a whole number from `2` to `300`. Default `30`. Only used with a graphed category (not `alerts`). |

**`status` alone** prints a colony-wide overview:

- **Power** — `demand wanted / supply produced`
- **Compute** — `used / capacity`. Shown only once a server rack has been built.
- **Oxygen**, **Food** — current stock (0–100)
- **Materials** — current stock, rounded down
- **Population** — number of colonists
- **Happiness** — the score. The air, food, housing and fun breakdown is in `status happiness`.

Each line ends with a trend arrow comparing now to 10 ticks ago: `▲` rising, `▼` falling, `–` steady (a change of under 0.05 per tick). The power arrow tracks power *wanted*. The arrows are neutral: `▲` on power wanted is not "good" or "bad" by itself.

**`status alerts`** lists everything currently wrong, or `All clear.` Checks, in order: oxygen and food (depleted, below 20, or falling with a run-out forecast), power wanted above power produced, every room with a `rooms` problem flag (`NOT WIRED`, `NO POWER`, `NOT PIPED`, `NO AIR`, `NOT NETWORKED`, `NO DATA`), colonists with no bunk (by name), and happiness below 50 (no new arrivals).

**`status <category>`** prints a column graph of that total over the last `-time` ticks (oldest on the left, `now` on the right, about 60 columns wide; longer windows are averaged down), a one-line trend summary (current value, rising/falling/steady, change over the window, change per tick, low and high), and diagnostics. Oxygen, food and happiness are graphed from 0 to 100; materials and colonists from 0 to the highest value in the window. If fewer ticks of history exist than requested, it graphs what there is and says so. A tick is one second at 1x.

| Category | Diagnostics shown |
|---|---|
| `oxygen` | Oxygen made per tick (powered plants x 3), used per tick (colonists x 0.5), net rate, and a forecast ("runs out in about N ticks", "fills in about N ticks", "holding steady", "full"). Warns about plants that are offline, and suggests another plant if the net is negative. |
| `food` | The same for hydroponics (2 each) and colonists (0.3 each). |
| `materials` | Income per tick (1 + 0.5 per colonist), and for each buildable room type its cost and whether it is affordable now or in how many ticks. |
| `colonists` | Total beds (hub 4 + working quarters x 2) and how many are free, housed versus no bunk, quarters that are not counted because they lack power or air, and the state of the next arrival: blocked (no free beds), paused (happiness below 50), or due in N ticks. |
| `power` | Graphs power wanted (scaled up to the highest wanted or produced in the window). Then: wanted versus produced and the spare or shortfall, each reactor's load, spare capacity and number of rooms wired to it, and each power-using room that is not wired, out of range of its reactor, or on an overloaded reactor. Suggests another reactor when short. |
| `compute` | Graphs compute capacity over time, then capacity, used and free (used is 0 until something reserves compute), each network switch (relaying, with ports in use, or its flags) and each rack online or with its problem flags and the fix for each (`wire`, `net`), and a warning to build another rack if compute is in use and none is free. With no rack it says to build one. |
| `happiness` | Where it is heading (the target the score moves 10% toward each tick), a bar for each of air, food, housing and fun, the weakest component with a suggestion, and a warning if it is below 50 (no arrivals). |

Errors: `Unknown status option "<text>". Options: ...`, `-time must be a whole number of ticks from 2 to 300.`, or `Not enough history yet. Try again in a moment.` (before the first tick).

```
status
status alerts
status oxygen
status power
status food -time 60
status happiness -time 10
```

History is kept for the last 300 ticks and is not saved between sessions.

---

### build

```
build
build <category>
build <type> -location <cell>
```

| Parameter | Form | Aliases | Required | Description |
|---|---|---|---|---|
| `type` or `category` | positional | — | no | A room type (`reactor`, `oxygen`, `garden`, `quarters`, `lounge`; see [Room types](#room-types)) to build, or a category to list. |
| `-location <cell>` | flag | `-loc`, `-l` | with a type | Cell to build on. |

Categories group room types for browsing only; they never change how a room is built. A category name never matches a room type name.

| Category | Holds today |
|---|---|
| `power` | reactor |
| `life` | oxygen |
| `food` | garden |
| `habitat` | quarters, lounge |
| `compute` | rack, switch |
| `industry`, `defense`, `maint` | nothing yet (hidden from the list) |

Behaviour:

- `build` alone lists the categories that hold at least one type, with a count.
- `build <category>` lists its types with cost, power draw and radius. A category with nothing in it prints a warning, not an error. If `-location` is also given, the category is still just listed.
- Spends the room's cost from materials and places the room.
- The map cursor moves to the new room.
- Prints a warning if the new room still needs setup:
  - Any room that draws power (everything except a reactor): `Not wired yet: wire -from <reactor> -to <cell>`
  - Quarters: `No air yet: pipe -from <oxygen plant> -to <cell>`
  - Server rack or network switch: `No data yet: net -from <hub or switch> -to <cell>`

Errors:

| Condition | Message |
|---|---|
| Type given without `-location`, or `-location` without a type | `Usage: build <type> -location <cell>   (try "help build")` |
| Type not buildable (including `hub`) | `Unknown room type "<type>". Options: reactor, oxygen, garden, quarters, lounge. Categories: power, life, food, habitat.` |
| Invalid cell | `"<text>" is not a valid cell. ...` |
| Cell already has a room | `<cell> is already occupied.` |
| Not enough materials | `Not enough materials: <label> costs <cost>, you have <n>.` |

All equivalent:

```
build reactor -location b4
build reactor -loc b4
build reactor -l b4
build -l b4 reactor
```

---

### wire

```
wire -from <reactor> -to <room>
```

| Parameter | Form | Aliases | Required | Description |
|---|---|---|---|---|
| `-from <cell>` | flag | `-f`, `-src` | yes | Cell of the reactor supplying power. |
| `-to <cell>` | flag | `-t`, `-dest`, `-destination` | yes | Cell of the room to power. |

Behaviour:

- Records a power link from the reactor to the room. The room is powered only while it is within the reactor's radius (**4**) and the reactor has spare capacity.
- If the room was already wired to a different reactor, it is **rewired** (the old link is replaced).
- The map cursor moves to the powered room.
- Only rooms that draw power can be wired: oxygen plant, hydroponics, quarters, lounge room. Reactors and the hub cannot.

Errors:

| Condition | Message |
|---|---|
| `-from` missing | `Missing -from <cell>.` |
| `-to` missing | `Missing -to <cell>.` |
| Invalid cell | `"<text>" is not a valid cell. ...` |
| Nothing built at a cell | `Nothing is built at <cell>.` |
| Source is not a reactor | `<room> at <cell> is not a reactor.` |
| Target uses no power | `<room> at <cell> does not use wired power.` |
| Already wired to this reactor | `<room> at <cell> is already wired to the reactor at <cell>.` (adds "It is not getting power; see "rooms" for why." if it is not working) |
| Target out of range | `Out of range: <room> is <d> cells from the reactor, and its radius is 4.` |
| Reactor lacks capacity | `Reactor at <cell> has <n> spare power, and <room> needs <draw>. Build another reactor.` |

Repeating a link that already exists is refused (and changes nothing), the same for `pipe` and `net`. Linking to a **different** source still reroutes.

```
wire -from h6 -to e6
wire -f h6 -t e6
wire -src h6 -dest e6
```

---

### unwire

```
unwire -to <room>
```

| Parameter | Form | Aliases | Required | Description |
|---|---|---|---|---|
| `-to <cell>` | flag | `-t`, `-dest`, `-destination` | yes | Room whose power line should be cut. |

Errors: `Missing -to <cell>.`, invalid cell, `Nothing is built at <cell>.`, or `<room> at <cell> has no power line.`

On success: `Disconnected power to <room> at <cell>.` The room goes offline immediately.

```
unwire -to e6
unwire -t e6
```

---

### pipe

```
pipe -from <oxygen plant> -to <quarters>
```

| Parameter | Form | Aliases | Required | Description |
|---|---|---|---|---|
| `-from <cell>` | flag | `-f`, `-src` | yes | Cell of the oxygen plant supplying air. |
| `-to <cell>` | flag | `-t`, `-dest`, `-destination` | yes | Cell of the quarters to supply. |

Behaviour:

- Records an air link from the plant to the quarters. Air flows only while the plant is **powered**, the quarters are within the plant's radius (**4**), and the plant has fewer than **4** pipes in use.
- If the quarters were already piped to a different plant, the pipe is **rerouted**.
- The map cursor moves to the quarters.
- Only quarters can be piped.

Errors:

| Condition | Message |
|---|---|
| `-from` / `-to` missing | `Missing -from <cell>.` / `Missing -to <cell>.` |
| Invalid cell | `"<text>" is not a valid cell. ...` |
| Nothing built at a cell | `Nothing is built at <cell>.` |
| Source is not an oxygen plant | `<room> at <cell> is not an oxygen plant.` |
| Target is not quarters | `<room> at <cell> does not need piped air.` |
| Already piped to this plant | `<room> at <cell> is already piped to the plant at <cell>.` (adds a note if it is not getting air) |
| Target out of range | `Out of range: <room> is <d> cells away, and the plant's radius is 4.` |
| Plant full | `The plant at <cell> already feeds 4 rooms. Build another oxygen plant.` |

```
pipe -from j6 -to k7
pipe -f j6 -t k7
```

---

### unpipe

```
unpipe -to <quarters>
```

| Parameter | Form | Aliases | Required | Description |
|---|---|---|---|---|
| `-to <cell>` | flag | `-t`, `-dest`, `-destination` | yes | Quarters whose air pipe should be cut. |

Errors: `Missing -to <cell>.`, invalid cell, `Nothing is built at <cell>.`, or `<room> at <cell> has no air pipe.`

On success: `Disconnected air to <room> at <cell>.`

```
unpipe -to k7
```

---

### net

```
net -from <hub or switch> -to <rack or switch>
```

| Parameter | Form | Aliases | Required | Description |
|---|---|---|---|---|
| `-from <cell>` | flag | `-f`, `-src` | yes | Cell of the data source: the Command Hub or a network switch. |
| `-to <cell>` | flag | `-t`, `-dest`, `-destination` | yes | Cell of the room that needs data: a server rack or a network switch. |

Behaviour:

- Records a data link from the source to the room. The link delivers only while **all three** hold: the source is online, the room is within the source's data radius (hub **5**, switch **4**), and the source has a free port (hub **6**, switch **4**). A rack produces compute only when it has **both** power and a working data link.
- The Command Hub is always online. A switch is online only when it is **powered and has its own working link back to the hub**. A switch that is cut off (unwired, unlinked, out of range, or its source is full or cut off) stops relaying, and everything behind it reports `NO DATA`. The links stay recorded. Two switches linked to each other never work, and chains of any length are allowed.
- If the room was linked to a different source, the link is **rerouted**. A room cannot be linked to itself.
- The map cursor moves to the rack. Data links draw in violet, animated when working and dotted red when broken, like wires and pipes.
- Links persist when broken, as wires and pipes do.

Errors:

| Condition | Message |
|---|---|
| `-from` / `-to` missing | `Missing -from <cell>.` / `Missing -to <cell>.` |
| Invalid cell, nothing built | The usual messages |
| Source is not the hub or a switch | `<room> at <cell> is not a data source.` |
| Source and target are the same room | `<room> at <cell> cannot be linked to itself.` |
| Target does not use data | `<room> at <cell> does not use a data link.` |
| Already linked to this source | `<room> at <cell> is already linked to the <source> at <cell>.` (adds a note if it is not getting data) |
| Out of range | `Out of range: <room> is <d> cells away, and the data radius of the <source> is <r>.` |
| Source has no free port | `The <source> at <cell> has no free ports (<n> of <n> in use). Unlink one with "unnet".` |

```
net -from i6 -to g5
net -f i6 -t g5
net -f l6 -t o6
```

---

### unnet

```
unnet -to <room>
```

| Parameter | Form | Aliases | Required | Description |
|---|---|---|---|---|
| `-to <cell>` | flag | `-t`, `-dest`, `-destination` | yes | Rack or switch whose data link should be cut. |

Errors: `Missing -to <cell>.`, invalid cell, `Nothing is built at <cell>.`, or `<room> at <cell> has no data link.`

On success: `Disconnected data to <room> at <cell>.` The rack stops counting toward compute immediately, and if it was a switch, so does everything behind it.

```
unnet -to g5
```

---

### upgrade

```
upgrade
upgrade -location <cell>
```

| Parameter | Form | Aliases | Required | Description |
|---|---|---|---|---|
| `-location <cell>` | flag | `-loc`, `-l` | no | Room to upgrade. Without it, `upgrade` lists what can be upgraded. |

Behaviour:

- **Without a flag**, lists every Mk1 room that can be upgraded: cell, label, cost and the stat changes (`output 12 -> 18, radius 4 -> 5`). Rooms you cannot yet afford are shown as warnings with how much more is needed.
- **With `-location`**, spends the cost and upgrades the room to Mk2 in place. Wires and pipes are kept, stats change immediately, and the map cursor moves to the room.
- A **broken room can be upgraded**, but it stays broken: a warning lists what is still wrong (for example `NOT WIRED`).
- An upgrade that **raises power draw** (oxygen plant, hydroponics) is refused if the room is currently powered and its reactor lacks the spare power. Upgrade the reactor or build another one first.
- Upgrading a reactor raises its output and radius; links that were out of range may start working.

Errors: `Missing -location <cell>.`, invalid cell, `Nothing is built at <cell>.`, `The Command Hub cannot be upgraded.`, `<Room> at <cell> is already Mk2. Mk3 is a separate building.`, `Not enough materials: upgrading <label> costs <cost>, you have <n>.`, and `Reactor at <cell> has <n> spare power, and the upgrade needs <m> more. Build another reactor or upgrade this one.`

```
upgrade
upgrade -location h6
upgrade -l j6
```

---

### demolish

```
demolish -location <cell>
```

| Parameter | Form | Aliases | Required | Description |
|---|---|---|---|---|
| `-location <cell>` | flag | `-loc`, `-l` | yes | Cell of the room to tear down. |

Behaviour:

- Removes the room and refunds **50%** of everything spent on it, build cost plus upgrade cost, rounded down.
- Clears the map selection and connection highlight.
- Any wires, pipes or data links that pointed at a demolished reactor, oxygen plant or data source are dropped the next time the simulation recomputes (the rooms they fed simply lose supply).

Errors: `Missing -location <cell>.`, invalid cell, `Nothing is built at <cell>.`, or `You cannot demolish the Command Hub.`

Refunds at Mk1: reactor 20, oxygen plant 15, hydroponics 12, quarters 10, lounge 15, server rack 17, network switch 10. At Mk2 they are half of build plus upgrade: reactor 32, oxygen plant 25, hydroponics 20, quarters 16, lounge 24, server rack 27.

```
demolish -location e6
demolish -l e6
```

---

### inspect

```
inspect -location <cell>
inspect <cell>
inspect reset
```

| Parameter | Form | Aliases | Required | Description |
|---|---|---|---|---|
| `-location <cell>` | flag | `-loc`, `-l` | one of these | Cell to examine. |
| `<cell>` | positional | — | one of these | Shorthand for `-location <cell>`. The `-location` flag wins if both are given. |
| `reset` | positional | — | no | Clears the map highlight. Only recognised when `-location` is not given. |

Behaviour:

- **On a room**, prints its label, cell and id, its description, and, where relevant:
  - The tier in the name (`Reactor Mk2`) and, for Mk1 rooms, what the upgrade costs and changes
  - Radius (reactor, oxygen plant, lounge), at the room's current tier
  - Reactor: output, load (`used / output`) and number of rooms wired to it
  - Oxygen plant: output and pipes in use (`n / limit`); hydroponics: food output; quarters: beds
  - Power draw, for rooms that use power
  - Hub: data radius and data ports in use (`n / 6`). Network switch: data radius, ports in use (`n / 4`), and whether it is connected to the hub. Server rack: compute produced, and its data state (not networked, linked, or linked but not delivering)
  - Power-using rooms: `NOT WIRED`, online (and from which reactor), or wired but unsupplied (out of range or reactor overloaded)
  - Quarters: air status (`NOT PIPED`, flowing, or piped but unsupplied) and number of lounges in range
- **On an empty cell**, prints `<cell>: empty space.` and clears the highlight.
- Moves the map cursor to the cell and **highlights the room's connections**: its wires and pipes (in and out) and the rooms at the far ends stay lit while the rest of the map dims.
- The highlight persists until you run another `inspect`, `inspect reset`, inspect an empty cell, `demolish`, or a `view` that highlights (`view <room type>`, `view <category>`, `view reset`). Inspecting a room also clears any `view` highlight: the newest command wins.
- `inspect reset` prints `Map highlight cleared.`

Errors: if no valid cell is given, `Usage: inspect -location <cell>   e.g. inspect -location B4` (or the invalid-cell message).

```
inspect -location h6
inspect -l h6
inspect h6
inspect reset
```

---

### rooms

```
rooms
```

No parameters. Lists every room as `<cell>  <label>`, then (for rooms with a limit) how much of it is used (`ports 1/4`, `pipes 3/4`, `beds 2/3`, `load 9/12`; quarters without power or air add `(offline)`), then a bracketed problem list on rooms that are not working (shown as warnings):

| Flag shown | Meaning |
|---|---|
| `NOT WIRED` | Needs power and has no power line. |
| `NO POWER` | Has a power line, but it is out of range or the reactor is overloaded. |
| `NOT PIPED` | Quarters with no air pipe. |
| `NO AIR` | Quarters with an air pipe that is not delivering (plant unpowered, out of range, or full). |
| `NOT NETWORKED` | A room that needs data (server rack, network switch) with no data link. |
| `NO DATA` | Has a data link that is not delivering: out of the source's data radius, the source's ports are full, or the source is a switch that is cut off from the hub. |

A room with no problems ends with a green `[OPERATIONAL]` tag. This includes the Command Hub and reactors, which have nothing to connect.

---

### crew

```
crew
```

No parameters. Prints the population, then one line per colonist: name, role, and `housed` or `NO BUNK` (shown as a warning). Housing is assigned in order: the hub holds 4, each working quarters (powered and with air) holds 2. Colonists beyond the available beds are `NO BUNK`.

---

### speed

```
speed <1 | 1/2 | 1/4>
```

| Parameter | Form | Required | Description |
|---|---|---|---|
| `value` | positional | yes | The time multiplier. |

Accepted values:

| Input | Result |
|---|---|
| `1` | Normal speed (`1x`), one tick per second. |
| `1/2` or `0.5` | Half speed (`1/2x`). |
| `1/4` or `0.25` | Quarter speed (`1/4x`). |

Anything else prints `Usage: speed <1 | 1/2 | 1/4>`. There is **no pause** and no faster-than-normal speed. Has no flags.

---

### view

```
view zoom <in|out> [steps]
view pan <up|down|left|right> [cells]
view <room type or category>
view reset
```

Controls the map camera and highlight. None of it affects the simulation. Has no flags. The mouse does the same: wheel zooms, left-drag pans, double-click resets the camera.

| Form | Parameters | Description |
|---|---|---|
| `view zoom in` / `view zoom out` | `steps`: optional positive number, default `1`, max `10` | Zooms about the centre of the map panel. Each step is 1.25x. Zoom is limited to 0.5x-4x of the fit-everything size. |
| `view pan <direction>` | `direction`: `up`, `down`, `left` or `right`. `cells`: optional positive number, default `2`, max `50` | Moves the camera, so `left` shows what lies to the left. Distance is in cells at the current zoom. The map cannot be panned fully off screen. |
| `view <room type>` | `hub`, `reactor`, `oxygen`, `garden`, `quarters` or `lounge`; plurals such as `gardens` also work | Lights up every room of that type, dims the other rooms and the links, and lists the matching cells. If none are built it prints a warning and clears any highlight. It also clears an `inspect` focus (the newest command wins). |
| `view <category>` | `power`, `life`, `food`, `habitat` (and later categories once they hold rooms) | Same as `view <room type>`, but for every room in the category. Prints a warning and clears the highlight if none are built. |
| `view reset` | none | Restores the fit-everything view and clears any highlight, including an `inspect` focus. |

Errors: `Usage: view zoom <in|out> [steps]`, `Usage: view pan <up|down|left|right> [cells]`, `Steps must be a number from above 0 to 10.`, `Cells must be a number from above 0 to 50.`, `Unknown view option "<text>". ...`

```
view zoom in
view zoom out 3
view pan left 5
view gardens
view reset
```

---

### clear

```
clear
```

No parameters. Clears all text in the terminal. Game state and the map highlight are unchanged.

---

## Shell keyboard features

| Key | Action |
|---|---|
| `Enter` | Run the current line. |
| `Tab` | Autocomplete the token being typed: commands, flags (excluding ones already used), categories and room types after `build` (and `view`), speeds after `speed`, command names after `help`, `reset` after `inspect`, and valid cells after a flag. Multiple matches complete to their common prefix. |
| `Esc` | Clear the line being typed (and the previews that come from it). Does not touch the map cursor or highlight. |
| `Up` / `Down` | Recall previous / next command from history. |
| `Shift` + arrow keys | Move the map cursor (starts at the map centre if nothing is selected). |
| `Shift` + `Enter` | Type the selected cell into the current command (see below). |
| Click on the map | Move the map cursor (does not change the typed line). |

While typing, a hint line shows the usage for the current command, and a `⇧↵` preview line shows what `Shift+Enter` would produce. While a `build` line has a type and `-location`, the map shows a translucent ghost room and its radius ring; a `wire` or `pipe` line with both `-from` and `-to` shows a translucent link (red and dotted if it would be refused). Until a build `-location` is valid, the ghost follows the mouse.

### Shift+Enter autofill rules

| Line being typed | Result with cursor on cell `c` |
|---|---|
| `build <type> ...` | Sets `-location c` (replaces an existing one). |
| `wire ...`, `pipe ...` or `net ...` | First fill sets `-from c`; the next sets `-to c`; after both exist it replaces `-to`. |
| `unwire ...`, `unpipe ...` or `unnet ...` | Sets `-to c`. |
| `demolish ...` | Becomes `demolish -location c`. |
| `upgrade ...` | Becomes `upgrade -location c`. |
| empty line, or `inspect ...` | Becomes `inspect -location c`. |
| anything else (`speed`, `help`, `status`, ...) | Left unchanged. |

---

## Quick recipes

Add a food source (one reactor, in range of the new room):

```
build garden -location e6
wire -from h6 -to e6
```

Add housing:

```
build quarters -l j7
wire -f h6 -t j7
pipe -f j6 -t j7
```

Add compute (a rack needs power and data):

```
build rack -l g5
wire -f h6 -t g5
net -f i6 -t g5
```

Reach a rack beyond the hub's data radius with a switch (the switch needs power and its own link back to the hub):

```
build switch -l l6
wire -f m5 -t l6
net -f i6 -t l6
build rack -l o6
wire -f m5 -t o6
net -f l6 -t o6
```

Add a lounge near quarters:

```
build lounge -l k7
wire -f h6 -t k7
```

Move a room to a different reactor (rewire), or air to a different plant (reroute):

```
wire -from <other reactor> -to <room>
pipe -from <other plant> -to <quarters>
```

Take a room offline without demolishing it, then examine it:

```
unwire -to e6
inspect e6
```

Undo a mistake and recover half the cost:

```
demolish -l e6
```
