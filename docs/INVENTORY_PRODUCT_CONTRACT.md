# MEGANOTRPG Inventory Product Contract

> Status: **APPROVED PRODUCT DIRECTION — NOT A CLAIM OF IMPLEMENTATION**
>
> Audience: humans and AI agents auditing, designing or implementing inventory, equipment, loot surfaces, trade, item definitions, carrying, weight or scene/chat item interaction.
>
> Branch: active implementation belongs on `dev`.
>
> Current implementation checkpoint when this contract was written: Cheburashka Stages 1–4 are complete (integrity, lifecycle, stacks/instances, nested holders). Spatial grids, hands/generic carry cells, weight, world storage, scene surfaces and trade are future work unless later code/tests prove otherwise.

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

Future carrying rules should use the same physical items rather than a parallel load ledger.

The target model must be able to account for:

- item weight;
- stack quantity × per-unit weight;
- contents of carried containers;
- physical capacity/compatibility;
- character carrying capacity / encumbrance when implemented.

Space and mass are independent constraints.

A character may have enough weight capacity but no physical place for another long weapon, or enough grid space but be overloaded by mass.

Coin weight belongs here because coins are items.

## 12. Scene/chat surfaces

There is **one surface concept**. Do not invent a separate "temporary sorting table" purely for inventory UI.

A surface represents items physically available in a game scene/chat. What it means fictionally may be a floor, table, loot pile, altar or another exposed area.

The GM should be able to create/open a Surface block from the game chat and place loot/items on it without entering every player's inventory.

A surface is associated with the current scene/chat and has access rules such as:

- all characters in the scene;
- selected characters;
- GM only.

The inventory UI should be able to attach/read currently accessible surfaces as external item sources/destinations.

Until the chat/scene system exists, inventory should keep a clean integration point for future `accessible_surfaces` rather than implementing a fake local-only version.

## 13. "Who got it first" concurrency on surfaces

A surface item is one canonical item.

If two allowed players attempt to take the same item concurrently:

1. the server performs an authoritative atomic move/claim;
2. the first valid commit wins;
3. the second receives a stable stale/already-taken result;
4. clients refresh through realtime/invalidation.

Do not implement this as visual locking alone.

If the winning player later places the item back on an accessible surface, it becomes available again.

Realtime is a refresh/synchronization transport, not the ownership authority.

## 14. Chat/scene debt required by surfaces

The full surface experience depends on future chat/scene work. Record this as a product dependency, not as missing Cheburashka ownership.

Future chat/scene work must cover at least:

- real game chats/scenes;
- which characters are participants in each scene;
- moving characters between chats/scenes;
- scene/location relationship;
- scene-accessible surfaces;
- changes in accessible surfaces when a character enters/leaves a scene.

Do not make Stage 5/6 inventory implementation balloon into rebuilding the entire chat system prematurely.

## 15. Trade is a dedicated block inside chat

Do not implement trade by overloading ordinary chat messages or by making a scene surface pretend to be a trade.

A chat may contain a dedicated **Trade** block/session with exactly two character sides:

- PC ↔ NPC;
- PC ↔ PC.

For an NPC side, the GM acts as that NPC.

For a PC side, the owning player acts as that character.

The trade UI may expose each side's explicitly trade-visible inventory and a central offer area.

## 16. Trade visibility is explicit

Starting trade must not grant permission to inspect every private item on another character/NPC.

The owning side/GM should control what the other side may browse, for example:

- explicitly listed trade items;
- selected containers;
- a merchant assortment.

Do not leak hidden NPC quest items merely because an NPC entered a trade session.

## 17. "I want this" is not an offer mutation

A participant may highlight/mark an item on the other side as wanted/interested.

This is a communication hint only.

It does not:

- move the item;
- reserve ownership by itself;
- let a player pull an NPC item into the offer without the NPC/GM side agreeing.

