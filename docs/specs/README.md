# Structures track: implementation specs

These specs turn the decisions in [DESIGN.md](../DESIGN.md) ("Structures, tiers and compute") into small implementation slices. They were written away from a computer, so **nothing here has been built or tested**. Each slice is sized for one sitting and one pull request, and ends with a human test checklist to run in the browser.

## How to use a spec

1. Read DESIGN.md first. The specs assume its decisions and do not repeat the reasoning.
2. Implement one slice per branch and pull request, in order. A slice only depends on the slices before it.
3. Run `npm run typecheck`, then work through the slice's **Human test checklist** in the running game (`npm run dev`).
4. When the slice ships, change its status below and update DESIGN.md and API.md in the same PR. Mark anything that changed during implementation.

## Status

| # | Slice | Depends on | Status |
|---|---|---|---|
| 1 | [Categories](01-categories.md) | none | Not started |
| 2 | [Tiers and `upgrade`](02-tiers-and-upgrade.md) | 1 | Not started |
| 3 | [Compute capacity](03-compute-capacity.md) | 1 | Not started |
| 4 | [Data link and network switch](04-data-link-and-switch.md) | 3 | Not started |
| 5 | [`research`](05-research.md) | 2, 3, 4 | Not started |
| 6 | [Multi-cell footprints](06-multi-cell-footprints.md) | none (do before 7) | Not started |
| 7 | [Mk3 buildings and the coolant link](07-mk3-and-coolant.md) | 2, 5, 6 | Not started |
| 8 | [Industry and the cargo link](08-industry-and-cargo.md) | 5; blocked on the expansion decision | Not started |

Slices 1 and 6 touch different parts of the code and could be done in either order. Defense (turrets) is deliberately not in this track: it lands with Slice 2 of the main build order and needs coolant and cargo links to exist first.

## Conventions used in every spec

- **Placeholders.** Costs, radii, capacities and durations are starting values to be balanced in play. They are marked *(placeholder)*. Do not treat them as decided. Names of new commands and room types are also placeholders unless a spec says otherwise; if one changes, change it everywhere.
- **Command output.** Example terminal output shows intent, not exact wording. Keep the existing style: errors say why and what to do, warnings use the `warn` log kind, success uses `ok`.
- **Existing rules still hold** (DESIGN.md, Core design rules): the map never acts, connections are explicit, links persist when broken, and errors explain themselves. Typing load matters because time cannot be paused, so a new command should need as few flags as possible.
- **Code anchors.** Relevant types today are `RoomType`, `RoomDef`, `ROOM_DEFS`, `BUILDABLE` and `Room` in `src/sim.ts`, command parsing and completion in `src/commands.ts`, and drawing in `src/render.ts`. Anchors are hints; the specs describe behaviour, not code layout.
- **Docs.** Each slice updates API.md for any new or changed command, and the Room types table in DESIGN.md.
- **Test checklists.** Each step says what to type and what you should see. Start from a fresh page load unless the step says otherwise. Use `speed 1/4` while testing.

## Open questions that cut across slices

- **Verb names for new links.** The specs use `net` (data), `chill` (coolant) and `belt` (cargo), each with an `un` counterpart. Settle these before Slice 4.
- **Where the colony expands to** (DESIGN.md, Ideas under consideration). Slice 8 and the Mk3 footprint size depend on it.
- **Whether categories ever carry mechanics** (wave targeting, corruption weighting). Not needed by any slice here.
- **Whether Mk3 consumes or replaces the Mk2** it grows out of. Decided in Slice 7.
- **The Mk3 fork between win paths** (an Ascension and a Conquest flavour per category, probably exclusive per category). Held until the win paths are specced; see DESIGN.md, "Mk3 fork between the win paths". No slice here implements it, but every slice should avoid assuming exactly one Mk3 per category.
- **Extra Mk1 variants** (algae vat, scrubber, area turret and so on, see DESIGN.md, "Variety within a category"). Not part of slices 1 to 8; each variant is added after the slice that introduces the link type it needs, and gets its own small spec when it is picked up.
- **Whether `demolish` refunds scale with upgrades.** Decided in Slice 2.
