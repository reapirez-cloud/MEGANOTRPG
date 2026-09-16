# MEGANOTRPG Inventory Product Contract

> Status: **APPROVED PRODUCT DIRECTION — NOT A CLAIM OF IMPLEMENTATION**
>
> Audience: humans and AI agents auditing, designing or implementing inventory, equipment, loot surfaces, trade, item definitions, carrying, weight or scene/chat item interaction.
>
> Branch: active implementation belongs on `dev`.
>
> Current implementation checkpoint: Inventory Stages 1–12 are complete. Cheburashka owns canonical physical item state/exchange, Chasovoy owns reusable physical definitions, Larisa owns world/scene access facts, and GENA owns dedicated Trade session/revision/history orchestration. Final certification is recorded in `docs/INVENTORY_STAGE12_CERTIFICATION.md`.

This document is the canonical product intent for MEGANOTRPG inventory UX. Audits must compare the current implementation to this contract. Do not replace it with a generic RPG inventory pattern merely because that pattern is easier or more familiar.

## 1. Product intent

MEGANOT inventory should feel like the character is physically carrying, attaching, opening, moving, dropping and exchanging real things.

It is **not** intended to be:

- a flat six-column item gallery;
- an abstract MMO bag with every object represented identically;
- a separate wallet disconnected from physical coins;
- a spreadsheet that automatically summarizes everything for the player;
- a tactical simulator that overrides the GM;
- a collection of special-case UIs that duplicate Cheburashka state.

The intended experience is deliberately tactile and somewhat manual. D&D is a slower tabletop game; opening containers and managing where possessions physically sit is part of the desired play rather than a problem to optimize away.

Avoid complexity for complexity's sake. Add a rule only when it represents a real product distinction.

## 2. Canonical ownership

The named engine boundaries remain unchanged:

- **Cheburashka** owns concrete item instances, quantities, stack/instance state, holder relationships, placement state, charges, equipment state and transfers.
- **Chasovoy** owns reusable item/container definitions: authored shape, physical tags, weight, base value, holder capabilities and definition revisions.
- **Shapoklyak** owns PC/NPC identity and character state, not the inventory rows.
- **Larisa** owns scenes/locations and future scene membership/placement facts.
- **Snake** owns contextual interaction presentation and dispatch, never canonical inventory state.
- **Oracle** routes GM inventory/world mutations to the appropriate owner.
- **GENA** may orchestrate normal gameplay actions where session/history correlation is actually needed.

Do not create a second inventory truth in React, chat, trade UI or a scene component.

## 3. One physical item, different presentation by holder mode

The application decides whether an item is spatial Tetris or a simple 1×1 representation from its current holder/placement mode, not from separate copies of the item.

Target holder/placement modes:

```text
grid
carry
equipment
surface
```

A character always has two permanent 1×1 hand cells. Additional external carry cells are generic 1×1 cells supplied by carried/equipped gear where appropriate.

Do not model anatomical destinations such as back, hip or shoulder. If the GM says the spear is tied behind the character's back, that is narrative truth; the application only needs to know that the spear occupies an available external carry cell.

Trade is **not** a holder mode. A trade offer references existing items until commit; ownership changes only when the trade transaction succeeds.

The same dagger may therefore be:

- a shaped object in a bag grid;
- a simple 1×1 object in a hand;
- a simple 1×1 object in a generic external carry cell;
- an equipped item;
- an item on a scene Surface.

It remains the same Cheburashka item instance.

## 4. Grid holders: spatial inventory

Backpacks, bags, chests and similar storage use a cell grid.

An item definition may expose a shape mask rather than only `width × height`.

Examples:

```text
Dagger
███

Sword
█████
  █
  █

Shield
 ██ 
████
████
 ██
```

A placed grid item needs placement state equivalent to:

```text
grid_x
grid_y
rotation
```

Rotation may be 0/90/180/270 when the definition permits it.

Authoritative validation must reject:

