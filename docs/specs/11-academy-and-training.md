# Slice 11: Academy and `train`

**Goal.** Give the player control over which roles their crew have, without ever managing individuals. An academy room has training slots, and `train` turns generalists into specialists over time. Arrivals are also tilted toward the roles the colony's rooms need.

**Status:** Not started. **Depends on:** Slices 5 (shared project mechanism) and 10 (roles and staffing).

## Scope

- The academy room (Mk1 and Mk2).
- The `train` command.
- Passive attraction: arrivals tilt toward the roles the room mix needs.
- A developer-only `arrive` command so arrivals can be tested without waiting.

Out of scope: academy variants (war college, research institute), the Mk3 academy, `train auto`, retraining specialists, a strike force or soldier role, and script hooks. These are listed in DESIGN.md as Proposed and have no spec yet.

## The academy

| Field | Value |
|---|---|
| Type | `academy` |
| Label | Academy |
| Category | `habitat` |
| Cost | 40 *(placeholder)* |
| Power draw | 2 *(placeholder)* |
| Needs | Power (`wire`) |
| Training slots | Mk1: 2, Mk2: 4 *(placeholder)* |
| Roles taught | Mk1: basic roles. Mk2: basic plus advanced *(placeholder: pilot)* |

- Basic roles: engineer, botanist, scientist, mechanic, medic. Advanced: pilot. (This follows Slice 10's role table.)
- An unpowered academy trains nothing. Training in progress pauses and keeps its progress.
- Mk2 comes from the Slice 2 tier system: add an academy row to its Mk2 table, and to the research gating in Slice 5 if tiers are gated by tech. Academy staffing (a teacher role) is **Open** and not part of this slice.

## Training

- **Slots are the capacity.** Each trainee occupies one training slot at one academy until their training finishes. Use the same reservation mechanism as research and survey (Slice 5): a "project" that reserves capacity, shows progress, pauses when capacity is lost and can be cancelled.
- **Duration:** *(placeholder: 20 ticks per colonist)*. Colonists in the same `train` command train in parallel up to the free slots, and the rest wait their turn. The remaining queue shows in `train`.
- **Only generalists can be trained.** Retraining a specialist is **Open**.
- **Cost of training (visible, by design):**
  - A trainee does not staff a room while training, and does not count toward materials income *(placeholder)*. `status materials` should show the income reduction so the cost is visible.
  - Starting training costs materials *(placeholder: 10 per colonist)*.
- A colonist finishes as a specialist of the requested role. The log reports it and the crew summary updates.

## Commands

```
train -role <role> [-count <n>] [-location <cell>]
train
train cancel -location <cell> [-role <role>]
```

- **Flags and aliases.** `-role` has alias `-r`, `-count` has alias `-n`, and `-location` keeps its usual aliases (`-loc`, `-l`). The new aliases do not collide with existing ones (`-f`, `-t`, `-l`). Aliases are global, so make sure a new alias does not change what an existing command reads.
- `-count` defaults to 1. It is a whole number from 1 up to the number of idle generalists.
- **Choosing an academy.** With `-location`, the named academy is used. Without it, the game picks an academy that is powered, can teach the role and has free slots (placeholder: lowest free slot count first, to keep one academy full before using another). If none qualifies, refuse with the reason.
- **`train`** with no arguments lists each academy: cell, tier, free and used slots, the roles it can teach, and the queue and progress of its trainees. It also shows idle generalists.
- **`train cancel -location <cell>`** cancels all training at that academy, or only a role with `-role`. Progress is lost, trainees return to the generalist pool and slots are released. Refund: none *(placeholder)*.

Errors, in the existing style:

| Condition | Message (intent) |
|---|---|
| `-role` missing | `Usage: train -role <role> [-count <n>] [-location <cell>]   (try "help train")` |
| Unknown role | `Unknown role "<text>". Options: engineer, botanist, ...` |
| Role not taught here | `<academy> at <cell> cannot teach <role>. Upgrade it, or train at another academy.` |
| No academy | `You have no academy. Build one: build habitat.` |
| Not enough idle generalists | `Only <n> idle generalists. Train fewer, or wait for arrivals.` |
| Not enough materials | `Not enough materials: training <n> costs <cost>, you have <m>.` |
| No free slots | `No free training slots. Wait, or build another academy.` |
| Academy unpowered | `<academy> at <cell> has no power.` |

Tab completion: roles after `-role`, academy cells after `-location`, `cancel` after `train`. Shift+Enter fills `-location` for `train`.

## Passive attraction

- When a colonist arrives (every 15 ticks while a bed is free and happiness is at least 50), they are a **generalist** with a chance to arrive already specialized *(placeholder: 25 percent)*.
- When they do, the role is drawn with weights from the room mix: more food rooms tilt toward botanists, reactors toward engineers, racks toward scientists, and so on. A room contributes to the weight of the role that staffs it *(placeholder: one point per Mk2 room, a fraction per Mk1)*.
- This is deliberately weak and needs no player input. The academy is the precise control.

## Developer-only `arrive`

Behind the same dev flag as other test helpers (for example `?dev` in the URL), add `arrive [-role <role>]`, which immediately adds one colonist (a generalist, or the given role) if there is a free bed. It must not appear in `help`, tab completion or the hint line in normal play. It exists so arrivals and the attraction tilt can be tested without waiting 15 ticks each.

## Human test checklist

1. Load the page with the dev flag. Build an academy and wire it. `train` lists it with 2 free slots and the roles it can teach, and the idle generalists.
2. `train -role engineer`. Materials drop by the cost. `train` shows one trainee in progress. `crew` shows one fewer idle generalist and one more in training.
3. `status materials` shows lower income while someone is training.
4. Wait for completion (watch with `speed 1/4`). The log reports it, and `crew` shows one more engineer.
5. `train -role botanist -count 2`. Both train in parallel. Then `train -role botanist -count 3` with only two slots: the third waits in the queue, and `train` shows the queue.
6. `train -role pilot` at a Mk1 academy is refused with the can't-teach message. Upgrade the academy to Mk2 and retry.
7. `train -role engineer -count 99` is refused for not enough idle generalists.
8. `unwire` the academy. Training pauses. Wire again and it resumes with its progress.
9. `train cancel -l <academy>` cancels, returns the trainees to generalists and releases the slots.
10. Build a second academy. `train -role scientist` with no `-location` picks one with free slots. `train -role scientist -l <specific academy>` uses the one you name.
11. With the dev flag, run `arrive` many times and confirm that most arrivals are generalists and that the specialized ones lean toward the roles your rooms need (build several hydroponics first and check that botanists appear more often). A run of 20 to 30 arrivals is enough to see a tilt, but not a guarantee.
12. Without the dev flag, `arrive` is unknown and absent from `help` and tab completion.
13. `help train` explains the flags and aliases.
14. `npm run typecheck` passes.

## Open questions

- Retraining specialists, and at what cost.
- Whether the academy needs a teacher role to run.
- `train auto` as a default policy, and script hooks (`on arrival`).
- Academy variants: a war college (Conquest-leaning, advanced roles) and a research institute (Ascension-leaning), and how the Mk3 fork treats them.
- Whether a trainee should still count toward oxygen and food (default: yes).
