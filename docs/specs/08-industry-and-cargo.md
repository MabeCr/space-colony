# Slice 8: Industry and the cargo link

**Goal.** Give materials a physical source (mines on deposits) and a cargo link to carry them, so that expansion has a readable reason: nearby deposits run out. This is the first test of the "finite local resources" idea from DESIGN.md.

**Status:** Not started and **blocked** on one decision (below). **Depends on:** Slice 5.

## The blocking decision

DESIGN.md, Ideas under consideration, asks where the colony expands to. The grid is fixed at 16 by 10. Options are revealing more map over time or separate outpost grids linked by a command. Until that is settled, this slice can be built only as a **single-grid prototype**: a handful of deposits on the existing grid, with no way to go beyond it. A single-grid prototype is still worth building because it tests the mine, the deposit and the cargo link, but it cannot prove the expansion pressure. Do not treat it as the final design.

## Scope (single-grid prototype)

- Deposits on the map, visible from the start.
- A mine room that can only be built on a deposit cell, and that produces materials by drawing the deposit down.
- The cargo link, carrying materials from mines to the hub.
- A fabricator, but only if its job is settled (see Open questions). Otherwise defer it.

Out of scope: outposts, map reveal, surveying, the Mk3 refinery, ammo.

## Deposits

- A deposit is a cell with an amount of ore remaining *(placeholder: 200 to 500 per deposit)*. Deposits are generated at the start of a run from a seed, and are always visible, so the player can plan around them (DESIGN.md guardrail: pressure comes from information the player can see).
- Show deposits on the map with a marker and the remaining amount on hover and in `inspect`. A `view deposits` command lists them with cells and amounts.
- A deposit can only be built on by a mine. Other room types cannot be built on a deposit cell (a clear error).

## The mine

| Field | Value |
|---|---|
| Type | `mine` |
| Label | Mine |
| Category | `industry` |
| Cost | 30 *(placeholder)* |
| Power draw | 2 *(placeholder)* |
| Location | A deposit cell only |
| Effect | Extracts up to 2 ore per tick from its deposit while powered and linked *(placeholder)* |

A mine needs power (`wire`) and a cargo link to deliver ore. Ore delivered to the hub becomes materials.

## Cargo link

Verb names are placeholders: `belt` and `unbelt`.

```
belt -from <mine or fabricator> -to <hub or fabricator>
unbelt -to <cell>
```

- A cargo link has a length limit *(placeholder: 5 cells)* and each source feeds one destination. The hub accepts any number of links.
- Rules mirror pipes: persistent when broken, rerouting replaces, the usual error messages and previews, and autofill on `-from` then `-to`.
- Flags: `NOT CONNECTED` (a mine with no cargo link) and `NO DELIVERY` (a link that is not delivering: out of range or the mine is unpowered).
- A map colour for cargo (placeholder: orange) and animated dashes for working links.

## Materials income

This is the second blocking question: today materials arrive at 1 plus 0.5 per colonist every tick forever (see DESIGN.md, Simulation). For the prototype:

- Keep the base income, but reduce it *(placeholder: 0.3 per tick plus 0.2 per colonist)*, so mines matter but the start still works.
- Mines add ore on top.
- `status materials` shows income split into base and mining, and forecasts when each deposit runs out, so the player can see the pressure coming.

Whether base income should eventually fall to zero (so that mining becomes mandatory) is **Open**.

## Fabricator

Not specified. The category table in DESIGN.md lists it as an industry Mk1, but its job is not settled. Candidates: converting materials into ammo for defense, producing parts for Mk3 buildings, or reducing upgrade costs. Do not build it until one is chosen.

## Human test checklist

1. Load the page. The map shows several deposits with markers. `view deposits` lists their cells and amounts.
2. `build industry` lists the mine. `build garden -l <deposit cell>` is refused with a clear message about deposits.
3. `build mine -l <deposit cell>` works. You are warned it needs wire and a cargo link.
4. `rooms` shows the mine as `NOT WIRED` and `NOT CONNECTED`. Wire it, then `belt -f <mine> -t i6`. Both flags clear.
5. `status materials` shows base and mining income and a run-out forecast for the deposit.
6. Wait and watch the deposit amount fall (`inspect` on the deposit cell, or `view deposits`). When it hits zero, the mine stops, a log line says so, and the forecast text matches what happened.
7. `unbelt -t i6` (or whichever cell the mine feeds from). The mine reports `NO DELIVERY` and income drops.
8. Build a mine farther from the hub than the link limit. `belt` is refused with the distance.
9. Demolish a mine. The deposit stays, with its remaining amount, and can be mined again.
10. With one mine and the reduced base income, confirm the opening game is still playable at `speed 1`.
11. `npm run typecheck` passes.

## Open questions

- The expansion decision (reveal more map, or outposts). This slice's real design depends on it.
- Should base income fall to zero over time, or stay as a floor?
- What does the fabricator do?
- Can deposits be surveyed or prospected with a command, or are they all visible?
- Do deposits regrow? Default: no.
