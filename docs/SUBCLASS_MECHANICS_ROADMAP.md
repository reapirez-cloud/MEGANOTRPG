# Subclass Mechanics Roadmap

## Goal

Turn the translated subclass catalog into reliable Character Engine mechanics without deriving rules from prose and without coupling class-specific logic to the UI.

This roadmap is written against the live `dev` branch. Live source code and migrations are authoritative; status documents and repository search results are guidance only when they agree with the current `dev` tree.

## Current baseline

- `src/rule-templates/wizardSubclassMechanics.ts` is the current reference implementation for a mechanically explicit subclass package.
- Class and subclass assignments remain separate Character Engine source trees; `classPackages.ts` only presents them as a parent/child package for the UI.
- The generic template registry resolves stored template bundles into native `CharacterContribution[]` for Character Engine.
- Existing mechanics primitives are the preferred contract: deterministic modifiers/formulas, grants, resources, actions/reactions, spells, persistent choices, and stable source keys.
- Broad Russian rules prose must never be parsed to infer runtime mechanics.
- Contextual rules that cannot be represented safely stay as exact reference text for the player/GM until a generic runtime primitive exists.

## Definition of done for one subclass feature

A feature is complete only when all applicable items below are true:

1. Exact rules/reference text is preserved separately from automation.
2. The feature is classified as deterministic, choice-driven, resource-driven, action/reaction, spell-related, stateful, or GM-adjudicated.
3. Deterministic behavior is represented with native Character Engine mechanics instead of UI-only calculations.
4. Player choices are explicit, validated, persisted, and reload correctly.
5. Limited-use abilities have a resource with a clear maximum, current value, spend behavior, and reset policy.
6. Granted actions, reactions, spells, proficiencies, expertise, resistances, senses, or other capabilities are visible to Character Engine consumers.
7. Every contribution has a stable source identity so leveling/reloads do not duplicate effects.
8. Subclass mechanics activate only when the parent class level reaches the subclass unlock level.
9. No mechanic leaks into another subclass or remains active after the subclass is removed/replaced.
10. Tests cover representative levels, source-key stability, persistence, resource resets, and runtime visibility.

## Mechanics classification

| Rule shape | Runtime representation |
| --- | --- |
| Flat/stat modifier | `numeric` contribution |
| Derived/scaling value | `formula` contribution |
| Proficiency, expertise, training, sense, resistance, feature capability | `grant` contribution |
| Uses, dice pools, points, charges | `resource` contribution |
| Action, bonus action, reaction, activation | `action` contribution |
| Added/always-prepared spells and spell capabilities | `spell` and/or explicit grant according to the existing spell contract |
| Choose N options/maneuvers/runes/shots | persistent choice state that emits mechanics from the selected options |
| Temporary marks, summoned/echo entities, transformations, per-target combat state | generic state primitive when available; otherwise automate only the durable subset and preserve the exact rule text |
| Narrative/contextual adjudication | exact reference text only; never fake deterministic automation |

## Architecture rule

The pipeline should remain:

`exact source/reference -> explicit subclass mechanics package -> template resolver -> CharacterContribution[] -> Character Engine -> sheet/runtime UI`

The UI renders resolved mechanics and choices. It must not parse feature descriptions or contain hidden subclass-specific rule calculations.

Database migrations may seed template data, but they must not become a second independent source of business logic that can drift from the source/runtime contract.

## Wave 0 — live HEAD inventory

Before changing a class, verify the current `dev` tree instead of trusting historical status files.

For each class:

1. Locate the current canonical translation/reference source.
2. Locate current template/migration seed data.
3. Locate any existing runtime mechanics package and tests.
4. Build a feature-by-feature gap matrix: `exact text | existing mechanic | missing primitive | test coverage`.
5. Only then create or extend the class mechanics package.

Reason: older status documents still describe Fighter/Druid/Cleric runtime files that are not present at their historical paths on the current `dev` HEAD. Rebuilding blindly against those paths risks duplicating or resurrecting obsolete architecture.

## Wave 1 — Fighter vertical slice

Fighter is the best first full implementation target because its subclasses exercise almost every generic primitive while remaining easier to isolate than transformations/summons.

Implement in this order:

### 1A. Deterministic / low-state features

