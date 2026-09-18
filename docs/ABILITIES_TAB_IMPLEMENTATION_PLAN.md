# UI 1.0 — Character Sheet Abilities Tab Implementation Contract

> Status: **TEMPORARY / IN PROGRESS**
>
> Branch: `dev`
>
> This file is an implementation contract for coding agents. It is intentionally temporary.
>
> **READY cleanup law:** when the Abilities tab satisfies every READY criterion in this file, do NOT change this document to `READY` and leave it behind. In the same work unit, delete this file, remove the temporary pointer section from root `AGENTS.md`, and record the completed implementation in `docs/PATCH_LOG.md`.

## Product decision

The approved reference controls **layout, panel structure, information density, accordion behavior and interaction mechanics only**.

Do **not** copy the reference's visual style, colors, gold accents, fonts, textures, borders or ornamental language. MEGANOT already has an approved UI 1.0 style and class palette system. The finished Abilities tab must look like MEGANOT while behaving and laying out content like the approved reference.

The Abilities tab is a normal tab inside the character sheet, alongside the other character-sheet sections. It is not the Class Reference, not a mechanics debug panel and not a replacement for the spell or inventory screens.

## Target screen structure

The screen contains one vertical stack of source-group panels in this order:

1. **Class**
2. **Subclass**
3. **Race**
4. **Background**
5. **Effects**

Each group is an accordion panel.

Collapsed group:
- left/source side: group icon, group label and concrete source name;
- right/content side: a compact preview of the first few abilities;
- show `ещё N` only when more abilities exist;
- `N` is computed from real data, never hard-coded;
- chevron indicates expand/collapse.

Expanded group:
- keep the group header in place;
- show the full ability list directly inside the same panel;
- show an earned/open count such as `Открыто: 5 из 5` when meaningful;
- render abilities as compact rows separated by quiet dividers;
- do not turn each row into a large nested card;
- on narrow mobile widths preserve the same hierarchy and order rather than inventing another layout;
- only one primary group should be expanded at a time unless a later explicit product decision overrides this.

## Ability row contract

Every ability row is a first-class interactive entity.

Minimum presentation:
- ability icon or approved fallback;
- ability name;
- short description;
- suppressed/disabled visual state when applicable.

Normal tap/click:
- opens ability details using the approved Snake detail/window path or the character-sheet detail route chosen by the implementation;
- details may include source, unlock level, full description, exact rule/mechanics and Voss text when those fields actually exist;
- do not dump full prose into the compact list.

Long press / right click:
- MUST use Snake;
- MUST NOT use a new local context-menu or bottom-sheet implementation;
- the domain integration supplies actions, Snake supplies gesture/surface/orchestration.

## Data/read-model contract

Build one renderer-facing Abilities read-model from existing canonical/runtime sources. Do not assemble a second Character Engine inside React.

The read-model must normalize at least:
- stable row identity;
- canonical `sourceId` where available;
- source group: class / subclass / race / background / effect;
- source display name;
- ability label;
- short description;
- optional detail/mechanics/Voss fields;
- unlock/earned level when meaningful;
- icon/fallback identity;
- active/suppressed state;
- domain capabilities used to build Snake actions.

Canonical inputs should come from the shared Character Runtime / `ResolvedCharacterContract`, rule-template source graph, Shapoklyak-owned character state and existing feature/effect sources.

Do not re-parse rule prose to decide mechanics when CE/definitions already expose structured mechanics.

## Source grouping rules

### Class
Contains class-owned features earned at the character's current class level. Do not mix subclass features into this group.

### Subclass
Contains subclass-owned features only. Parent-class level semantics remain authoritative.

### Race
Presents race and, where applicable, subrace ancestry features as one player-facing Race group while preserving canonical source identity internally.

### Background
Contains real background/origin abilities and proficiencies only. Do not invent placeholder data. If the current runtime lacks a first-class canonical background source needed by the approved UI, add the smallest correct generic source contract rather than storing UI-only JSON.

### Effects
Contains current active character effects/states that are meaningful as abilities/effects to the player. Do not dump every resolved numeric fact or base stat into this group.

## Snake action contract

Each ability row registers with Snake.

Ordinary player actions should be capability-driven and may include:
- Open / Inspect;
- other real player actions only when the underlying domain already supports them.

Manager authority is:
```text
canManage = member.role === "gm" || member.is_owner === true
```

For manager-capable viewers, a suppressible ability additionally exposes:
- **Заглушить** when active;
- **Включить** when suppressed.

Snake itself must not infer class/race/background/effect semantics. The ability-domain provider supplies the action manifest and typed executor.

## Suppression law

Suppression is a real canonical mechanics change, not presentation-only CSS.

Required command path for GM/owner suppression:
```text
Ability row
-> Snake
-> typed manager action
-> Oracle
-> Shapoklyak / canonical character source suppression
-> character_source_suppressions
-> CharacterResolutionBus / runtime refresh
-> one Character Runtime Resolver
-> CE
-> refreshed ResolvedCharacterContract
-> Abilities tab
```

Reuse the existing source-suppression system and server authorization where possible.

A suppressed ability:
- remains in its original group and original logical position;
- is visibly greyed/muted according to approved MEGANOT styling;
- remains inspectable;
- clearly exposes that it is suppressed;
- contributes no suppressed mechanics to CE;
- changes its manager Snake action to **Включить**.

Do not move suppressed abilities into a separate "disabled" bucket on this screen.

Do not let suppression of one feature accidentally suppress the entire class/subclass when the product action targets one feature. If a feature lacks granular source identity, fix the source graph/identity first.

