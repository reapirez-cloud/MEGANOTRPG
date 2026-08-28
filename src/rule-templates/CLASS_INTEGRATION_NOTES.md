# INTERNAL: Class integration rules

> **Developer-only note. Never render/import this file into the player UI, Reference Guide, narrator text, `description`, `author_description`, or `author_comment`.**
>
> Read this before changing any class or subclass integration.

## Core rule

Character Engine (CE) is the mechanical source of truth for character data. A class/subclass parser must emit structured contributions into CE. The UI reads the resolved contract; it must not re-parse class rules.

A class feature is not considered integrated merely because a `feature` card exists. It is integrated when:

1. the player-facing rule is precise;
2. the rule reaches CE as structured data;
3. any resource/action/spell/grant CE can actually represent is emitted natively;
4. dependencies and upgrades are explicit rather than inferred from prose;
5. GM suppression can remove the feature through a stable `sourceKey`.

## Conditions: engine-enforced vs GM-enforced

Do **not** build a world-state simulator just to decide whether a class button may be pressed.

Split requirements into two categories.

### 1. Engine-enforced requirements

Use these only when CE can know the answer from the character contract/state itself.

Examples:
- minimum class level;
- a selected persistent option;
- resource current value (`wild_shape >= 1`);
- another owned class feature;
- an active mode/state that MEGANOT explicitly tracks;
- a spell slot of the required level;
- an upgrade replacing an earlier feature;
- a subclass requiring its parent class.

CE may disable/block an action when an engine-enforced requirement is false.

Recommended shape:

```ts
requirements: [
  { kind: "resource", key: "wild_shape", minimum: 1, enforcement: "engine" },
  { kind: "feature", key: "subclass:druid:spores:symbiotic-entity", enforcement: "engine" },
]
```

### 2. GM-enforced / narrative requirements

Use this whenever the condition depends on the scene or fiction and CE cannot reliably know it.

Examples:
- target is standing in water;
- it is raining;
- a corpse is nearby;
- the character can see the target;
- there is enough free space;
- a suitable plant/tree is nearby;
- the target is willing;
- the beast was previously seen;
- the terrain satisfies a feature;
- the GM decides a creature/object qualifies.

**Important:** a GM-enforced requirement does NOT hide or disable the action. The player can use the button. The UI should show the condition, and the GM decides whether it was legal in the scene.

Recommended shape:

```ts
requirements: [
  {
    kind: "narrative",
    text: "Цель находится в воде",
    enforcement: "gm",
  },
]
```

If the player presses the action when the narrative condition is not satisfied, that is a table/GM ruling. Do not remove the class ability from CE just because MEGANOT cannot verify the fiction.

## Rule payload standard

For every meaningful class/subclass feature, store enough structured rule data that another consumer does not need to parse Russian prose.

Where relevant, capture:
- `activation` / action economy;
- `cost` / resource consumption;
- `requirements`;
- `target` / range / area;
- attack or saving throw;
- damage/healing/temp HP dice and modifiers;
- conditions applied/removed;
- duration;
- frequency / recharge;
- scaling by class level, proficiency bonus, or ability modifier;
- dependencies (`dependsOn`, active modes, selected choices);
- replacement/upgrade behavior;
- GM-enforced narrative conditions.

The prose is for humans. The structured mechanic is for CE and other consumers.

## Actions and passive features

If a feature can be deliberately used in play, emit an `action` whenever the current generic CE action model can represent it.

If it consumes a finite pool, emit a `resource` under the same logical source.

If it grants a spell, emit a CE `spell` with the real casting method and costs.

If it grants resistance, immunity, proficiency, numeric bonuses, etc., emit the corresponding native grant/numeric contribution instead of only describing it in a feature card.

The associated feature card may still exist for explanation, but it is never a substitute for native CE data.

## Dependencies and upgrades

Never encode dependencies only in prose such as "while X is active".

