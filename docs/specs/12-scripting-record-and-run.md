# Slice 12: Scripting, record and run

**Goal.** The first step of the scripting ladder (DESIGN.md, "Scripting"): the player records a sequence of commands by doing them once, then replays it as a background process that costs compute. There are no variables, selectors or events yet. Those wait for the language and query design (Slice 13).

**Status:** Not started. **Depends on:** Slices 3 and 4 (working compute capacity) and Slice 5 (the shared project mechanism for reserving capacity).

## Why this slice is small on purpose

The language and the way scripts query the colony are not designed yet. This slice builds only what does not depend on them: capturing commands, storing them as text, running them with a compute cost, and showing progress. If the stored format is the same text the player types, the later slices can extend it without rework.

## Scope

- `record`, `stop`, `run`, `kill`, and a `scripts` command to list, show and delete.
- Running a script as a background process that reserves compute.
- Display of progress in the terminal and on the map.

Out of scope: editing scripts, variables, selectors such as `nearest reactor`, conditions, loops, events and triggers (all Slice 13 and later), saving scripts across page loads or runs, and unlock gating.

## Command classification

Every command gets a tag, used here and by all later scripting work:

| Tag | Meaning | Examples |
|---|---|---|
| `action` | Changes the colony. Can be recorded and run. | `build`, `wire`, `unwire`, `pipe`, `unpipe`, `demolish`, and later `upgrade`, `net`, `unnet`, `chill`, `belt`, `research`, `survey`, `train`, `assign` |
| `query` | Reads the colony. Not recorded in this slice. | `status`, `inspect`, `rooms`, `crew`, `help` |
| `ui` | Changes only the view or terminal. Never recorded. | `view`, `clear`, `speed` |

New commands added by later slices must declare a tag. A missing tag should be a type error, so none is forgotten. `record`, `stop`, `run`, `kill` and `scripts` are `ui`, so a script can never contain or start another script.

## Recording

```
record <name>
... commands ...
stop
```

- `record <name>` starts recording. The name is lowercase letters, digits and hyphens, up to 20 characters, and not the name of a command. Errors: missing name, invalid name, name already used (`Script "<name>" exists. Delete it first: scripts delete <name>.`), already recording.
- While recording, every command still **runs normally** against the colony. The prompt or hint line shows that recording is on (placeholder: a `rec>` marker and a line such as `Recording "hookup". Type stop to finish.`).
- A command is **saved** only if it is tagged `action` **and succeeds**. Failed commands are run and shown but not saved, so a recording only holds what worked. Query and ui commands run normally and are not saved.
- Each saved step is stored as the **text exactly as typed**, after the usual lowercasing and alias handling that the parser does. Do not store a parsed structure as the source of truth; later slices will edit and extend the text.
- `stop` ends the recording, saves it and prints `Saved script "<name>" (<n> steps).` An empty recording is discarded with a message.
- A script holds at most 20 steps *(placeholder)*. Hitting the limit ends the recording with a warning.
- Recording state is lost on page reload (nothing is saved yet).

## Running

```
run <name>
kill <name>
```

- `run <name>` starts the script as a background process. It reserves compute capacity *(placeholder: 1)* for as long as it runs. If free compute is lower than that, refuse with the shortfall and a suggestion to build a rack (same wording style as `research`). Errors: unknown name, already running, currently recording.
- The script runs **one step per tick** *(placeholder)*. At slower game speeds a tick is longer, so scripts slow down with the game.
- Each step runs through the **same command parser and executor** as typed commands. Output lines are prefixed so the player can follow them: `[hookup 2/3] wire -from h6 -to e6`, followed by the command's normal result.
- Commands that move the map cursor still do, so the player can watch the script work across the map. Running a script must not clear the player's typed line or an active highlight.
- If a step **fails**, the script halts at that step. The log reports the step number, the command and the reason. Compute is released. Continue-on-error is **Open**; default is halt.
- When the script finishes, the log says `Script "<name>" finished (<n> steps).` and compute is released.
- If compute capacity drops below what running scripts reserve (a rack goes offline), the **newest** running script pauses and keeps its position, exactly as research does, and resumes when capacity returns. Log a warning when this happens.
- `kill <name>` stops a running script and releases its compute. Errors: unknown name, not running.
- Several different scripts can run at once while capacity allows. The same script cannot run twice at once.