- shape outside holder bounds;
- overlap with another item;
- invalid rotation;
- an item physically incompatible with the holder;
- stale/concurrent placement based on an old inventory version.

Collision and placement cannot be CSS-only truth.

## 5. Geometry is the default packing rule

For ordinary grid containers, **geometry is the primary rule**.

If a spear, bow or large shield is too large for a bag, its shape should visibly extend outside the grid and the drop is invalid. Do not add a redundant global rule saying "spears cannot go in bags" when the spatial model already makes that impossible.

Conversely, if a deliberately huge weapon bag is authored with a grid large enough to contain the item, the system may allow it.

Specialized containers may still have explicit content rules where they add real product value.

Canonical example:
- a quiver is a specialized ammunition container and may provide capacity for up to 50 arrows.

Avoid broad item-name heuristics and avoid anatomical carry taxonomies. Compatibility metadata should exist only for meaningful special-purpose storage, not as a second simulation layered over the grid.

## 6. Hands, bags and generic external carry

The carried-inventory surface has three simple concepts:

1. **Two hands** — always available 1×1 cells.
2. **Real bags/containers** — backpack, pouch, purse, chest, etc.; tapping one opens its own grid.
3. **Generic external carry cells** — optional 1×1 cells provided by gear/content definitions.

External carry cells have no anatomical meaning. The application does not care whether the GM narrates an attached item as hanging from a belt, shoulder, back, pack frame or somewhere anatomically ridiculous.

A bag may provide:
- its own internal grid;
- zero or more generic external 1×1 carry cells;
- an optional specialized capacity such as a quiver's arrow capacity.

The final inventory should show the two hand cells alongside carried bags and available external carry cells so an oversized item can be moved from the ground directly into a hand or external carry cell without forcing it into a bag.

## 7. Equipment is distinct from carried storage

Equipment remains a separate placement/view mode from carried inventory.

Examples include armor slots, rings, weapons and other actually equipped positions.

The two permanent hand cells belong to carried-item interaction and remain visible near bags; they are not an excuse to duplicate the equipment model.

An equipped item should not simultaneously occupy bag grid space.

Unequipping must have a real destination:
- a bag grid where the item fits;
- one of the two hand cells;
- an available generic external carry cell;
- an accessible Surface.

If no destination exists, cancel rather than making the item exist nowhere.

Do not infer combat speed, action economy, quick-draw rules or anatomical placement from where a carried item is stored. Those remain normal tabletop/GM adjudication unless a separate canonical game mechanic explicitly owns them.

## 8. Containers remain physical, nestable and individually openable

Stage 4 established canonical nested holder relationships. Preserve that foundation.

A bag is a real item with its own contents. It does not add abstract slots to one global inventory.

Target interaction:
- the two hands remain visible beside carried bags;
- tap a backpack -> open the backpack grid;
- tap a coin purse -> replace the open view with the coin purse;
- tap another carried bag -> open that one instead;
- tap a nested pouch inside the current bag -> descend into it;
- Back returns to the parent holder.

Only the active container needs its grid expanded at one time.

Holder cycles remain forbidden.

The final spatial model extends the existing holder tree; it does not replace it with a second parallel inventory structure.

Animation is presentation. The canonical relationship remains Cheburashka state.

## Stage 6 implemented spatial law

The implemented carried-inventory runtime follows these invariants:

