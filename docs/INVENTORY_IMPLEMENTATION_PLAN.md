# MEGANOTRPG Inventory Implementation Plan

> Status: **CANONICAL IMPLEMENTATION ROADMAP**
>
> Branch: `dev`
>
> Product contract: `docs/INVENTORY_PRODUCT_CONTRACT.md`
>
> Current checkpoint: **Stages 1–5 complete. Stage 6 is next: authoritative spatial placement + mobile inventory UX.**
>
> This file defines implementation order and completion boundaries. It does not by itself prove that a stage is implemented. Audits must verify source, live Supabase state where relevant, and real runtime behavior before changing a stage to complete.

The final inventory target is a physical, tactile inventory system built on Cheburashka rather than a flat list. Items exist in real holders, bags open into their own grids, large items use authored shapes, two hand slots are always available, extra external carry slots are generic 1×1 cells with no anatomical semantics, currency remains physical items, shared scene loot uses surfaces, trade is a dedicated two-party chat block, and Voss/GM authoring can create new item footprints without inventing a second inventory engine.

## Stage status

| Stage | Status | Name |
|---|---|---|
| 1 | ✅ COMPLETE | Cheburashka integrity/runtime closure |
| 2 | ✅ COMPLETE | Item lifecycle: use, consume, charges, recharge |
| 3 | ✅ COMPLETE | Stack/instance state foundation |
| 4 | ✅ COMPLETE | Nested holders / container tree |
| 5 | ✅ COMPLETE | Physical item definition + authoring language |
| 6 | ⬜ TODO | Spatial runtime + mobile inventory UX |
| 7 | ⬜ TODO | Weight, load and specialized capacity |
| 8 | ⬜ TODO | Persistent world storage, chests and stashes |
| 9 | ⬜ TODO | Chats/scenes + shared Surfaces |
| 10 | ⬜ TODO | Dedicated Trade block |
| 11 | ⬜ TODO | Chasovoy adoption + legacy inventory migration |
| 12 | ⬜ TODO | Final security/concurrency/E2E certification |

There are **12 stages total**. Five are complete; seven remain.

---

## Stage 1 — Cheburashka integrity/runtime closure ✅

Already complete.

Purpose:
- seal direct authenticated inventory writes;
- make canonical inventory RPCs the mutation boundary;
- preserve version checks and definition provenance.

Do not redo this stage unless a real defect is found.

## Stage 2 — Item lifecycle ✅

Already complete.

Purpose:
- use/consume lifecycle;
- quantity consumption;
- charges;
- recharge metadata and recovery;
- UI/runtime synchronization.

Do not redo this stage unless a real defect is found.

## Stage 3 — Stack/instance state foundation ✅

Already complete as infrastructure.

Important product clarification added later:
- the runtime supports stacks, but **most final items should be instances**;
- stacking is a rare physical-packing exception, not a generic convenience;
- semantic category such as `ingredient` never decides stacking by itself.

Examples:
- healing potion -> instance;
- scroll -> instance;
- coins -> bulk stack;
- arrows/bolts/bullets -> bulk stack;
- ordinary homogeneous herbs/powders -> bulk stack;
- ore chunk / ingot / whole crystal / hide / horn -> instance.

Do not remove the Stage 3 stack infrastructure; constrain its authored use through Stage 5 definitions.

## Stage 4 — Nested holders / container tree ✅

Already complete.

Purpose:
- nested physical containers;
- holder relationships;
- cycle/depth protection;
- full-container subtree transfer;
- move command and hierarchical browsing foundation.

Stage 5+ must extend this model rather than creating a parallel inventory tree.

---

# Stage 5 — Physical item definition + authoring language

This stage defines what a physical item **is** before the runtime starts arranging it.

### Stage 5 completion ✅

Implemented in `dev` and live Supabase:
- canonical validated `inventory_profile` with instance-first packing;
- strict Chasovoy item authoring v2 for campaign item create/revise;
- starter physical item presets and a manual GM shape editor;
- immutable system library of ordinary container sizes;
- concrete instance naming for narrative placement without anatomical carry slots;
- Voss create/revise flow for unusual or magical campaign items;
- geometry-only AI revisions preserve existing item mechanics;
- container logical dimensions remain independent from future UI viewport scale;
- existing Chasovoy items were adopted into the profile contract;
- legacy singleton stacks were safely normalized, while ambiguous quantity>1 stacks were preserved for Stage 11 review.

Live migrations:
- `20260915182537_cheburashka_stage5_inventory_profile_foundation`;
- `20260915184110_cheburashka_stage5_complete_authoring_library`.

