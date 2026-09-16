# MEGANOTRPG Inventory Implementation Plan

> Status: **CANONICAL IMPLEMENTATION ROADMAP**
>
> Branch: `dev`
>
> Product contract: `docs/INVENTORY_PRODUCT_CONTRACT.md`
>
> Current checkpoint: **Stages 1–9 complete. Stage 10 is next: dedicated Trade block.**
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
| 6 | ✅ COMPLETE | Spatial runtime + mobile inventory UX |
| 7 | ✅ COMPLETE | Weight, load and specialized capacity |
| 8 | ✅ COMPLETE | Persistent world storage, chests and stashes |
| 9 | ✅ COMPLETE | Chats/scenes + shared Surfaces |
| 10 | ⬜ TODO | Dedicated Trade block |
| 11 | ⬜ TODO | Chasovoy adoption + legacy inventory migration |
| 12 | ⬜ TODO | Final security/concurrency/E2E certification |

There are **12 stages total**. Nine are complete; three remain.

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

### Stage 6 completion ✅

Implemented in `dev` and live Supabase:
- Cheburashka owns canonical `placement_kind`, grid x/y, rotation and optimistic item version;
- `move_inventory_item_v2` validates bounds, exact authored masks, overlap, holder legality, nesting, two hand slots and generic external carry capacity under a per-character transaction lock;
- table constraints prevent invalid hand indexes and prevent one instance from being both equipped and physically carried;
- old production holder-only moves remain temporarily readable as `legacy` placement instead of breaking live `main`;
- cross-character transfer resets the transferred root instance to physical root while preserving spatial placement inside a transferred container subtree;
- UI 1.0 uses a fixed 46px inventory cell and approximately six visible columns; larger logical grids scroll/pan rather than shrinking cells;
- drag-and-drop previews the real shape mask, reports invalid drops and commits only through Cheburashka;
- the carry strip always exposes two hands, carried containers and currently available generic external cells;
- one container is open at a time, nested containers can be opened, Back returns to the parent, and drag targets include parent/root destinations;
- equipment uses the same canonical item instance; equipping clears physical placement atomically, while occupied equipment slots are rejected until the old item receives a real destination;
- Snake exposes inspect/open/rotate/move-to-bag/move-to-hand/move-to-external/equip/unequip actions backed by the same spatial commands as drag.
- post-implementation integrity audit closed direct create/update equipment bypasses, destinationless unequip, external-capacity orphaning, definition/profile invalidation of placed items, equipment cross-slot conflicts, drag/long-press races and sparse-shape hit-testing;
- dev reads physical geometry through a Cheburashka-safe profile projection so a player sees the same physical shape the server validates without requiring access to hidden Chasovoy prose/mechanics;
- rejected spatial/equipment mutations force a fresh inventory reload, so stale optimistic state returns to canonical server truth instead of lingering on screen.

Live migrations:
- `20260916044954_cheburashka_stage6_spatial_inventory`;
- `20260916045859_cheburashka_stage6_equipment_transfer_bridge`;
- `20260916050604_cheburashka_stage6_placement_constraint_hardening`;
- `20260916052417_cheburashka_stage6_integrity_closure`;
- `20260916053336_cheburashka_stage6_profile_projection`;
- `20260916053628_cheburashka_stage6_equipment_state_guard`;
- `20260916053859_cheburashka_stage6_move_destination_guard`.

The transitional `legacy` placement and authenticated v1 mutation RPCs remain only because the currently deployed `main` still uses them against the shared Supabase project. New `dev` code uses guarded v2/v3 paths. Legacy RPC retirement is deferred until production promotion/final Stage 12 certification so Stage 6 does not break the live client while being developed. Full historical Chasovoy adoption remains Stage 11, and final cross-system security/concurrency/E2E certification remains Stage 12.

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

### Stage 6 completion gate — PASSED ✅

- grid placement/collision/rotation are server-authoritative;
- mobile pointer drag uses the same Cheburashka move command as Snake;
- carry strip exists with two permanent hands;
- generic external cells derive from canonical item profiles;
- bags open sequentially, large grids pan/scroll at fixed cell size, and nested Back works;
- grid and drag previews render authored shape masks rather than bounding-box truth;
- equipment transitions keep one canonical item, reject implicit displacement and require a real destination for unequip;
- external carry capacity cannot be reduced while it would orphan occupied external cells;
- definition/revision or container-profile changes cannot invalidate an already committed placement without the transaction failing;
- sparse shape masks are both collision truth and pointer hit-test truth;
- physical profiles are projected through Cheburashka without leaking hidden definition content;
- rollback smoke and regression tests cover the spatial invariants.

---

# Stage 7 — Weight, load and specialized capacity ✅

