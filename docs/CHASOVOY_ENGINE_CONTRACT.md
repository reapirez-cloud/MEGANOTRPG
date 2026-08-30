# CHASOVOY — Reference / Canonical Definition Engine

> Status: **ACTIVE FOUNDATION / IN DEVELOPMENT on `dev`**

## One sentence

**Chasovoy answers “what is this?” and never “what does Vasya currently have?”**

Chasovoy is the single ownership boundary for reusable canonical game definitions. Other engines may hold references and runtime state, but they must not create private copies of a definition for convenience.

## Owns

- class and subclass definitions;
- race/species/background definitions;
- spell definitions and spell reference metadata;
- item definitions, including GM-created items;
- feat, feature and condition definitions;
- reusable rules/reference definitions;
- stable identity (`id`, `kind`, `scope`, `slug`);
- definition revision history;
- definition visibility/status/source metadata;
- duplicate prevention inside a canonical scope.

## Does not own

Chasovoy has no character runtime state. In particular it does **not** own or track:

- character ids or character identity;
- whether a character knows/prepared a spell;
- character class level or current class resources;
- item ownership, quantity, equipment state or current charges;
- current HP;
- current conditions on a character;
- location, scene or campaign chronology.

Those facts belong to Shapoklyak, Gena, Cheburashka or Larisa as appropriate.

## Definition versus instance

```text
CHASOVOY
item definition: Ash Blade
id = D1
mechanics = +1 attack, fire resistance condition, active action

CHEBURASHKA
inventory instance I73
owner = character C9
definition = D1
quantity = 1
equipped = true
charges = 2
```

Giving an Ash Blade to a character does not create another Ash Blade definition. It creates another runtime instance referencing D1.

The same rule applies to spells/classes/features. A character spell row is not a second Fireball definition; it is runtime ownership/preparation state referencing the canonical spell definition.

## Canonical identity and deduplication

A definition identity is stable across revisions. `id`, `kind`, `scope` and `slug` are identity; authored mechanics/text are revision content.

Canonical uniqueness:

- system definition: `(kind, slug)` is unique globally;
- campaign definition: `(campaign_id, kind, slug)` is unique in that campaign.

A deliberate fork/variant receives a new id and slug. A revision keeps the same id and increments `revision`.

## Scopes

- `system`: built-in/global content. Ordinary GMs cannot mutate it.
- `campaign`: GM-authored content belonging to one campaign.

Visibility is independent from scope: a campaign definition may be campaign-visible or GM-only.

## Communication

Reference authoring UI may call Chasovoy directly because authoring a definition is not a gameplay mutation. Gameplay engines/query assemblers ask Chasovoy for definitions by stable reference.

Chasovoy publishes `definition.*` events when definitions change. It deliberately does not request character resolution itself because it does not know which characters reference the changed definition. Gena/runtime resolver may map the changed definition to affected runtime aggregates and invalidate them.

```text
GM creates item
→ CHASOVOY definition.create
→ canonical item definition exists

GM gives item to Vasya
→ GENA
→ CHASOVOY getDefinition(definitionId): “this is the item”
→ CHEBURASHKA creates/owns the inventory instance
→ runtime resolver gets item definition from CHASOVOY + instance state from CHEBURASHKA
→ CE calculates mechanical result
```

## Migration rule

Existing `spell_catalog`, `rule_templates` and inline item mechanics are legacy storage surfaces. They must be moved behind Chasovoy adapters/migrations rather than copied into a second competing catalog. During transition, an adapter may expose an existing canonical row through the Chasovoy API, but presentation code must progressively stop querying those tables directly.

New reusable GM-authored items/features/spells/classes must target Chasovoy definitions rather than inventing another standalone catalog.