- Cheburashka stores canonical placement as root, grid, hand or external carry; a temporary `legacy` holder state exists only for the still-running pre-spatial production client.
- Grid placement is committed only through the versioned Cheburashka spatial move RPC and is checked under a character-level transaction lock.
- Exact authored shape-mask cells determine collision. A rectangular CSS box is never the collision model.
- The rendered cell size is fixed by UI presentation. Current UI 1.0 uses a 46px cell and a viewport of roughly six visible columns; logical container width/height only changes the scrollable plane.
- Both hand cells always exist and accept the same item instance in compact 1×1 presentation.
- Generic external carry cells are derived from canonical item profiles and never receive anatomical names.
- A valid drag commits the same domain command exposed by Snake. An invalid drag changes no canonical state.
- One bag is expanded at a time. Nested bags use the same holder tree and Back returns to the parent.
- Equipping a carried item clears its physical carried placement atomically. If the equipment slot is already occupied, the new equip is rejected until the existing equipped item is moved to a real hand/bag/external destination.
- Cross-character transfer removes source-character hand/grid/external placement from the transferred root item while retaining valid placement of descendants inside a transferred container subtree.
- Unequip is a spatial transition, not a boolean convenience toggle. An equipped item may move only to a real hand, valid bag grid or available external carry cell; abstract root/free state is not an unequip destination.
- Generic create/update authoring cannot change equipment state. Equipment transitions use the dedicated Cheburashka equipment/spatial commands so slot conflicts and physical destination rules cannot be bypassed by an editor.
- Final database state is revalidated after mutations. Changing an item definition/revision, item shape, holder category/grid, character ownership or carry-capacity provider must fail if it would invalidate an already placed item.
- External carry capacity is a character-level physical invariant. A provider cannot be moved/changed/removed while doing so would orphan an occupied external slot.
- Same-slot equipment conflicts and the `two_hands` versus `main_hand`/`off_hand` conflict are forbidden in final canonical state, not merely discouraged by UI.
- Client placement preview consumes a Cheburashka-safe physical-profile projection. Physical geometry may be shown to a player who can view the item without leaking hidden Chasovoy definition prose or mechanics.
- Sparse authored masks are both collision truth and pointer hit-test truth. Transparent cells inside a shape's bounding rectangle must not block interaction with another item.
- Rejected spatial/equipment commands refresh the client from canonical server state. Optimistic presentation never becomes a second inventory owner.

## 9. Currency is ordinary inventory

Do **not** create a separate abstract player wallet merely to model coins.

Coins are normal physical items/stacks owned by Cheburashka and may:

- sit in a pouch, chest, bag or scene surface;
- be transferred or stolen;
- participate in trade;
- have weight;
- occupy space/stack capacity.

The UI is **not required** to aggregate or summarize all money automatically. It is acceptable, and intentionally tactile, for a player to open a pouch to see what is actually inside.

If a future summary is added, it must be a derived read model, never a second currency ledger.

Canonical money definitions may still use a `currency` category/tag for filtering and rules, but that must not turn them into non-physical state.

## 9A. Stacking is a physical packing rule, not an item category

The default is **instance**. Most items do not stack.

A stack is reserved for obvious fungible bulk quantities where individual units intentionally lose identity: currency, ammunition and small homogeneous raw materials.

Semantic role and packing are separate axes. In particular:

| Example | Semantic role | Packing | Footprint | Default guidance |
|---|---|---|---|---|
| Малое лечебное зелье | consumable | instance | compact 1×1 | no stack |
| Свиток | consumable/reference | instance | compact 1×1 | no stack |
| Монеты одного номинала | currency | bulk stack | 1×1 | bounded stack; container may provide larger capacity |
| Стрелы | ammo | bulk stack | 1×1 | ordinary bundle ~20; quiver may carry 50 |
| Болты / пули | ammo | bulk stack | 1×1 | bounded type-specific stack |
| Обычная трава / листья / семена | ingredient | bulk stack | 1×1 | stack only while individual pieces are interchangeable |
| Порошок / соль / пыль / порох | ingredient/material | bulk stack | 1×1 | bulk material |
| Кусок руды / самородок | ingredient/material | instance | shape | **not stackable** merely because it is an ingredient |
| Измельчённая руда / минеральная пыль | ingredient/material | bulk stack | 1×1 | same semantic role, different physical packing |
| Слиток / крупный кристалл | ingredient/material | instance | shape | separate physical object |
| Рог / шкура / большая кость / орган / редкий клык | ingredient/material/trophy | instance | shape or compact 1×1 if genuinely tiny | preserve individual object |
| Редкий/магический вариант обычно массового ресурса | any | instance | appropriate | provenance/state overrides stacking |
| Оружие / броня / инструмент / контейнер | equipment/tool/container | instance | shape | never generic stacks |

