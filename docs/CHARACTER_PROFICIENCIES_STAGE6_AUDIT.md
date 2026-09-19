# Character Proficiencies — Stage 6 Snake / authority audit

Date: 2026-09-19  
Branch: dev

## Result

The Владения screen now uses the existing universal Snake interaction runtime.

Ordinary panel tap remains the independent accordion behaviour from Stage 3. Individual proficiency tags register as `character-proficiency` Snake entities for long press / right click.

## Player contract

A player can:

- inspect the proficiency
- inspect every provenance source
- see whether a source/proficiency is suppressed

A player cannot receive source mutation actions.

No permanent admin controls are rendered into the five-panel reference composition.

## GM/Admin contract

Manager authority is supplied by the existing `control.canManage` contract.

For each CE-owned source, Snake can:

- inspect source id/type/contribution
- suppress that exact granular source
- re-enable it when that exact source was persistently suppressed by the manager

The mutation path is reused unchanged:

`Snake action -> runtime.templates.suppressions.setSuppressed -> useCharacterSourceSuppressions -> Oracle -> Shapoklyak -> set_character_source_suppressed -> runtime invalidation -> CE`.

Snake never writes Supabase directly.

## Suppressed-row visibility

Stage 6 extends the proficiency read-model with the pre-suppression Character Runtime contributions and source graph.

A fully suppressed proficiency stays visible as a muted tag instead of disappearing. It is excluded from the effective panel counter because CE no longer grants the mechanic.

This also prevents legacy `character_sheets.proficiencies` fallback from resurrecting a CE-owned proficiency after a GM suppresses it.

## Parent suppression safety

A child proficiency can be suppressed because an ancestor source is disabled.

Stage 6 exposes that fact but deliberately does not re-enable the ancestor from the child tag. Doing so could reactivate unrelated class/subclass mechanics. The source control is shown disabled with an explanation instead.

Only a directly manager-suppressed granular source receives the local `Включить источник` action.

## Database

No Stage 6 migration is required.

The canonical `character_source_suppressions` persistence and Oracle/Shapoklyak command path already exist and are shared with the Abilities tab.
