# MEGANOTRPG Inventory Product Contract

> Status: **APPROVED PRODUCT DIRECTION — NOT A CLAIM OF IMPLEMENTATION**
>
> Audience: humans and AI agents auditing, designing or implementing inventory, equipment, loot surfaces, trade, item definitions, carrying, weight or scene/chat item interaction.
>
> Branch: active implementation belongs on `dev`.
>
> Current implementation checkpoint when this contract was written: Cheburashka Stages 1–4 are complete (integrity, lifecycle, stacks/instances, nested holders). Spatial grids, carry sockets, weight, scene surfaces and trade are future work unless later code/tests prove otherwise.

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

The application decides whether an item is spatial "Tetris" or a simple 1×1 slot from the **holder mode**, not from separate copies of the item.

Target holder modes:

```text
grid
socket
equipment
surface
```

Trade is **not** a holder mode. A trade offer references/reserves existing items until commit; ownership changes only when the trade transaction succeeds.

The same dagger may therefore be:

- a shaped object in a backpack grid;
- a 1×1 icon in a belt/scabbard socket;
- a 1×1 equipped/held object;
- an object on a scene surface.

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

## 5. Shape alone is not physical compatibility

A mathematically fitting object is not automatically a sensible object for a container.

A normal bag must not accept a spear merely because an algorithm found coordinates for it.

Reusable definitions should support explicit physical/carry tags or equivalent structured compatibility facts, for example:

```text
dagger
small_weapon
long_weapon
polearm
shield
bulky
potion
tool
pouch
bow
```

Holder definitions accept/reject structured tags/capabilities. Do **not** infer these rules from display names such as "spear", "меч" or "dagger".

Examples:

- dagger: may fit a grid, dagger socket, belt socket or hand;
- longsword: may fit a compatible long scabbard/back carry slot/hand, but not an ordinary small bag;
- spear: may fit a long/shoulder/back carry point or hand, not a normal backpack;
- shield: may fit a compatible back point or hand, not a small pouch.

## 6. Socket/carry holders: belt, back, scabbards, straps

Some storage is not a grid at all.

Belts, scabbards, quivers, back mounts, straps and similar carry equipment expose **socket/carry slots**. These render as whole 1×1 targets but have compatibility rules.

Example:

```text
Military belt
[ dagger ] [ potion ] [ pouch ] [ empty ]
```

Equipment may itself create additional carry capacity.

Examples:

- a belt adds small belt sockets and/or hip weapon sockets;
- a backpack occupies a back slot, exposes a grid inside, and may expose external straps;
- a quiver occupies a carry point and accepts ammunition;
- a scabbard is a real item that can itself hold a compatible sword.

A target model may therefore be:

```text
Character
└─ Military belt
   └─ Scabbard
      └─ Longsword
```

The UI should flatten this where useful. The player should not be forced through three nested screens merely because the canonical model is precise.

## 7. Equipment is distinct from storage

Equipment/held slots remain a separate placement mode and render as simple 1×1 targets.

Examples include hands, armor slots, rings and other equipped positions.

An equipped item should not simultaneously occupy backpack grid space.

Unequipping must have a real destination. If no compatible free destination exists, the UI should require the player to choose another valid holder/surface or cancel rather than making the item exist nowhere.

Location can matter to later gameplay UX:

- potion in backpack: stored;
- potion on belt: quick access;
- dagger in scabbard: quick draw;
- weapon in hand: already active.

Do not prebuild tactical action-economy simulation unless the application later explicitly owns that rule state.

## 8. Containers remain physical and nestable

Stage 4 established canonical nested holder relationships. Preserve that foundation.

A container may contain items and other compatible containers. Holder cycles remain forbidden.

The final spatial model extends the existing holder tree; it does not replace it with a second parallel inventory structure.

Container UI should feel like opening real storage:

- open backpack -> see its grid;
- open pouch inside it -> see the pouch;
- back returns to the parent holder.

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

## 23. Planned inventory direction from the Stage 4 checkpoint

This sequence is product direction, not a rigid migration-number promise:

1. ✅ Cheburashka integrity/runtime closure
2. ✅ Item lifecycle: use/consume/charges/recharge
3. ✅ Stacks and stateful instances
4. ✅ Nested containers / holder model
5. ⬜ Spatial inventory: shape masks, grid placement, rotation, collisions, physical compatibility, carry/socket points, equipment integration
6. ⬜ Weight, carrying load and capacity
7. ⬜ Scene/chat surfaces, access and atomic take
8. ⬜ Trade block/session, interest marks, trade thread, double acceptance and atomic exchange
9. ⬜ Chasovoy definition adoption for canonical shapes/tags/weight/value/holder capabilities and legacy cleanup
10. ⬜ Final certification against real DB/RLS/RPC/concurrency/E2E behavior

Chat/scenes/character movement are a linked product debt and may be implemented on their own roadmap when the supporting chat system is built.

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