The authoring question is not “is this an ingredient?”. It is:

> Would two units reasonably be treated as one homogeneous counted pile without losing meaningful physical identity?

If not, they are separate instances.

Examples that must remain distinct:

```text
лечебная трава          -> ingredient + bulk_stack
кусок железной руды     -> ingredient + instance
железная пыль           -> ingredient + bulk_stack
целый редкий кристалл   -> ingredient/valuable + instance
малое лечебное зелье    -> consumable + instance + 1×1
стрелы                   -> ammo + bulk_stack + 1×1
```

When uncertain, choose **instance**.

## 9B. Compact 1×1 and shape scale

Small discrete items may deliberately use a 1×1 abstraction without becoming stackable.

Canonical examples:

- small potion: 1×1, instance;
- scroll: 1×1, instance;
- coin stack: 1×1, bulk stack;
- ammunition stack: 1×1, bulk stack;
- homogeneous herb/material stack: 1×1, bulk stack.

For shaped items, one logical shape cell uses roughly **5 cm of linear size as an authoring guide**. This is not literal volumetric simulation; it provides enough resolution for swords, axes, bows, shields, spears and custom GM objects to have distinct footprints.

Large items are allowed to be too large for a bag. The UI should show the real dragged shape exceeding the bag boundary and reject the drop. The item may still be carried in either of the two permanent 1×1 hand slots or in an available generic external 1×1 carry slot.

Do not model anatomical placement such as back/hip/shoulder. The GM's narration decides where an externally carried object physically hangs.

## 10. Item value is guidance, not transaction truth

Reusable item definitions may have an optional base reference value.

Prefer an integer base unit such as:

```text
base_value_cp
```

instead of floating-point gold values.

This is a reference value only.

The GM may sell or exchange an item for:

- more than its base value;
- less than its base value;
- different physical currency;
- another item;
- a favor;
- nothing.

Do not make base value a veto over GM-authored trade.

A merchant is a capability/context of an NPC, not necessarily a separate NPC entity type.

## 11. Weight and capacity are physical extensions

Stage 7 implements weight on the same canonical physical items rather than a parallel load ledger.

Canonical law:
- all new/normalized mass values are kilograms;
- `weight_per_unit` means kilograms per one unit;
- a bulk stack weighs `quantity × weight_per_unit`;
- a container's own mass and every nested content item each contribute exactly once;
- unknown mass is preserved as unknown rather than treated as zero;
- character base carrying capacity is **Strength × 6.8 kg**;
- CE owns the derived carrying-capacity number and accepts normal numeric mechanics on `carrying.capacityKg`;
- Cheburashka owns carried item mass and exposes only a derived load projection to the shared character runtime;
- overload is a reported state, not permission for UI to invent speed/action penalties;
- coins, ammunition and homogeneous materials have physical mass because they remain physical inventory;
- specialized capacities are separate from geometry and weight. A quiver may, for example, enforce a maximum arrow quantity even when cells and kg would otherwise allow more.

Space and mass remain independent constraints.

A character may have enough carrying capacity but no physical place for another long weapon, or enough grid space but exceed the resolved carrying capacity by mass.

Any future tactical consequence of encumbrance must be an explicit authored rules mechanic. Inventory presentation must not silently decide how much speed, action economy or other capability is lost.

## Stage 8 implemented world-storage law

Persistent world storage is now part of the canonical physical-item model.

