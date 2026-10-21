# Slice 1: Categories

**Goal.** Group room types into categories so the player can browse and highlight them. This changes discovery only. `build <type> -location <cell>` must work exactly as it does today.

**Status:** Built (typecheck and command output checked; the in-browser checklist below is still to run). **Depends on:** none.

## Scope

- Add a `category` to each room definition.
- `build` with no arguments lists the categories. `build <category>` lists the types in it.
- `view <category>` highlights every room in the category.
- `help` and Tab completion group by category.

Out of scope: any gameplay effect of categories, locked entries (Slice 5), tiers (Slice 2), and any new room type.

## Categories

Names are the typed forms. They must not collide with any room type name.

| Category | Typed as | Types today |
|---|---|---|
| Power | `power` | reactor |
| Life support | `life` | oxygen |
| Food | `food` | garden |
| Habitation | `habitat` | quarters, lounge |
| Industry | `industry` | (none yet) |
| Compute | `compute` | (none yet) |
| Defense | `defense` | (none yet) |
| Maintenance | `maint` | (none yet) |

The Command Hub has no category and is never listed by `build`.

## Behaviour

**`build` with no arguments** lists every category that has at least one buildable type, with the count of types:

```
> build
Categories:
  power     1 type
  life      1 type
  food      1 type
  habitat   2 types
Try: build <category>   or   build <type> -location <cell>
```

Empty categories are hidden until they contain something. (Open: show them greyed instead, so the player sees what is coming.)

**`build <category>`** lists the types in it, one per line: type, label, cost, power draw, radius if any:

```
> build habitat
  quarters  Quarters  20   draw 1
  lounge    Lounge    30   draw 2   radius 3
```

**`build <type> -location <cell>`** is unchanged, including every error message. `build` with a type but no `-location` still prints the existing usage error.

**Name resolution for the first positional argument of `build`:** if it matches a room type, it is a type. Otherwise if it matches a category, it lists that category. Otherwise print the existing `Unknown room type` error and also list the category names.

**`view <category>`** lights up every room in the category and dims everything else, exactly as `view <room type>` does. It lists the matching cells. If nothing of that category is built, print the same warning and clear the highlight as `view <room type>` does. `view reset` clears it. `inspect` focus keeps precedence.

**`help build`** mentions that a category can be given. `help` groups the command list as it does now; the grouping applies to room types where room types are listed.

**Tab completion.** After `build`, complete to category names and type names together. A prefix that is unique completes fully. A shared prefix completes to the common prefix, as today. After `view`, also complete category names.

## Design for growth

Categories will end up holding two or three Mk1 types each (DESIGN.md, "Variety within a category"), plus Mk3 types and possibly two Mk3 flavours. The data model and the `build <category>` listing must not assume one or two types per category: build the listing as a generic loop, with columns that stay readable at ten rows. Do not hard-code the Mk3 count per category anywhere.

## Human test checklist

1. Load the page. Type `build` and press Enter. You see four categories: power, life, food, habitat.
2. Type `build habitat`. You see quarters and lounge with costs.
3. Type `build power`. You see reactor only.
4. Type `build industry`. You get a clear message that the category is empty or not available yet (not a crash, not an unknown-type error).
5. Type `build reactor -l h5`. It builds exactly as before. Try the other forms from API.md (`-loc`, flag order swapped); they still work.
6. Type `build reactr`. You get the unknown-type error and a list of categories.
7. Type `build ` then press Tab. You see both category names and type names offered. Type `build ha` and press Tab: it completes to `habitat`.
8. Build a second quarters, then type `view habitat`. Quarters and lounge (if built) light up; everything else, including links, dims. The cells are listed.
9. Type `view life`. The oxygen plant lights up. Type `view defense` (nothing built): you get the warning and the highlight clears.
10. Type `view reset`. The highlight clears.
11. Type `inspect h6`, then `view habitat`. The inspect focus keeps precedence until you clear it.
12. Run `npm run typecheck`. It passes.

## Open questions

- Show empty categories greyed, or hide them?
- Should `rooms` group its list by category? Not required by this slice.