Voss inventory authoring policy is live in `voss-agent v32`.

Full historical inventory adoption remains Stage 11. Final security/concurrency/E2E certification remains Stage 12.

### 5.1 Canonical inventory profile in Chasovoy

Reusable item definitions need a structured non-CE inventory profile equivalent to:

```text
semantic_role
packing_mode: instance | bulk_stack
footprint_mode: compact_1x1 | shape
shape_mask
shape_width
shape_height
rotatable
stack_max
physical_dimensions_cm
weight_per_unit
base_value_cp
container_profile?
external_carry_slots?
specialized_capacity?
```

Not every field is required for every item.

This metadata is descriptive inventory state. It is not Character Engine executable mechanics.

### 5.2 Shape scale

For shaped objects, one logical shape cell uses roughly **5 cm of linear real-world size as an authoring guide**.

This is deliberately approximate. The grid models useful packing shape, not exact 3D geometry.

Examples:
- small potion: compact 1×1, not a shape;
- scroll: compact 1×1, not a shape;
- dagger/sword/axe/shield/bow/spear: authored shape;
- a spear may simply be too long to fit any normal bag.

### 5.3 Default instance law

Default:
```text
packing_mode = instance
```

Only obvious fungible bulk quantities become stacks.

A stack means individual units intentionally lose identity.

Canonical stack candidates:
- coins by denomination;
- arrows;
- bolts;
- bullets / uniform ammunition;
- homogeneous herbs, seeds, powders and similar bulk ingredients.

Canonical non-stack examples:
- potions;
- scrolls;
- weapons;
- armor;
- tools;
- books;
- torches;
- rope;
- ore chunks;
- ingots;
- whole crystals;
- hides;
- horns;
- bones;
- monster organs;
- named/rare/magical components.

If authoring is ambiguous, choose **instance**.

### 5.4 Specialized capacities

A specialized container may store a bulk resource more efficiently without changing its global stack semantics.

Canonical example:
- ordinary arrow bundle: guidance around 20 per 1×1 bulk stack;
- quiver: specialized arrow capacity up to 50.

The same pattern may later apply to bolt cases, ammunition pouches, coin purses, etc.

### 5.5 Containers as items

Bags are not inventory expansions.

A backpack, pouch, coin purse, chest or bag is a real item with its own holder/grid profile.

Definitions may describe:
- internal grid dimensions;
- whether nested containers are allowed;
- optional specialized capacity;
- number of generic external carry slots the item provides.

No anatomical slot names are required.

### 5.6 Generic carry slots and hands

The final model has:
- **two permanent 1×1 hand slots** for every character;
- **N generic external 1×1 carry slots** when equipment/items provide them.

Do not model:
- back;
- hip;
- shoulder;
- left/right belt anatomy;
- where exactly an externally carried item hangs.

Narration decides that. The application only knows that an external carry cell exists.

### 5.7 Manual GM physical editor

GM authoring supports:
- toggle shape cells for ordinary non-container items;
- preview bounds and rotate the authored shape;
- set compact 1×1 vs shape;
- set instance vs explicit bulk stack and `stack_max`;
- choose ordinary containers from the prepared container library;
- use the deliberately simple 1×1 container for a minimal custom bag;
- save the profile into the Chasovoy item definition.

Arbitrary internal container width/height is not a normal GM form field. Non-standard or magical interior geometry is authored through Voss.

### 5.8 AI-assisted item authoring

Voss creates item drafts using the same inventory profile and may revise an existing campaign item definition identified by the GM.

For unusual items or magical containers Voss may:
- infer approximate physical dimensions;
- draft a shape mask;
- classify instance vs bulk stack;
- author a non-standard internal grid from the GM's physical description;
- preserve existing mechanics during geometry-only revision;
- create a campaign variant instead of mutating an immutable system definition.

Voss never infers stackability merely from semantic category and never stores ordinary bonuses, resistances or curses inside `container_profile`.

### Stage 5 completion gate — PASSED ✅

- profile schema exists and is validated;
- Chasovoy persists/revises it through strict item-authoring v2;
- GM can manually edit ordinary item profiles/shapes and select prepared containers;
- Voss item drafts/revisions emit the same profile contract;
- starter ordinary item and container libraries exist;
- migration preserves ambiguous legacy state rather than guessing;
- regression tests lock physical classification, container authoring and AI revision rules.

---

# Stage 6 — Spatial runtime + mobile inventory UX

This stage turns Stage 5 definitions into real placement.

### 6.1 Authoritative grid placement

Cheburashka must own:
- holder;
- grid x/y;
- rotation;
- current item version.

