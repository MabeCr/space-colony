# Slice 13: Scripting language, queries and events

**Goal.** Decide what scripts can look like beyond replaying typed commands: how they ask questions about the colony, refer to things without fixed cells, and react to events. This is where the scripting ladder's steps 2 and 3 live (generalize, then trigger).

**Status:** **Design needed. Do not implement yet.** This file records what has to be decided, so the design conversation can pick up where it stopped. **Depends on:** Slice 12.

## What the first useful script needs

The goal is the build-automation ladder from DESIGN.md:

1. Record a `wire` once (Slice 12).
2. Replace the fixed cells with something general, so the script works for any new room.
3. Run it automatically when a room is built.

A hypothetical result, **illustrative only and not decided syntax**:

```
# hookup: power any room that just got built
wire -from nearest reactor with spare -to $room
```

and a trigger, such as `on build run hookup`. To get there the language needs at least a way to name the thing the event is about (`$room`), a way to pick a reactor by a rule (`nearest reactor with spare`), and a way to attach the script to an event. Everything else is optional for the first release.

## Constraints already decided

- **Types of scripts are not a mechanic.** One language; the available commands decide what is possible (DESIGN.md, "Scripting").
- **Every command is scriptable** and succeeds or fails predictably. The `action`, `query` and `ui` tags from Slice 12 carry over.
- **Scripts cost compute** while they run. A per-tick instruction budget is the intended model.
- **Deliberately tiny and shell-like** (DESIGN.md, Proposed): variables, `if`, loops, functions and `on <event>`, interpreted in the game. Real JavaScript is rejected for now.
- **Playable by non-programmers.** Each step on the ladder should add one idea.
- **Stored as text** in the same syntax the player types, so scripts can be recorded, shown and edited as plain lines.

## Decisions needed, in suggested order

**1. The object and query model (decide first).** What things exist for a script to talk about, and what can it ask?

- **Objects:** rooms, links (wires, pipes, data, coolant, cargo), crew and roles, resources (power, oxygen, food, materials, compute), cells and sectors, projects (research, survey, training, running scripts), and later enemies and waves.
- **Properties:** for a reactor, its spare power and radius; for a room, its type, tier, cell, state and staffing; for a resource, its level and its rate. Which of these are exposed, and under what names?
- **How questions are asked.** Options: query commands whose output a script can capture (continuing the shell style, for example `rooms` or a new `find`), versus expressions inside the language (for example `reactor.spare`). Shell style is the thematic fit but needs a way to capture and compare results.
- **Return values and types.** Do queries return text, numbers, lists of cells, or a small set of typed values?

**2. Selectors.** How does a script refer to things without hard-coding cells?

- Candidates: `nearest <type>`, `all <type>`, filters such as `with spare` or `in range`, the room an event is about (`$room`), and the last thing built.
- Whether a selector can be used inside any command flag (`-from nearest reactor`) or only in a separate query step.
- What a selector that matches nothing does (error, or skip).

**3. Variables, conditions and loops.** The smallest set that makes the ladder work: assignment, `if`, and a loop over a list (`foreach`). Decide what is deferred to later unlocks (DESIGN.md: `repeat`, `on <event>` and `define` unlock progressively).

**4. Events and triggers.** Which events exist, what data each carries, and how a trigger is attached and removed.

- Candidates: `build`, `demolish`, power or oxygen or food low, a wave warning, a colonist arrival, a survey or research or training finished, a room went offline, corruption detected.
- How triggers are listed and disabled, whether a trigger can fire while its own script is still running, and a limit on how many triggers can exist (compute is the natural limit).

**5. The cost model.** How instruction cost maps to compute and to time.

- What counts as an instruction (a command, a query, a loop iteration), how it scales with the number of objects a query touches (this ties into the corruption idea that monitoring cost scales with what is watched), and what happens when a script exceeds its budget (pause, slow, or halt).

**6. Editing.** How does a player change a script, especially on a phone or in a terminal with one line of input?

- Options: delete and re-record (Slice 12), a line editor (`scripts edit <name> <line>`), a modal multi-line editor in the terminal panel, or editing a script as a text area outside the terminal. The map must remain read-only, but a script editor is not the map.

**7. Errors and safety.** How scripts report errors so they are diagnosable (a corruption design goal), what happens on a failed step in a longer script, loop protection, and how a runaway script is stopped (`kill` from Slice 12).

**8. Unlocks.** Which language features are available from the start of a run and which are unlocked by meta-progression (DESIGN.md: early runs force hand-typing).

## Later slices that depend on this one

These will be written only after the decisions above:

- Selectors and variables in recorded scripts (ladder step 2).
- Event triggers (ladder step 3).
- Script editing.
- The corruption-control features: detect and fix scripts, checkpoint and rollback.
- `simulate` or dry runs.
- Scripted drones, emergency playbooks, resource and compute governors.
- Saving scripts across runs and sharing them.

## How to finish this spec

Work through the decisions in order. When decisions 1 to 4 are made, write a short design section in DESIGN.md and turn this file into one or two implementation slices (for example, "selectors and variables" and "event triggers"), each with a human test checklist like the others in this folder.