Canonical law:
- Larisa owns where a persistent storage exists, its visibility/access policy and lifecycle;
- Cheburashka owns the physical root container and every contained item;
- a storage is not a second inventory database and does not copy contained items;
- every physical item has exactly one current owner scope: a character or a world storage;
- a whole instance keeps its identity when moved between character and world storage;
- nested containers move with their subtree and preserve descendant IDs/holder relationships;
- partial bulk-stack moves split quantity only;
- all world-storage contents must trace back to that storage's root container;
- a world-storage root is a real container but cannot also be equipped, held in a hand or occupy generic external carry;
- storage access is server-authoritative and may depend on campaign membership, location visibility, current character position, owner policy and GM authority;
- moving a storage changes the Larisa location fact only; contents do not get duplicated or reissued;
- metadata edits keep the Larisa storage name/description and its physical root-container name/description synchronized;
- player-created storage is restricted to an owner-only stash at the active character's current location;
- GM may create shared/private/GM-only storage and may move/archive it;
- UI 1.0 presents persistent storage inside locations and through Snake/current-character inventory actions, never as a parallel client-side inventory truth.

Persistent location storage is **not** a scene/chat Surface. Temporary/shared scene loot interaction remains Stage 9.

## 12. Scene/chat surfaces — implemented mechanics

There is **one Surface concept**.

A Surface represents exposed physical items in a current game scene. Fiction may call it a floor, table, loot pile, altar or anything similar; the persistence model does not multiply Surface types for narrative nouns.

Stage 9 implements the mechanics without rebuilding the chat UI.

Canonical ownership:
- Larisa owns game-scene membership and Surface scene/access/lifecycle facts;
- Cheburashka owns every concrete physical item on the Surface;
- a Surface is not an inventory copy, item ledger or chat-message payload;
- Surface state is independent from message editing/deletion.

Access modes:
- `scene` — current scene participants may access it;
- `selected` — only selected current participants may access it;
- `gm` — GM/system authority only.

Selected access follows current scene presence. Leaving a scene removes stale selected grants, and deferred integrity guards prevent selected grants from pointing to non-participants.

A character has one current game-scene membership. Historical/closed rooms may retain their message history but do not remain simultaneous physical presence.

Cheburashka owner scope is exactly one of:
- character;
- persistent world storage;
- scene Surface.

Top-level Surface items use Surface placement. A container placed on a Surface keeps its same item identity and nested holder subtree.

The eventual inventory/chat UI may render accessible Surfaces as external sources/destinations, but Stage 9 intentionally stops at the mechanics/runtime contract.

## 13. "Who got it first" concurrency on surfaces — implemented

A Surface item is one canonical item.

If two allowed players attempt to take the same current item revision:
1. the server locks the relevant character inventory and Surface scope;
2. the source item is selected under the transaction;
3. the first valid canonical ownership move commits;
4. a later attempt sees either `surface.item_already_taken` or `surface.item_stale`;
5. clients use invalidation/Realtime only to refetch the canonical result.

Realtime is never ownership authority.

Whole instances preserve item identity. Partial fungible bulk claims split quantity; they do not clone physical identity-bearing instances.

If the winning character later puts the item back on an accessible Surface, the item becomes available under its new canonical revision.

## 14. Scene mechanics boundary

Stage 9 closes the **mechanical** scene debt required by Surfaces:
- game-scene creation;
- one current scene membership per character;
- movement between scenes;
- optional scene → character location/time synchronization;
- scene membership based read/write participation;
- Surface creation/access/lifecycle;
- character ↔ Surface item moves;
- first-take concurrency;
- Realtime invalidation.

It does **not** claim that the chat interface has been redesigned to expose every Surface interaction. Chat UI remains a separate presentation task.

## 15. Trade is a dedicated session inside chat — mechanics implemented

Trade is not a Surface and not ordinary chat messages.

The canonical Stage 10 mechanic is a dedicated two-character GENA Trade session associated with a chat room.

Allowed character pairs:
- PC ↔ NPC;
- PC ↔ PC.

NPC ↔ NPC is not a player Trade session.

For an NPC side, GM/manager authority acts as the NPC.
For a PC side, the assigned owning user acts as that PC.

The Trade session stores orchestration/history facts only. Physical items never become Trade-owned.

The visual Trade block is intentionally deferred. A stable typed `tradeSession` API exists so a later chat/screen/modal presentation can connect without rebuilding mechanics.