Server/runtime validation rejects:
- out-of-bounds shape;
- overlap;
- stale placement;
- illegal holder transition.

The UI may preview placement, but CSS is never canonical truth.

### 6.2 Drag-and-drop physical interaction

Every movable item should be draggable with a finger.

While dragging:
- on a scene/surface it remains a physical item;
- above a bag grid, its real shape appears over the grid;
- cells outside the bag visibly remain outside;
- invalid overlap/drop is shown;
- valid drop commits a Cheburashka move;
- invalid drop restores the previous position.

Large items do not need an artificial "too long" flag if their shape simply does not fit.

### 6.3 Carry strip

Inventory has a persistent carry strip.

It includes:
- hand 1;
- visible carried bags/containers;
- generic external carry cells currently available;
- hand 2.

Hands are always present.

Optional empty external cells need not be given anatomical names.

### 6.4 Bags open one at a time

Tap a bag/pouch/purse/backpack:
- it becomes the active opened container;
- its grid appears;
- another bag tap closes/replaces the current opened view;
- a nested bag may be opened from inside the current bag;
- Back returns to the parent container.

This should feel like opening real bags, not switching abstract inventory pages.

### 6.5 Representation depends on destination

The same item may render:
- with its full shape in a grid;
- as a simple 1×1 item in a hand;
- as a simple 1×1 item in a generic external carry cell;
- as equipped in the equipment surface.

No duplicate item instance is created.

### 6.6 Equipment bridge

Equipment remains a distinct view/state.

Inventory must support:
- drag/move between carried storage and equipment where rules allow;
- unequip only when a real destination is chosen;
- no hidden ghost copy left in the bag.

Do not add tactical action-economy simulation merely because item location is now known.

### 6.7 Snake integration

Snake should expose context actions such as:
- inspect;
- open container;
- rotate;
- move to another bag;
- move to hand;
- move to external carry;
- equip/unequip;
- later place on surface / trade.

### Stage 6 complete when

- grid placement/collision/rotation are server-authoritative;
- mobile drag works;
- carry strip exists;
- two hands always exist;
- generic external cells work;
- bags open sequentially and nested bags work;
- equipment transitions use the same canonical item.

---

# Stage 7 — Weight, load and specialized capacity

Spatial packing already prevents "infinite treasure because weight allows it". Weight is a second independent constraint.

Implement:
- per-item weight;
- bulk stack quantity × unit weight;
- container contents contributing to carried weight;
- coin/ammunition/material stack weight;
- derived carried total;
- CE/encumbrance integration only where the existing game rules actually require it.

Do not create a parallel weight ledger.

Specialized capacity rules also become authoritative here:
- quiver max 50 arrows;
- other purpose-built capacity definitions when authored.

Space and weight remain independent:
- enough strength but no room -> cannot pack it;
- enough room but too much weight -> overloaded according to campaign rules.

### Stage 7 complete when

- totals are deterministic from canonical items;
- nested container weight is correct;
- bulk resources are handled correctly;
- specialized capacity cannot be bypassed by concurrent writes;
- CE consumes only a projection, not inventory ownership.

---

# Stage 8 — Persistent world storage, chests and stashes

The inventory design should create a real reason to leave possessions behind.

Implement persistent world storage:
- chests;
- crates;
- caches/stashes;
- other location-bound containers.

A stash is not a second player inventory. It is a persistent world holder associated with a location/world context.

Player/GM should be able to:
- move items from carried inventory into a world container;
- return later and find the same items;
- create a stash where permissions/world rules allow;
- leave oversized/valuable loot instead of magically carrying the entire hoard.

Larisa owns location/world placement facts; Cheburashka owns the physical items/holder contents.

### Stage 8 complete when

- world containers persist across sessions;
- stash ownership/visibility is explicit;
- moving a container does not duplicate its contents;
- location changes do not orphan items;
- permissions are server-authoritative.

---

# Stage 9 — Chats/scenes + shared Surfaces

This stage closes the chat/scene debt needed for shared physical loot.

### 9.1 Game scenes/chats

Implement:
- game chat/scene entity;
- character participants;
- relation to location/scene;
- moving characters between chats/scenes when fiction moves them.

### 9.2 Surface block

GM can create/open a **Surface** block in the chat.

A Surface may fictionally represent:
- floor;
- table;
- loot pile;
- altar;
- anything exposed in the scene.

The application does not need separate surface types for those narratives.

GM can:
- place loot/items on it;
- grant access to all scene characters or selected characters;
- keep it GM-only until revealed.

### 9.3 Inventory integration

Accessible surfaces appear beside/in the inventory as external sources/destinations.