Examples:
- `Spreading Spores` depends on `Symbiotic Entity`;
- `Stormborn` depends on `Wrath of the Sea` being active;
- `Full of Stars` depends on `Starry Form`;
- a level-15 upgrade depends on the persistent choice made at level 7.

Use stable keys and structured fields such as `dependsOn`, `requiresMode`, `requirements`, or choice-level mechanics.

For a true upgrade of the same mechanical feature, prefer replacement semantics (`REPLACE`) rather than granting two competing versions.

## Persistent choices

A choice is selected once unless the rule explicitly allows changing it.

- unresolved choice is inert and must not block automatic class mechanics;
- selected choice persists across level changes;
- later `option_mechanics_by_level` unlock automatically from the original selection;
- an upgrade must follow the previously selected branch unless the rule grants a new choice.

## GM OFF / suppression

Every independently suppressible feature needs a stable `sourceKey`.

- related action/resource/spell/rule card should normally share the same `sourceKey`;
- suppressing the source removes the entire mechanical package;
- do not make UI-specific suppression hacks;
- source hierarchy belongs to parser/CE read-model, not class-specific consumers.

## Player-facing explanations

Mechanical descriptions must answer, where applicable:

**Trigger/condition → activation → cost → target → exact effect → numbers/dice → duration → limit/recharge.**

Bad:
- "расширяет возможности друида";
- "усиливает лечение";
- "развивает направление";
- "становится эффективнее".

Good:
- "Когда заклинание 1+ уровня восстанавливает HP другому существу, друид восстанавливает себе 2 + уровень ячейки HP."

Never use vague prose as a substitute for a rule.

## Narrator / Reynar Voss

Voss is an in-world narrator, not a developer note channel.

He may provide:
- field observations;
- dry practical advice;
- cynical or sarcastic commentary;
- consequences a person in the setting would understand.

He must never mention:
- Character Engine / CE / runtime;
- editions, revisions, 2014/2024;
- compatibility or overrides;
- "we use", "we changed", "our implementation";
- why developers selected one rule version over another.

Technical history stays in internal metadata/comments only.

## Druid project-specific rules

These are internal implementation facts and must not leak into the UI/narrator text.

- Base Druid follows the project's current base package.
- Wild Shape uses the project's pinned beast-stat/HP model.
- Wild Shape has 2 uses.
- Both uses return on a short or long rest.
- Form uses beast HP and physical stats.
- Do not grant temporary HP from the alternate Wild Shape model.
- Do not use alternate usage scaling.
- Druid subclass unlock is tied to Druid class level, not total character level.

### Druid dependency examples

- `Wild Resurgence`: CE handles spell-slot/Wild Shape resources; no world condition needed.
- `Elemental Fury`: persistent choice at level 7; level 15 upgrades the selected branch automatically.
- `Stormborn`: mechanical dependency on `Wrath of the Sea` active mode if that mode is tracked.
- `Full of Stars`: mechanical dependency on `Starry Form` active mode if tracked.
- `Spreading Spores`: dependency on `Symbiotic Entity`; scene placement details can remain GM-enforced.
- Any rule such as "target is in water" or "corpse is nearby" stays visible and usable with `enforcement: "gm"` unless MEGANOT later gains reliable world-state tracking.

## Definition of done for one class

Do not call a class finished until all of these are checked:

1. base class levels 1–20 are accurate;
2. every included subclass is accurate;
3. no placeholder descriptions remain;
4. active abilities have CE actions where representable;
5. finite pools have CE resources;
6. spells are CE spells, not prose-only grants;
7. passive mechanical grants are native where representable;
8. dependencies and upgrades are structured;
9. narrative conditions are marked GM-enforced rather than blocking actions;
10. persistent choices survive level changes and unlock later mechanics;
11. subclass level follows parent class level;
12. GM suppression removes the complete source package;
13. parser → `ResolvedCharacterContract` tests verify representative low/mid/high levels;
14. reference text and Voss commentary contain no implementation meta;
15. CI is green.

If any item above fails, the class is still in progress.
