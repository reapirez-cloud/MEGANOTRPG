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

### Stage 3 — Collapsed/expanded behavior ✅ COMPLETE
Implemented the reference accordion mechanics on top of the Stage 2 MEGANOT panel shell.

Current Stage 3 checkpoint:
- collapsed panels show up to three real ability rows from the canonical read-model, each with an authored image when the icon is a real media path or the approved group fallback glyph otherwise;
- `ещё N` is computed from the actual remaining row count and is omitted when there is nothing hidden;
- only one non-empty group can be expanded at a time; tapping the same group again collapses it;
- empty groups remain visible for structural consistency but cannot steal accordion expansion;
- expanded content renders the complete earned row list directly inside the same panel with compact icon / name / short-description rows;
- the expanded header shows `Открыто: N из N` from the current earned model. Suppression does not rewrite earned-count semantics;
- suppressed rows already remain in logical position and render muted, but manager suppression commands themselves are still deferred to Stage 5;
- the same left-source / right-summary hierarchy is preserved under the narrow mobile media rule instead of switching to a different layout;
- the accordion helpers are pure and regression-tested independently from React;
- ability row tap/details and long-press/right-click Snake registration are intentionally NOT implemented in Stage 3. Those belong to Stage 4.

### Stage 4 — Ability detail + Snake registration ✅ COMPLETE
Connected every ability row to the universal Snake interaction system and the shared Snake detail surface.

Current Stage 4 checkpoint:
- both collapsed preview rows and expanded full rows are first-class `character-ability` Snake entities with stable character-scoped identities;
- ordinary tap opens the shared Snake detail window rather than a new abilities-only modal or route;
- detail content includes the real source name, unlock level when known, current suppressed state, short description, resolved structured/summary mechanic payloads, and authored Voss explanation/nuances/comment when present;
- the selected ability is also published into the character-sheet view context so AI/Snake context tracks the same object the user just opened;
- long press on touch and right click on desktop are owned exclusively by the existing `SnakeTrigger`; there is no abilities-specific `ContextActionSheet`, `useLongPressItem`, `onContextMenu` handler or bottom-sheet runtime;
- collapsed and expanded presentations share one `createCharacterAbilitySnakeActions` domain provider, so later authority actions can be added once without duplicating UI wiring;
- Stage 4 intentionally exposes only `Подробнее`. GM/owner `Заглушить / Включить` commands remain Stage 5 and are not faked here.

### Stage 5 — Manager suppression ✅ COMPLETE
Connected GM/owner ability suppression to the existing authoritative Oracle → Shapoklyak source-suppression path and verified real CE removal/restoration.

Current Stage 5 checkpoint:
- the ability Snake provider receives only `canManage` plus the canonical suppression callback; ordinary renderers still own no authority rules or persistence logic;
- players receive only `Подробнее`;
- GM and campaign owner receive `Заглушить` for an active ability and `Включить` for a suppressed ability;
- manager actions are emitted only when the read-model exposes one safe granular `sourceId` and `capabilities.suppress === true`; unsafe legacy multi-source rows remain inspect-only rather than targeting a broader source by guess;
- the manager callback is the mounted runtime's existing `useCharacterSourceSuppressions.setSuppressed`, which calls `Oracle.characters.setSourceSuppressed`;
- Oracle forwards only GM/system authority to Shapoklyak's `entity.set_source_suppressed` command;
- Shapoklyak persists through `set_character_source_suppressed`, publishes a resolution request, and the runtime reloads the canonical suppression rows;
- the live Supabase project was verified to expose `set_character_source_suppressed(uuid,text,boolean)` and RLS on `character_source_suppressions` uses `private.can_manage_character`; `private.can_manage_campaign` resolves manager authority as `is_owner = true OR role = 'gm'`;
- suppressed rows continue to remain in their original group/position and remain inspectable/muted because the Stage 1 read-model consumes pre-suppression contributions plus the canonical suppression snapshot;
- a CE regression now proves suppression is mechanical rather than visual: the same source's feature/rule and numeric contribution disappear from the resolved contract while suppressed and return when the suppression contribution is absent;
- no Supabase schema or RLS migration was required for Stage 5.

### Stage 6 — Background/Effects completion ✅ COMPLETE
Connected Background and Effects to real canonical character data without shipping fake rows or inventing a parallel effect store.

Current Stage 6 checkpoint:
- `character_features` remains the single canonical persistent feature/effect owner; no new effect table or UI-only JSON store was introduced;
- the database `character_features_kind_check` now explicitly permits `background_feature` and `effect` in addition to the existing feature kinds;
- `CharacterFeature` / `FeatureInput` types expose the same two explicit kinds;
- the existing GM `FeatureEditor` can author **Черта предыстории** and **Активный эффект** with the same description + structured mechanics builder used by other character features;
- generic legacy `feature` rows are deliberately NOT auto-reclassified as effects, because current production rows are semantically mixed and guessing would silently corrupt presentation;
- Background and Effect feature mechanics flow through the existing legacy adapter / Character Runtime / CE pipeline;
- Stage 6 kinds use one canonical `feature:<id>` source identity for both descriptive grant and mechanics, so Stage 5 granular Snake suppression can safely target them;
- the Background panel uses `character_sheets.background` only as the canonical source display name (for example, `Бывший наёмник`); the text field does not invent abilities by itself;
- the Effects panel uses `Активные состояния` as its source label and renders only canonical `effect` feature rows; row existence is the current active-state contract, while removing the row ends the persistent effect;
- real Background/Effect rows remain normal CE-backed abilities: description, mechanics, Snake detail and manager suppression all work through the same paths as previous stages;
- the production schema migration was applied and mirrored in `supabase/migrations/20260918150053_character_feature_background_effect_kinds.sql`;
- a transaction-level production verification inserted one row of each new kind and rolled back successfully; a follow-up query confirmed zero leftover test rows;
- Supabase security advisors were run after the DDL. They report pre-existing project-wide warnings unrelated to this constraint-only migration; Stage 6 added no table, policy, function or privilege surface.

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
