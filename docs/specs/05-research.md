# Slice 5: `research`

**Goal.** Add research as a command that reserves compute capacity until a project finishes, and use it to gate structures and tiers. This is the main in-run unlock path.

**Status:** Not started. **Depends on:** Slices 2, 3 and 4.

## Scope

- The `research` command, a small tech list, and project timing.
- Compute capacity is reserved by active projects (this is the first consumer of compute).
- Locked and unlocked state for room types and for Mk2 upgrades, shown in `build` and `upgrade`.
- A starting unlocked set.

Out of scope: meta-progression (it will set the starting unlocked set and the research pool between runs; for now both are constants in code), scripts as compute consumers, Mk3 techs (Slice 7 adds its own).

## Rules

- The Command Hub provides research. There is no lab room.
- Each tech has a **compute cost** (capacity reserved while it runs) and a **duration** in ticks. When it finishes, the capacity is released and the tech is permanent for the run.
- A project can only start if free compute capacity is at least its cost. Otherwise it is refused and the message says how much is missing and suggests building a rack.
- Several projects may run at once as long as total reserved capacity fits. If capacity drops below total reserved (a rack goes offline), the **newest** project pauses until capacity returns. Paused projects keep their progress. Log a warning when this happens.
- Cancelling a project releases its capacity immediately and loses its progress.
- **Hub baseline:** the hub may provide a small baseline capacity (placeholder: 1) so the very first project is possible without a rack. This is an **Open** decision; if used, it appears in `status compute` as its own line.

## Commands

```
research
research <tech>
research cancel <tech>
```

**`research`** with no arguments lists techs in three groups: running (with progress), available (with cost, duration and what they unlock), and done. Techs whose prerequisite is missing are shown as locked with the prerequisite. Show free compute at the top.

```
> research
Compute: 1 free of 4
Running:
  mk2-oxygen   60%   reserves 2   done in 12 ticks
Available:
  mk2-reactor  reserves 2   40 ticks   unlocks Reactor Mk2
  switch       reserves 1   25 ticks   unlocks Network Switch
Locked:
  mk3-fusion   needs mk2-reactor
```

**`research <tech>`** starts a project. Errors: unknown tech (list the names), already done, already running, locked (name the prerequisite), not enough free compute (give the shortfall).

**`research cancel <tech>`** cancels a running or paused project.

Tab completion offers tech names after `research`, and `cancel` plus running tech names after `research cancel`.

## Gating

- `build <category>` lists locked types with the tech needed (`LOCKED (research: switch)`). `build <type>` on a locked type is refused with the same information and a pointer to `research`.
- `upgrade` shows Mk2 as locked until its tech is done, and refuses the upgrade with the tech name.
- Initial techs *(placeholder)*: a Mk2 tech for each of the five existing buildable types, plus techs for `rack` and `switch`. The starting unlocked set should include everything the player needs for the opening (reactor, oxygen, garden, quarters, lounge), so the early game is unchanged. Whether `rack` and `switch` start locked is **Open**; the simplest answer is that `rack` starts unlocked, since you cannot research without one.
- Slice 2's free Mk2 upgrade becomes gated here. Slice 2's checklist stays valid for Slice 2 on its own; record the change in API.md and DESIGN.md when this slice lands.

## Reporting

- `status compute` now shows reserved capacity broken down by project, and the free amount.
- `status` Compute line shows used (reserved) over capacity.
- `status alerts` reports paused projects and the reason.
- Log lines: research started, research done (with what it unlocked), research paused for lack of compute.

## Human test checklist

1. Load the page and build a rack, wire it and net it (Slices 3 and 4). `status compute` shows capacity 4 and free 4.
2. Type `research`. You see the available techs with costs and durations. Locked techs show their prerequisite.
3. `research mk2-reactor`. It starts. `status compute` shows 2 reserved and 2 free. `research` shows progress rising each tick (use `speed 1/4` to watch).
4. Start a second project that fits. Both run. Start a third that does not fit: you get the shortfall message.
5. `build power`. Types that are not yet unlocked show as locked with the tech name. `build <locked type> -l <cell>` is refused with that tech name.
6. Wait for `mk2-reactor` to finish. A log line reports it and what it unlocked. `upgrade -l h6` now works.
7. Before that tech finished, `upgrade -l h6` was refused with the tech name (confirm by trying it in a fresh load).
8. Start a project, then `unwire` the rack. Capacity drops below reserved; the project pauses with a warning. Rewire: it resumes where it left off.
9. `research cancel <tech>` releases capacity and drops progress. Starting it again begins from zero.
10. Try `research bogus`, a done tech, a running tech and a locked tech. Each gives a clear message.
11. Tab completion offers tech names after `research`.
12. `npm run typecheck` passes.

## Open questions

- Hub baseline compute: none, or a small amount?
- Do paused projects pause newest-first, or the most expensive first?
- Should finishing research ever be interrupted by waves (an attack that costs compute)? Not for now.