- Fighting Style grants where subclass/class mechanics depend on them.
- Champion: deterministic bonuses such as Remarkable Athlete.
- Banneret: Royal Envoy / targeted Expertise-style grants.
- Samurai: Elegant Courtier and other deterministic derived bonuses.

Purpose: validate modifier/grant/source-key conventions with minimal encounter state.

### 1B. Persistent choices and resources

- Battle Master maneuver choices + superiority resource behavior.
- Arcane Archer Arcane Shot choices + uses.
- Rune Knight rune choices + Giant's Might / Runic Shield resources where applicable.
- Psi Warrior psi-energy resource and scaling.

Purpose: establish one reusable choice/resource pattern for future subclasses.

### 1C. Stateful combat mechanics

- Cavalier marks, reactions, and per-target state.
- Echo Knight echo lifecycle/state.

Do not encode these as ad-hoc UI flags. Add/reuse a generic encounter-state boundary, or automate only the safe durable subset until that boundary exists.

### 1D. Spellcasting subclass behavior

- Eldritch Knight spell grants/progression visibility.
- War Magic / Eldritch Strike runtime visibility where representable by generic actions/state.

### Fighter exit criteria

Fighter is the template for the next classes only when representative subclasses pass end-to-end tests through template resolution, Character Engine, persistence, and sheet/runtime visibility.

## Wave 2 — Cleric

Do Cleric after Fighter.

Why:

- many domains mostly exercise grants, resources, actions/reactions, and spell visibility;
- it expands breadth without immediately forcing a full transformation/summon model;
- it is a good second proof that the primitives are generic rather than Fighter-specific.

Prioritize deterministic domain bonuses, Channel Divinity/resource integration, domain spell visibility, and reactions/actions. Preserve situational divine/narrative adjudication as exact text where automation would lie.

## Wave 3 — Druid

Do Druid after Fighter + Cleric primitives are stable.

Druid should deliberately stress-test:

- transformation state;
- alternate stat profiles;
- temporary HP / form resources;
- summon/companion-like state;
- subclass-specific spell grants and resource exchanges.

Moon Druid and other transformation-heavy subclasses should not be implemented through one-off sheet hacks. If the engine lacks a generic temporary-form/state model, introduce that model first.

## Wave 4 — Monk and Sorcerer

Their current translated material must be mechanically exact before activation.

Process:

1. exactize the rules text against the chosen rules corpus/version;
2. produce the feature gap matrix;
3. implement native mechanics packages;
4. activate only after tests prove the runtime output.

Do not automate literary summaries.

## Wave 5 — Warlock

Complete the subclass catalog/reference gaps first, then implement mechanics.

Warlock will require the generic patterns established earlier for:

- persistent option choices;
- pact/invocation-style grants;
- short-rest resources;
- spell-list/spell-grant behavior;
- conditional actions and feature state.

## Wizard policy

Wizard remains the regression baseline, not a dumping ground for shared logic.

When a new generic primitive is introduced for Fighter/Cleric/Druid, verify Wizard still resolves identically. Shared runtime behavior belongs in generic contracts/resolvers, while subclass-specific declarations stay in their own mechanics package.

## Testing strategy

Every implementation wave should add or restore tests at four levels:

1. **Feature unit tests** — selected level produces the expected native contributions.
2. **Resolver tests** — parent class level correctly activates/deactivates subclass output.
3. **Persistence tests** — choices and resource state survive save/reload and level changes.
4. **Integration tests** — resolved actions/resources/grants/spells appear in Character Engine consumers without duplicates.

Required regression checks:

- stable unique source keys;
- no duplicate contribution after refresh/re-registration;
- no cross-subclass leakage;
- correct behavior before/at/after unlock levels;
- correct resource reset policy;
- choices rejected when invalid or over the allowed count;
- subclass removal/replacement removes its contributions;
- Wizard baseline remains unchanged unless an intentional generic contract migration says otherwise.

## First implementation patch after this roadmap

Do not start by implementing the hardest subclass.

The first mechanics patch should:

1. finish the live `dev` inventory for Fighter and identify its current canonical source/migration path;
2. create a Fighter feature gap matrix from the live source;
3. implement a small deterministic vertical slice (2-4 features) using only generic mechanics primitives;
4. add end-to-end runtime tests for that slice;
5. record only the implemented behavior in `docs/PATCH_LOG.md`.

Once that slice passes, expand Fighter through Waves 1B-1D rather than creating parallel unfinished implementations for every class.