## `scripts`

```
scripts
scripts show <name>
scripts delete <name>
```

- `scripts` lists each script: name, step count, and state (`idle`, `running 2/3`, `paused`).
- `scripts show <name>` prints the numbered steps.
- `scripts delete <name>` removes a script. A running script must be killed first.

Tab completion: script names after `run`, `kill`, `scripts show` and `scripts delete`; subcommands after `scripts`. `help` lists the new commands.

## Reporting

- `status compute` (Slice 3) shows running scripts as a reservation, alongside research and survey.
- `status alerts` reports paused scripts and the reason. It does not alert on halted scripts; the log line is enough.
- No map changes are required beyond the cursor movement above. A small "script running" indicator on the HUD is optional.

## Interactions to get right

- Recorded steps replay against a **different** colony state than when they were recorded, so they can fail (a cell is now occupied, materials are short). That is expected in this slice; halting with a clear reason is the behaviour.
- Time cannot be paused, and scripts run on game ticks, so a script never runs while the game is not running.
- The history and cursor behaviour of the terminal must not be disturbed: Up and Down recall still works, and recorded commands also go into history as normal.
- `speed` is tagged `ui`. A script cannot change game speed.

## Human test checklist

All steps assume a wired, networked server rack so compute is available (Slices 3 and 4).

1. `record hookup`. The hint or prompt shows that recording is on.
2. `build garden -l e6`, then `wire -f h6 -t e6`, then `status` (a query), then `build garden -l h6` (this fails because it is occupied), then `stop`. You see `Saved script "hookup" (2 steps).` The failed build and the query were not saved.
3. `scripts` lists `hookup` with 2 steps, idle. `scripts show hookup` prints the two commands exactly as typed.
4. `demolish -l e6`. Then `run hookup`. Compute is reserved (check `status compute`). Over the next two ticks you see `[hookup 1/2] build ...` and `[hookup 2/2] wire ...`. The cursor moves to the new rooms. The script finishes and compute is released.
5. Run `hookup` again with e6 already built. The first step fails, and the script halts with the step number and reason. Compute is released.
6. Try `run hookup` twice quickly: the second is refused as already running.
7. Try `run nosuch`, `record hookup` (exists), `record wire` (command name), `record Bad Name`, and `record` with no name. Each gives a clear error.
8. Start `run hookup`, then `kill hookup`. It stops and compute is released.
9. Start a script, then `unwire` the rack. The script pauses with a warning. Rewire it and it resumes.
10. With no free compute, `run hookup` is refused with the shortfall.
11. `scripts delete hookup` while it runs is refused. Kill it, then delete it. `scripts` no longer lists it.
12. While recording, try `record x`, `run hookup` and `scripts delete hookup`. They are refused.
13. Record 21 steps. Recording ends at 20 with a warning.
14. Reload the page. Scripts are gone (known limit for this slice).
15. Tab completion offers script names after `run`.
16. `npm run typecheck` passes, and an untagged command is a type error.

## Open questions

- Halt on a failed step, or continue.
- Step rate: one step per tick, or a per-script setting.
- Whether to overwrite on `record`, or require deleting first.
- How to edit a script before Slice 13 exists (the simplest answer is delete and re-record).
- Saving scripts across page loads (browser storage), and across runs as a meta-progression unlock.
- Whether `record` and scripting are available from the start (as written, for testing) or unlocked later (DESIGN.md: early runs force hand-typing).
- Final command names (`record`, `stop`, `run`, `kill`, `scripts`).