## 16. Trade visibility is explicit — implemented

Starting Trade grants no automatic permission to inspect another side's private inventory.

The controlling side may explicitly expose:
- one item;
- one container, which exposes that current container subtree;
- items grouped as a merchant assortment.

The server Trade read model returns only the explicitly exposed other-side inventory plus items that side deliberately placed into the central offer.

The acting side may separately request its own current inventory through the Trade API.

Trade access is additionally bound to normal access to the containing chat room. Trade cannot be used to bypass chat-room privacy.

## 17. “I want this” is not an offer mutation — implemented

A side may mark a currently trade-visible item on the other side as wanted/interested.

Interest:
- is communication only;
- does not move the item;
- does not reserve the item;
- does not change ownership;
- does not let the interested side add the other side's item to the offer;
- does not advance Trade revision;
- does not reset acceptance.

The owner/GM side decides whether to place that item into its own offer.

## 18. Trade has its own discussion thread — implemented mechanically

Trade has lightweight session-scoped discussion history.

The thread:
- identifies the speaking character side;
- allows GM to speak/act for NPC;
- remains inspectable after Trade closes;
- is not the main chat;
- does not own items;
- does not mutate the offer revision.

Stage 10 provides thread storage/read/write mechanics only. Its final visual treatment is deferred.

## 19. Offer and acceptance semantics — implemented

Putting an item into the Trade offer does not transfer or reserve it.

Each offer line stores:
- exact canonical item ID;
- offered quantity;
- item version at offer time;
- a Cheburashka integrity fingerprint covering the item and nested subtree where applicable.

Every material offer change:
- increments the Trade revision;
- clears A acceptance;
- clears B acceptance.

Both sides must accept the same current revision.

The first acceptance does not commit.
The second matching acceptance initiates atomic settlement in the same server transaction.

Missing/NULL acceptance is explicitly treated as false.

## 20. Atomic trade commit — implemented

GENA owns Trade session/revision/acceptance state.
Cheburashka owns settlement of physical items.

Final settlement:
1. locks both character inventory aggregates in deterministic order;
2. locks offered item/subtree rows;
3. revalidates Trade item projection against current Cheburashka state;
4. verifies owner, scope, version, quantity, stack semantics and subtree fingerprint;
5. rejects overlapping ancestor/descendant offer lines;
6. transfers all offered items in one transaction.

Whole item instances preserve their identity.
Nested containers carry their contained subtree with them.
Partial fungible stacks split quantity normally.

All transfers commit or none commit.

Physical currency follows the same item-transfer path. There is no wallet/balance ledger.

Base value remains advisory. The engine does not require equal prices and does not forbid barter, gifts, discounts, favors or GM-approved nonsense.

## 21. Trade invalidation, history, Realtime and future UI

An offer intentionally does not reserve an item.

If an offered item is consumed, moved, changed, re-versioned or its subtree changes outside Trade, later acceptance/commit detects that stale projection.

The current Trade revision is then invalidated:
- Trade stays open;
- revision advances;
- both acceptances clear;
- a stable failure code is recorded;
- an `offer.invalidated` event is written;
- no partial transfer remains.

Trade history/events remain inspectable after commit/cancel.

Trade Realtime is refresh transport only. It never accepts an offer or decides settlement.

The stable UI connection seam is `src/gena-trade/**`, with runtime export `tradeSession` and invalidation helper `watchTradeSession`.

A future Snake/chat interface may expose:
- inspect/open container;
- add/remove own offer lines;
- mark wanted items;
- visibility/assortment controls where authorized;
- acceptance/cancel;
- Trade discussion.

Snake remains presentation/action orchestration only and must dispatch to the GENA TradeSession/Cheburashka path.

Stage 10 intentionally does **not** prescribe or implement the final Trade UI.

## 22. Audit rules

When auditing inventory, an agent must:

