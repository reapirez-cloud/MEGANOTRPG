# Character Proficiencies — Stage 4 canonical integration audit

Date: 2026-09-19  
Branch: dev

## Result

Stage 4 closes the parser → Character Engine → resolved contract → read-model path for the five proficiency panels without rewriting persistent choice identities.

Canonicalization happens when a source emits a CE grant. Historical persistence values remain untouched so existing `selected_choices`, Choice Runtime v2 instances and receipts keep their durable identity.

## Live Supabase findings before the fix

The connected project already contains many canonical keys, but active packages also contain historical aliases:

- `category:heavy_armor` alongside `armor:heavy`
- `category:martial_weapons` alongside `weapon:martial`
- `tool:herbalism_kit` alongside `tool:herbalism-kit`
- `tool:smith_tools` alongside `tool:smith-tools`
- `tool:brewers_supplies` alongside `tool:brewer-supplies`
- `weapon:war_pick` alongside `weapon:war-pick`
- `language:common` style options alongside unprefixed language keys

Skill proficiency keys such as `skill:perception` are canonical CE data but are intentionally outside the five-panel Владения screen.

Current live rule-template kinds are class/subclass. Race/subrace support already uses the same generic resolver contract; the Stage 4 integration test covers it synthetically so future packages do not need UI changes.

Current character feature rows contain class/racial/general feature kinds, but no live feature-owned proficiency/language mechanics were found in the sampled production rows. The generic feature mechanic path is covered for background/feat/effect sources by Stage 4 tests.

## Implementation

- `src/lib/proficiencyIdentity.ts` canonicalizes emitted proficiency/language CE keys.
- Stored mechanics use canonical emitted keys without mutating their persistence records.
- Template choices preserve stored option identity/variant identity while emitting canonical CE grant keys.
- Explicit choice labels are carried into CE payloads.
- Grant Engine preserves proficiency labels while still merging rank by maximum.
- Read-model defensively canonicalizes resolved grants and ignores canonical `skill:*` keys instead of reporting false diagnostics.
- Open catalogs now contain presentation labels for the standard weapon/tool/language identities already present in active package choices.

## Deliberate non-migration

No Supabase JSON rewrite is part of Stage 4.

Rewriting active choice option ids alone would invalidate existing `character_template_assignments.selected_choices` and Choice Runtime v2 stored instances unless every durable selection/receipt were migrated atomically. Runtime canonicalization gives the desired CE contract without that risk.

A later data-cleanup migration may normalize persistence identities only if it also migrates every durable choice representation and server validator in one transaction.

## Exit criteria

- class grants: canonical path covered
- subclass grants: canonical path covered
- race/subrace grants: generic path covered
- background feature mechanics: generic path covered
- feat mechanics: generic path covered
- effect mechanics: generic path covered
- template choices: canonical emitted key + durable stored identity covered
- legacy sheet fields: fallback only
- renderer: source-agnostic and unchanged
