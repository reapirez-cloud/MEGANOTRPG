# MEGANOTRPG reference authoring contract

## Human layer first

Every class, subclass and feature is written for a player who may be seeing D&D for the first time. A feature card must answer, in this order:

1. **Что это?** One short plain-language explanation.
2. **Когда использовать?** Action economy / trigger / timing.
3. **Что тратится?** Resource, charge, slot or `ничего`.
4. **Что происходит?** The mechanical result, including rolls and targets.
5. **Когда вернётся?** Recharge / reset / duration / repeat rule.
6. **Пример.** One concrete turn or use case when the rule is not obvious.

The character sheet may show only the compact answer. Tapping the feature opens the full reference explanation.

## Three separate layers

Never make prose the source of game mechanics.

- **Sheet summary** — very short player-facing explanation.
- **Reference prose** — clear Russian explanation in Voss's author voice. It may be funny, but clarity comes first.
- **Mechanical definition** — structured Character Engine / Roll Engine data. This is hidden from players and is never parsed from prose.

Changing Voss's wording must never change a character's numbers.

## Rulesets

- The class baseline is **D&D 2024**.
- Official subclasses/options from supplements are added to the same catalog and normalized into the same format.
- Proprietary book prose is not copied verbatim. Mechanical facts, numbers and conditions are stored structurally; explanations are original Russian paraphrases.
- Every mechanical definition has a stable `feature_key` and a `ruleset`/source identity so one feature can be replaced without copying a whole class.

### Campaign override already required

For the current campaign:

- **Druid class:** 2024.
- **Wild Shape:** 2014 mechanics.

This is a campaign rules override of the Wild Shape feature, not an `if (class === "druid")` branch in Character Engine.

## Engine contract

Class content describes itself through generic Character Engine primitives: numeric contributions, formulas, grants, resources, actions, conditions, suppression/replacement and spell access. Rollable class actions additionally provide generic Roll Recipes.

Examples:

- Channel Divinity = resource + one or more actions that spend it.
- Monk Focus = resource + actions that spend it.
- Second Wind = resource + healing action.
- Action Surge = resource + action/feature.
- Bardic Inspiration = resource + action and a level-scaled die.
- Wild Shape = resource/action plus transformation rules supplied by the selected ruleset.

If a new class feature cannot be expressed by the existing primitives, add a **generic reusable engine capability**. Never add behavior named after one class, subclass or spell.

## UI rule

The sheet consumes `ResolvedCharacterContract`. It does not recalculate ability modifiers, proficiency, skills, saves, AC formulas, resources or spellcasting DC in React. Optional mechanical sections are rendered only when the resolved contract contains them.

A player should be able to understand the loop as:

> what I have → when I can use it → what it costs → what happens → when it comes back