Stage 7 is complete in `dev` and live Supabase.

Implemented law:
- kilograms are the canonical inventory mass unit;
- base carrying capacity is resolved by CE as **Strength × 6.8 kg**;
- `carrying.capacityKg` is a normal CE numeric target, so items/features/classes/effects may add or otherwise modify carrying capacity without a one-off inventory exception;
- Cheburashka derives current carried mass directly from canonical item instances;
- stack mass is `quantity × weight_per_unit`;
- nested container contents contribute exactly once because ownership remains on the same character inventory tree;
- an unknown item mass remains explicit and never silently becomes zero;
- UI 1.0 shows known carried kg versus CE-resolved carrying capacity and marks overload without inventing movement/action penalties;
- GM physical-profile authoring and Voss use `weight_per_unit` in kg;
- legacy non-null item weights were migrated once from old D&D-facing pound values to kilograms with an audit marker;
- current Chasovoy item definitions with legacy top-level weights were advanced through immutable revisions into kg data where applicable;
- specialized capacities such as quiver arrow limits are authoritative on the server with deferred validation under the per-character inventory lock;
- client placement preflight mirrors the same specialized-capacity rule for immediate feedback.

Live migration:
- `20260916090000_cheburashka_stage7_weight_capacity`.

### Stage 7 completion gate — PASSED

- totals are deterministic from canonical items;
- nested container weight is correct;
- bulk resources multiply unit mass by quantity;
- unknown mass remains visible as incomplete load data;
- specialized capacity cannot be bypassed by ordinary/concurrent inventory writes;
- CE receives only the carrying modifier target and Cheburashka load projection, never inventory ownership;
- Stage 7 has dedicated regression coverage for Strength-based kg capacity, CE carrying buffs, nested/stack load, unknown mass and quiver overflow.

### Explicit rules boundary

Stage 7 reports **overload state** but does not silently apply speed penalties, action restrictions or other tactical encumbrance consequences. Those effects require an explicit campaign/rules mechanic and GM-facing authoring rather than being guessed by inventory UI.

### Technical debt after Stage 7

The new `carrying.capacityKg` target is supported by CE, MechanicsBuilder and the Voss mechanics compiler. A broader **CE buffs/effects authoring pass** is still owed: normalize how arbitrary persistent/temporary numeric buffs are created, displayed, explained and managed across items, features, classes and GM effects, instead of expanding target-specific UI one field at a time.

---

# Stage 8 — Persistent world storage, chests and stashes ✅

Stage 8 is complete in `dev` and live Supabase.

Implemented law:
- persistent world storage is represented by `world_storages`, which stores Larisa-owned location, visibility, access and lifecycle facts;
- the physical storage root and every contained object remain ordinary Cheburashka item instances in the canonical inventory table;
- there is no parallel `world_inventory_items` ledger and no copied item truth;
- exactly one owner scope is valid for a physical item: character-owned or world-storage-owned;
- moving an instance between a character and world storage preserves the same row identity whenever the whole instance moves;
- moving a container transfers its entire nested subtree to the new owner scope without changing descendant identities or holder relationships;
- bulk-stack partial moves split only quantity while preserving total quantity;
- every world-storage item must remain connected to that storage's canonical root container;
- world-storage root containers cannot occupy hands/external carry or equipment state;
- location/owner campaign consistency is server-authoritative;
- GM may create, edit, move and archive world storage;
- a player may create/manage only an owner-only stash for their active character at the character's current location;
- shared/player access is validated against campaign membership, location visibility, character position and storage policy on the server;
- storage metadata uses optimistic versions and command receipts;
- inventory store/take operations lock both the character inventory scope and world-storage scope;
- Larisa metadata and the physical Cheburashka root container keep name/description synchronized;
- UI 1.0 renders storages inside location detail rather than as a second abstract inventory screen;
- Snake can inspect storage, put/take items, edit policy where authorized, move it as GM and archive it;
- the character inventory exposes accessible current-location storage through the same Cheburashka store command.

Live migrations:
- `20260916070000_cheburashka_stage8_world_storage`;
- `20260916073000_cheburashka_stage8_integrity_closure`.

Stage 8 deliberately does **not** implement scene/chat loot Surfaces. Those remain Stage 9. A persistent chest in a location is durable world storage; a temporary/shared scene drop surface is a different interaction and must not be smuggled into this stage.

### Stage 8 completion gate — PASSED ✅