A player can drag:
```text
surface -> bag / hand / carry
bag / hand / carry -> surface
```

### 9.4 "Who got it first"

Shared loot requires atomic ownership.

If two players grab the same item:
- first valid server commit wins;
- second gets stable stale/already-taken result;
- realtime refresh removes/locks the item for everyone else.

Realtime is notification, not ownership authority.

### Stage 9 complete when

- scene membership changes access correctly;
- Surface access rules work;
- inventory sees only accessible surfaces;
- atomic first-take behavior is proven under concurrency;
- no duplicate item can be produced.

---

# Stage 10 — Dedicated Trade block

Trade is not a Surface and not ordinary chat commands.

A chat contains a dedicated two-party Trade block.

Allowed participants:
- PC ↔ NPC;
- PC ↔ PC.

For NPC, GM acts as that side.

Implement:
- explicit two sides;
- scoped inventory visibility;
- merchant assortment / selected containers / explicitly visible items;
- "Хочу это" interest marker;
- central offer area;
- trade-scoped discussion thread;
- offer revision;
- acceptance A/B;
- any offer mutation resets both acceptances;
- atomic final exchange.

Items in the offer remain owned by their current owner until commit.

Physical currency is transferred as normal inventory items.

Base item value is advisory only. GM can accept barter, discounts, favors or nonsense if the scene demands it.

### Stage 10 complete when

- no private NPC/player inventory leaks;
- both sides accept the same revision;
- stale/moved items invalidate the offer;
- all transfers commit or none commit;
- trade history remains inspectable.

---

# Stage 11 — Chasovoy adoption + legacy inventory migration

By this point the final physical model is known and must become the normal catalog path.

Implement:
- canonical item definitions for ordinary reusable inventory content;
- shapes/profiles for common weapons, armor, bags, tools, ammo and currency;
- container profiles;
- weights;
- reference values where useful;
- bulk/instance classification;
- migration/adoption of reusable legacy inventory rows.

Do not force narrative junk into reusable definitions when no reuse is needed.

Legacy safety:
- preserve concrete item identity;
- preserve state/provenance;
- never silently merge ambiguous rows into stacks;
- never invent a physical profile that loses meaningful data.

### Stage 11 complete when

- new reusable items issue from Chasovoy with canonical physical metadata;
- existing reusable catalog items are migrated/adopted;
- old regex/name guessing is no longer the canonical source;
- remaining unlinked items are intentional narrative instances.

---

# Stage 12 — Final security/concurrency/E2E certification

Final certification is against the real system, not source inspection alone.

Required areas:
- DB constraints;
- RLS;
- canonical RPC permissions;
- expected-version behavior;
- holder cycles/depth;
- grid collision and rotations;
- bulk stack limits;
- specialized capacity;
- nested transfer;
- world stash persistence;
- Surface concurrent take;
- Trade concurrent mutation/acceptance;
- player/GM/owner authority;
- "Только я" privacy boundaries;
- Snake action routing;
- UI 1.0 mobile drag/tap flows;
- real Supabase behavior;
- E2E for common player and GM scenarios.

No stage is READY merely because a React screen exists.

### Stage 12 complete when

- all critical invariants are demonstrated against the live/test database;
- concurrency tests prove no duplication/lost ownership;
- E2E covers the intended mobile flows;
- no legacy inventory path can bypass Cheburashka;
- the audit records known non-critical debt explicitly.

---

# Final target summary

The finished inventory should behave like this:

1. Character always has two 1×1 hand cells.
2. Carried bags/containers are real items shown near the hands.
3. Extra external carrying is represented only as generic 1×1 cells; narration decides where the item hangs.
4. Tapping a bag opens that bag's own grid; bags do not enlarge one global inventory.
5. Small discrete items such as potions/scrolls may be 1×1 but remain separate instances.
6. Only clearly homogeneous bulk resources use stacks.
7. Large items use detailed shape masks and may simply not fit a bag.
8. Dragging shows the real shape over a grid and refuses physically invalid drops.
9. Items too large for bags can still be carried in hands or available generic external carry cells.
10. Coins are physical item stacks, not an abstract wallet.
11. Weight is derived from the same physical items.
12. Chests/stashes/world storage are persistent physical holders.
13. GM can expose scene loot through one Surface block with selected/all-character access.
14. Shared Surface items are single canonical objects; first successful take wins.
15. Trade is a separate two-party block with interest marking, negotiation, same-revision double acceptance and atomic exchange.
16. Voss/GM can author new items, including custom shapes, through the same Chasovoy inventory profile rather than inventing special cases.

The intended complexity is **physical clarity**, not simulation for its own sake.