The NPC/GM or other PC decides whether to add that item to their offer.

## 18. Trade has its own discussion thread

A trade block may have a lightweight message thread scoped to that trade.

This lets the parties negotiate while the offer changes.

For NPC trade, the GM writes/acts for the NPC.

The trade thread is not a replacement for the main chat and does not become a new canonical inventory owner.

When a trade closes, its result/history may remain visible in the main chat history.

## 19. Offer and acceptance semantics

Putting an item in the center trade offer does **not** immediately transfer ownership.

The offer references specific canonical items/quantities.

Each side has an acceptance state.

Both sides must accept the **same trade revision**.

Any material offer change, including adding/removing/changing quantity, must:

- increment/change the offer revision;
- reset both acceptances.

This prevents last-second offer mutation after one party agreed.

## 20. Atomic trade commit

When both sides accepted the same revision, the server must commit the trade atomically.

The commit must revalidate at least:

- trade/session is still open;
- participant authority;
- current trade revision;
- both acceptances;
- item existence;
- current owner;
- requested quantity/stack availability;
- current item/inventory versions;
- any holder/transfer invariants required by Cheburashka.

Then all items/currency transfer, or none do.

If an offered item changed or disappeared before commit, the trade must fail/reopen/update rather than duplicate or partially transfer goods.

Physical coins use the same item-transfer mechanics. No separate wallet settlement path is required.

## 21. Snake responsibilities

Snake should expose contextual inventory operations without becoming an owner.

Examples may include:

- inspect/open container;
- move;
- rotate during placement;
- choose compatible holder;
- put into/take from container;
- attach to a carry socket;
- equip/unequip;
- place on an accessible scene surface;
- add/remove own item from a trade offer;
- mark another side's item as wanted.

Snake must dispatch to the canonical Cheburashka/GENA/Oracle path appropriate to the actor and operation.

Do not infer actions from item names.

## 22. Audit rules

When auditing inventory, an agent must:

1. read this contract before proposing redesigns;
2. distinguish **implemented now** from **approved target**;
3. preserve completed Cheburashka Stages 1–4 unless a real defect requires change;
4. report gaps against this target rather than inventing a different inventory UX;
5. avoid declaring future spatial/surface/trade mechanics complete merely because holder infrastructure exists;
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
5  ⬜ physical item definition + authoring language
6  ⬜ spatial runtime + mobile inventory UX
7  ⬜ weight, load and specialized capacity
8  ⬜ persistent world storage / chests / stashes
9  ⬜ chats/scenes + shared Surfaces
10 ⬜ dedicated Trade block
11 ⬜ Chasovoy adoption + legacy migration
12 ⬜ final security/concurrency/E2E certification
```

There are 12 stages total. Stages 1–4 are complete; 5–12 remain.

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


## Container viewport and magic-item invariants

These rules are canonical and exist specifically to stop large or magical containers from destroying the mobile inventory UI:

- A container's **internal logical grid** is physical inventory metadata. It does not set CSS cell size, zoom or how many cells are visible at once.
- The mobile UI keeps a readable fixed cell scale / viewport and pans or scrolls across containers that are larger than the visible window.
- Example: an interior described as 100×100 cm may become a 20×20 logical grid at the normal ~5 cm authoring scale. It still opens through the same readable mobile viewport; the app must not shrink all 20 cells across the phone screen.
- Do not persist viewport size, zoom level or rendered pixel size in Chasovoy inventory definitions.
- A carried bag/container can be represented compactly as a 1×1 carry object independently of the dimensions of its interior. Narrative placement belongs in the instance name/description, not anatomical slot fields.
- Common bag/container physical profiles should be pre-authored and reused. Voss creates/revises a new profile primarily for unusual or magical containers requested by the GM.
- Container physical metadata never replaces item mechanics. A bag may have ordinary bonuses, resistances, activated effects, curses or other valid mechanics through the normal item-mechanics/CE path.