1. read this contract before proposing redesigns;
2. distinguish **implemented now** from **approved target**;
3. preserve completed Inventory Stages 1–12 unless a real defect requires change;
4. report gaps against this target rather than inventing a different inventory UX;
5. distinguish completed Stage 6–12 spatial/load/world-storage/Surface/Trade/adoption/certification runtime from future presentation or cleanup work;
6. prefer extending one holder/placement model over parallel tables that represent the same fact;
7. call out server-authority/concurrency gaps for moves, claims and trade commits;
8. keep GM authority intact and avoid tactical simulation the app does not own;
9. avoid automatic convenience features that erase the intended tactile container management unless explicitly requested.

## 23. Canonical implementation roadmap

The detailed implementation order is now canonical in:

`docs/INVENTORY_IMPLEMENTATION_PLAN.md`

Current status:

```text
1  ✅ integrity/runtime closure
2  ✅ item lifecycle
3  ✅ stack/instance foundation
4  ✅ nested holders
5  ✅ physical item definition + authoring language
6  ✅ spatial runtime + mobile inventory UX
7  ✅ weight, load and specialized capacity
8  ✅ persistent world storage / chests / stashes
9  ✅ chats/scenes + shared Surfaces
10 ✅ dedicated Trade block mechanics
11 ✅ Chasovoy adoption + legacy migration
12 ✅ final security/concurrency/E2E certification
```

There are 12 stages total. Stages 1–12 are complete.

Audits must read both this product contract and the implementation plan.

## 24. Anti-overengineering rule

Prefer the smallest canonical model that preserves the actual distinctions above.

In particular:

- no separate "sorting surface" if a real scene Surface solves the product need;
- no separate currency ledger if physical coin items solve it;
- no separate trade inventory owner if a trade offer can reference existing canonical items;
- no separate item copy for grid vs socket vs equipment presentation;
- no giant set of hard-coded item-name exceptions;
- no chat complexity inside inventory before chat exists;
- no inventory complexity inside chat when a dedicated Surface or Trade block is clearer.

The goal is physical, understandable interaction, not complexity as a feature.


## Stage 5 ordinary-container authoring law

Ordinary container geometry is prepared content rather than freehand GM arithmetic.

- MEGANOT ships reusable standard definitions for the common 1×1 container, purse, pouch, ordinary bag, travel bag, backpack, large backpack/sack, quiver and small/large chest.
- The GM may issue one of those definitions and rename the concrete instance to express narrative placement or purpose.
- A concrete instance name may say where the bag is carried. That remains prose and never becomes an anatomical storage slot.
- Arbitrary or magical internal geometry is authored through Voss as a campaign item definition or campaign revision.
- Voss may revise an existing campaign item's physical profile, but it must preserve ordinary item mechanics unless the mechanics themselves are separately changed through the normal mechanics-authoring path.
- System container definitions are immutable. A magical or altered version of a standard bag becomes a campaign variant rather than mutating the shared system definition.

## Container viewport and magic-item invariants

These rules are canonical and exist specifically to stop large or magical containers from destroying the mobile inventory UI:

- A container's **internal logical grid** is physical inventory metadata. It does not set CSS cell size, zoom or how many cells are visible at once.
- The mobile UI keeps a readable fixed cell scale / viewport and pans or scrolls across containers that are larger than the visible window.
- Example: an interior described as 100×100 cm may become a 20×20 logical grid at the normal ~5 cm authoring scale. It still opens through the same readable mobile viewport; the app must not shrink all 20 cells across the phone screen.
- Do not persist viewport size, zoom level or rendered pixel size in Chasovoy inventory definitions.
- A carried bag/container can be represented compactly as a 1×1 carry object independently of the dimensions of its interior. Narrative placement belongs in the instance name/description, not anatomical slot fields.
- Common bag/container physical profiles should be pre-authored and reused. Voss creates/revises a new profile primarily for unusual or magical containers requested by the GM.
- Container physical metadata never replaces item mechanics. A bag may have ordinary bonuses, resistances, activated effects, curses or other valid mechanics through the normal item-mechanics/CE path.
