# Space Colony — Command Shell API

Reference for every command that can be typed into the shell at the bottom of the game. The source of truth is [`src/commands.ts`](../src/commands.ts) (commands, flags, aliases) and [`src/sim.ts`](../src/sim.ts) (rooms, numbers, cell parsing).

## Contents

1. [Syntax](#syntax)
2. [Cells](#cells)
3. [Flag aliases](#flag-aliases)
4. [Room types](#room-types)
5. [Command index](#command-index)
6. [Commands](#commands)
7. [Shell keyboard features](#shell-keyboard-features)
8. [Quick recipes](#quick-recipes)

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
| `-from` | The source of a connection (reactor for `wire`, oxygen plant for `pipe`). | `-from`, `-f`, `-src` |
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
| `rec` | Rec Room | 30 | 2 | 3 | Needs power. Quarters within its radius get a happiness boost. |

Other limits used by the commands:

- A reactor supplies **12** power total.
- An oxygen plant feeds at most **4** quarters.
- Distances are straight-line (Euclidean) between cell centres, e.g. `h6` to `j7` is about 2.2.
- `demolish` refunds half the build cost, rounded down.

---

## Command index

| Command | Usage | Summary |
|---|---|---|
| [`help`](#help) | `help [command]` | List commands, or explain one. |
| [`status`](#status) | `status` | Resource and happiness overview. |
| [`build`](#build) | `build <type> -location <cell>` | Construct a room. |
| [`wire`](#wire) | `wire -from <reactor> -to <room>` | Run a power line from a reactor to a room. |
| [`unwire`](#unwire) | `unwire -to <room>` | Cut the power line to a room. |
| [`pipe`](#pipe) | `pipe -from <oxygen plant> -to <quarters>` | Pipe air from an oxygen plant to quarters. |
| [`unpipe`](#unpipe) | `unpipe -to <quarters>` | Cut the air pipe to quarters. |
| [`demolish`](#demolish) | `demolish -location <cell>` | Tear down a room for a 50% refund. |
| [`inspect`](#inspect) | `inspect -location <cell>` / `inspect reset` | Room details and map highlight. |
| [`rooms`](#rooms) | `rooms` | List every room and whether it is working. |
| [`crew`](#crew) | `crew` | List colonists and who has a bunk. |
| [`speed`](#speed) | `speed <1 \| 1/2 \| 1/4>` | Slow time down (no pause). |
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
```

No parameters. Prints a colony-wide overview:

- **Power** — `demand wanted / supply produced`
- **Oxygen**, **Food** — current stock (0–100)
- **Materials** — current stock, rounded down
- **Population** — number of colonists
- **Happiness** — score plus the four components as percentages: air, food, housing, fun

---

### build

```
build <type> -location <cell>
```

| Parameter | Form | Aliases | Required | Description |
|---|---|---|---|---|
| `type` | positional | — | yes | One of `reactor`, `oxygen`, `garden`, `quarters`, `rec`. See [Room types](#room-types). |
| `-location <cell>` | flag | `-loc`, `-l` | yes | Cell to build on. |

Behaviour:

- Spends the room's cost from materials and places the room.
- The map cursor moves to the new room.
- Prints a warning if the new room still needs setup:
  - Any room that draws power (everything except a reactor): `Not wired yet: wire -from <reactor> -to <cell>`
  - Quarters: `No air yet: pipe -from <oxygen plant> -to <cell>`

Errors:

| Condition | Message |
|---|---|
| Type or `-location` missing | `Usage: build <type> -location <cell>   (try "help build")` |
| Type not buildable (including `hub`) | `Unknown room type "<type>". Options: reactor, oxygen, garden, quarters, rec.` |
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
- Only rooms that draw power can be wired: oxygen plant, hydroponics, quarters, rec room. Reactors and the hub cannot.

Errors:

| Condition | Message |
|---|---|
| `-from` missing | `Missing -from <cell>.` |
| `-to` missing | `Missing -to <cell>.` |
| Invalid cell | `"<text>" is not a valid cell. ...` |
| Nothing built at a cell | `Nothing is built at <cell>.` |
| Source is not a reactor | `<room> at <cell> is not a reactor.` |
| Target uses no power | `<room> at <cell> does not use wired power.` |
| Target out of range | `Out of range: <room> is <d> cells from the reactor, and its radius is 4.` |
| Reactor lacks capacity | `Reactor at <cell> has <n> spare power, and <room> needs <draw>. Build another reactor.` |

The capacity check ignores the target's own current draw when rewiring a room that is already powered by the same reactor.

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

### demolish

```
demolish -location <cell>
```

| Parameter | Form | Aliases | Required | Description |
|---|---|---|---|---|
| `-location <cell>` | flag | `-loc`, `-l` | yes | Cell of the room to tear down. |

Behaviour:

- Removes the room and refunds **50%** of its build cost (rounded down).
- Clears the map selection and connection highlight.
- Any wires or pipes that pointed at a demolished reactor or oxygen plant are dropped the next time the simulation recomputes (the rooms they fed simply lose supply).

Errors: `Missing -location <cell>.`, invalid cell, `Nothing is built at <cell>.`, or `You cannot demolish the Command Hub.`

Refunds: reactor 20, oxygen plant 15, hydroponics 12, quarters 10, rec room 15.

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
  - Radius (reactor, oxygen plant, rec room)
  - Reactor: load (`used / 12`) and number of rooms wired to it
  - Oxygen plant: pipes in use (`n / 4`)
  - Power-using rooms: `NOT WIRED`, online (and from which reactor), or wired but unsupplied (out of range or reactor overloaded)
  - Quarters: air status (`NOT PIPED`, flowing, or piped but unsupplied) and number of rec rooms in range
- **On an empty cell**, prints `<cell>: empty space.` and clears the highlight.
- Moves the map cursor to the cell and **highlights the room's connections**: its wires and pipes (in and out) and the rooms at the far ends stay lit while the rest of the map dims.
- The highlight persists until you run another `inspect`, `inspect reset`, inspect an empty cell, or `demolish`.
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

No parameters. Lists every room as `<cell>  <label>`, with a bracketed problem list on rooms that are not working (shown as warnings):

| Flag shown | Meaning |
|---|---|
| `NOT WIRED` | Needs power and has no power line. |
| `NO POWER` | Has a power line, but it is out of range or the reactor is overloaded. |
| `NOT PIPED` | Quarters with no air pipe. |
| `NO AIR` | Quarters with an air pipe that is not delivering (plant unpowered, out of range, or full). |

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
| `Tab` | Autocomplete the token being typed: commands, flags (excluding ones already used), room types after `build`, speeds after `speed`, command names after `help`, `reset` after `inspect`, and valid cells after a flag. Multiple matches complete to their common prefix. |
| `Up` / `Down` | Recall previous / next command from history. |
| `Shift` + arrow keys | Move the map cursor (starts at the map centre if nothing is selected). |
| `Shift` + `Enter` | Type the selected cell into the current command (see below). |
| Click on the map | Move the map cursor (does not change the typed line). |

While typing, a hint line shows the usage for the current command, and a `⇧↵` preview line shows what `Shift+Enter` would produce. Typing `build <type>` also shows a radius preview on the map under the hover cell.

### Shift+Enter autofill rules

| Line being typed | Result with cursor on cell `c` |
|---|---|
| `build <type> ...` | Sets `-location c` (replaces an existing one). |
| `wire ...` or `pipe ...` | First fill sets `-from c`; the next sets `-to c`; after both exist it replaces `-to`. |
| `unwire ...` or `unpipe ...` | Sets `-to c`. |
| `demolish ...` | Becomes `demolish -location c`. |
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

Add a rec room near quarters:

```
build rec -l k7
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
