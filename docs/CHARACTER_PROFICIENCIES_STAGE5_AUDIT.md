# Character Proficiencies — Stage 5 class coverage audit

Date: 2026-09-19  
Branch: dev

## Scope

This certification is deliberately narrower than whole-class Mechanics READY.

It certifies only the five Владения panels:

- weapon proficiencies
- armor proficiencies
- tool proficiencies
- languages
- saving-throw proficiencies

Skill proficiencies remain a separate character-sheet concern and are not counted as a Stage 5 screen blocker.

## Roster contract

The project roster is fixed at 13 stable class identities.

Certified proficiency runtime:
- Fighter
- Cleric
- Druid
- Wizard
- Bard
- Monk
- Paladin
- Sorcerer
- Warlock

Mechanics-pending placeholders:
- Rogue
- Barbarian
- Ranger
- Artificer

Pending entries intentionally contain no invented grants. When their CE packages arrive, Stage 5 requires a data/coverage update only; the five-panel renderer does not change.

## Live audit finding

Before Stage 5, seven current class packages already exposed their base five-panel grants in the connected Supabase runtime.

Monk and Warlock were the only current classes with authored `rules_meta.core_traits` proficiency data but no corresponding base CE grants.

Monk authored core traits:
- saving throws: Strength, Dexterity
- armor: none
- weapons: simple weapons plus martial weapons with the Light property

Warlock authored core traits:
- saving throws: Wisdom, Charisma
- armor: light armor
- weapons: simple weapons

Stage 5 therefore restores those exact authored baselines. It does not infer rules from prose or external rules sources.

## Persistence policy

The forward migrations append only missing grants and are idempotent.

They do not:
- rewrite `selected_choices`
- mutate Choice Runtime v2 receipts
- change class levels
- add skill choices
- change whole-class READY status

The same repair is installed for future campaigns through campaign triggers that first ensure the corresponding class catalog row exists.

## Coverage source

Machine-readable roster and expected five-panel baselines:
`src/ui-v1-isolated/characterProficiencyClassCoverage.ts`.
