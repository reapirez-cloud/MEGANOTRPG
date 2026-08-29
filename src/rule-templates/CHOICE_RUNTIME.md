# Persistent Character Choices

`RuleChoiceDefinition.selection_mode = "player_once"` turns an ordinary template choice into a player-facing Character Engine decision.

## Contract

- The assigned player may resolve the choice. A campaign manager may also resolve it.
- The server validates the active assignment, source level, option list, `option_unlock_level`, `count`, `count_by_level`, and `requires_choice`.
- A confirmed option is append-only for the player. It cannot be removed or replaced through the player RPC.
- If `count_by_level` later increases the required number of selections, the choice becomes pending again only for the missing slots. Existing selections remain fixed.
- Manager-owned choices remain the default (`selection_mode` omitted or `manager`) and are not shown in the player decision queue.
- A manager may still correct an assignment through the existing administrative template editor. That path is an explicit override, not normal player respec.

## UI states

`resolveTemplateChoiceStates()` produces `hidden`, `pending`, or `locked`.

- `hidden`: dependency is not satisfied; the choice is not shown and emits no mechanics.
- `pending`: the source is unlocked but one or more required selections are missing.
- `locked`: the current required count is complete. Selected variants are shown as on; mutually exclusive alternatives are shown as off.

## Spells and future feats

Spell options should use stable catalog identities such as `spell:guidance` and their mechanics should grant the canonical `class_spell` access. The choice runtime stores only the selected stable keys; CE continues to resolve the actual mechanics from the source definition.

The same choice contract is intentionally source-agnostic. When feats become CE sources, their "choose from" clauses should use this runtime rather than inventing a second selection system.