- world containers persist independently from character sessions;
- stash ownership, visibility and access policy are explicit;
- the same canonical item moves character ↔ world storage without a duplicate item ledger;
- nested container subtrees preserve identity across world-storage moves;
- partial bulk moves preserve total quantity;
- moving a world storage changes Larisa location facts without copying contents;
- location/storage/root consistency is protected by database constraints/deferred validation;
- permissions and character-at-location access are server-authoritative;
- character/world mutations use version checks, idempotent command receipts and shared advisory locks;
- authenticated-only RPC boundaries are used; `anon` cannot execute Stage 8 storage mutation/read helpers;
- UI/Snake expose the canonical operations rather than maintaining client-side storage truth;
- dedicated Stage 8 regression coverage and live rollback smoke verify the owner-scope, subtree and no-duplication invariants.

---

# Stage 9 — Chats/scenes + shared Surfaces ✅

Stage 9 is complete as a **mechanics/runtime stage** in `dev` and live Supabase.

This stage deliberately does **not** rebuild or redesign the chat UI. Existing chat/scene presentation is left alone. The implemented work is the canonical scene membership, Surface access, Cheburashka ownership and concurrency foundation that a later chat/interface pass may render.

### 9.1 Canonical game-scene membership

Implemented:
- existing `chat_rooms(room_type='scene')` remain the durable game-scene/history entity rather than inventing a second scene table;
- Larisa can create a game scene through `create_game_scene_v1`;
- `scene_participants` now represents **current physical scene membership**;
- one character can belong to only one current game scene at a time;
- moving a character to another scene atomically removes the old membership and may synchronize location/time from the destination scene;
- closing a scene removes current membership while preserving the room/message history;
- scene membership itself can grant the active character read/write participation according to room state, without making Realtime or React the authority.

### 9.2 Shared Surface state

Implemented:
- Larisa owns `scene_surfaces`: scene relation, name/description, access policy, lifecycle and optimistic version;
- access modes are `scene`, `selected` and `gm`;
- selected-character grants must refer to current participants of that scene;
- when a character leaves a scene, stale selected-Surface grants are removed atomically;
- deferred integrity validation rejects a final state where selected Surface grants point outside current scene membership;
- a Surface is independent from any chat message. Editing/deleting a message cannot create, own or destroy Surface loot.

### 9.3 Cheburashka Surface ownership

Cheburashka now has a third canonical physical owner scope:

```text
character
world storage
scene Surface
```

Exactly one owner scope is set for every physical item.

Implemented:
- `surface_id` is canonical ownership for exposed scene items;
- top-level Surface items use `placement_kind = surface`;
- containers placed on a Surface keep the same item row and their nested subtree keeps holder identity;
- a Surface is not a fake bag/root-container and has no duplicate `surface_inventory_items` ledger;
- GM may create a canonical item directly on an authorized Surface;
- an accessible character may place a carried item on a Surface;
- an accessible character may take a Surface item to root, bag grid, hand or generic external carry;
- whole-instance moves preserve item identity;
- partial bulk moves split quantity only;
- Surface ownership participates in holder-scope, definition/campaign and deferred tree-integrity checks.

### 9.4 First-take concurrency

Shared loot claim authority is fully server-side.

`take_inventory_item_from_surface_v1`:
- locks the character inventory scope and Surface scope;
- selects the source item `FOR UPDATE`;
- checks the expected item version;
- commits one canonical ownership move;
- returns stable `surface.item_already_taken` if the item has already left the Surface;
- returns stable `surface.item_stale` if the caller is acting on an obsolete Surface item revision;
- records an idempotent Cheburashka command receipt.

Therefore the first valid server commit wins. Realtime never chooses the winner.

### 9.5 Realtime/invalidation boundary

Surface mutations increment `scene_surfaces.version`.

`scene_surfaces`, selected access and scene participants are published for Supabase Realtime, and Larisa exposes a mechanics-only invalidation subscription.

Realtime means **refetch canonical state**. It is not an ownership lock and is not a substitute for the transaction.

Live migrations:
- `20260916090500_cheburashka_stage9_scene_surfaces`;
- `20260916091500_cheburashka_stage9_surface_membership_integrity`.

### Stage 9 completion gate — PASSED ✅

- current scene membership is canonical and a character cannot be in two active scene memberships;
- moving/leaving/closing scenes updates Surface access coherently;
- `scene / selected / gm` Surface access is server-authoritative;
- only accessible Surfaces are exposed by the Surface listing boundary;
- one canonical Cheburashka item moves character ↔ Surface with no duplicate item table;
- nested container subtrees preserve identity;
- partial stack moves conserve total quantity;
- first valid Surface take wins under a Surface transaction lock;
- second/stale attempts receive stable machine-readable outcomes;
- Realtime is invalidation only;
- dedicated Stage 9 regression tests and live rollback smoke prove same-instance movement, already-taken behavior and membership/access cleanup;
- **chat UI was intentionally not implemented or redesigned in Stage 9**.

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