## Existing UI migration rule

The new Abilities tab replaces the old abilities presentation path, not the underlying runtime.

Retain and reuse:
- Character Runtime / CE;
- class/rule-template presentation data that remains useful as an adapter;
- source provenance;
- canonical resource/action/spell mechanics used elsewhere;
- Shapoklyak/Oracle/Snake ownership boundaries.

Remove from the new Abilities-tab path once superseded:
- local `useLongPressItem + ContextActionSheet` ability management;
- the separate "Отключено ведущим" presentation;
- giant mechanics/debug cards that do not belong to the approved abilities layout;
- runtime-spending controls that belong to gameplay/chat/spell/resource flows rather than this catalog screen.

Do not delete shared runtime code merely because the old UI consumed it.

## Implementation order

### Stage 1 — Read-model ✅ COMPLETE
Created and regression-tested the normalized five-group abilities read-model without changing canonical mechanics.

Current Stage 1 checkpoint:
- one pure renderer-facing `characterAbilitiesReadModel` consumes the existing Character Runtime snapshot rather than resolving CE again;
- it always emits the approved `Class / Subclass / Race / Background / Effects` groups in stable order;
- class, subclass and ancestry source identities remain distinct internally while race + subrace merge only in the player-facing Race group;
- pre-suppression runtime contributions plus the source graph keep an earned ability visible even after CE suppresses its mechanics;
- suppression state follows source ancestry, so suppressing a template root marks its child abilities without deleting them from the read-model;
- unsafe multi-source legacy aliases are deliberately not exposed as granular suppression targets;
- unresolved item/other sources remain explicit in `unclassifiedSourceIds` rather than being mislabeled as Effects;
- existing authored mechanic metadata may enrich icon/Voss/detail fields, while mechanics still come from the resolved Character Runtime/CE contract;
- no abilities panel/layout work was done in Stage 1. Stage 2 is the next implementation stage.

### Stage 2 — Panel shell ✅ COMPLETE
Built the five persistent source panels in the approved order using the existing MEGANOT UI 1.0 visual system.

Current Stage 2 checkpoint:
- the live character-sheet `Умения` section now consumes the Stage 1 read-model assembled from the already-mounted Character Runtime snapshot;
- no second CE resolver, Supabase reader or abilities-specific runtime was added to the presentation component;
- the screen always renders `Class / Subclass / Race / Background / Effects` in stable order, including quiet empty panels where a source is not yet present;
- class/subclass/race source names come from the runtime source graph even when a group currently has zero ability rows;
- each panel has the approved reference geometry: source/icon identity area on the left and a reserved summary/chevron area on the right;
- the visual treatment uses MEGANOT class palette variables and existing graphite/cold-light language rather than the reference's gold/ornamental skin;
- compact previews, computed `ещё N`, expansion state and full rows are intentionally NOT implemented here. Those belong to Stage 3;
- per-ability Snake/detail/suppression interactions remain intentionally deferred to their later stages.

### Stage 3 — Collapsed/expanded behavior
Implement compact previews, computed `ещё N`, single-group expansion, full row list and responsive behavior matching the reference mechanics.

### Stage 4 — Ability detail + Snake registration
Make every row tappable for details and registered for long-press/right-click Snake actions. Remove the local context-menu path from the new screen.

### Stage 5 — Manager suppression
Wire `Заглушить / Включить` through the authoritative manager path. Keep suppressed rows in place and verify CE actually excludes/restores their mechanics.

### Stage 6 — Background/Effects completion
Connect real Background and Effects sources. Do not use fake fixtures as shipped behavior.

### Stage 7 — Cleanup and certification
Remove superseded abilities UI code, finish mobile polish and run READY tests.

## READY criteria

The Abilities tab is READY only when all of the following are true:

- layout structure matches the approved reference mechanics: Class / Subclass / Race / Background / Effects panels;
- MEGANOT's existing approved visual style is preserved;
- collapsed groups show compact real-data previews and correct computed `ещё N`;
- expanded groups show the complete earned list in-place with compact rows;
- source grouping is correct and class/subclass/race data are not mixed incorrectly;
- Background and Effects use real canonical/runtime data or a completed generic canonical source, not placeholders;
- every row opens details on ordinary tap/click;
- every manageable row uses Snake for long press/right click;
- no new abilities-specific context-menu/bottom-sheet runtime exists;
- player, GM and owner authority are correct;
- manager can suppress and re-enable a granular ability/source where supported;
- suppressed abilities remain visible in-place, visibly muted and inspectable;
- suppressed mechanics really disappear from CE resolution and return after re-enable;
- reload preserves canonical suppression state;
- one feature suppression cannot accidentally disable a broader source unless that broader source was explicitly targeted;
- mobile layout preserves the approved panel mechanics without squeezed/unreadable icons;
- regression coverage exists for accordion behavior, grouping, Snake actions, permissions, suppression, reload and CE effect;
- superseded old Abilities-tab UI paths are removed without deleting shared runtime needed elsewhere;
- repository build/tests required by the current patch contract are green or any unrelated pre-existing failure is explicitly documented.

## Mandatory self-deletion on READY

When the criteria above pass:

1. delete `docs/ABILITIES_TAB_IMPLEMENTATION_PLAN.md`;
2. remove the entire **Temporary abilities-tab implementation contract** section from root `AGENTS.md`;
3. remove any temporary TODO/pointer comments created only to lead agents to this plan;
4. record the finished Abilities tab in the active patch journal as implemented behavior;
5. do not leave a `READY` copy of this plan in another filename.

The absence of this temporary file after certification is part of the READY state.
