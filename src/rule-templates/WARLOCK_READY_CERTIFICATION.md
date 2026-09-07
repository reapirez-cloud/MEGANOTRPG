# Warlock READY certification — 2026-09-07

Developer-only certification. This file is not runtime data and must never be rendered in player UI.

## Final status

**Class:** `class:warlock`  
**Text:** `READY`  
**Mechanics/runtime:** `READY`  
**Production:** `DEPLOYED_AND_CERTIFIED_2026_09_07`

This certification closes the four-stage Warlock readiness plan. The supported runtime boundary is the base Warlock plus nine runtime-backed patrons. Raven Queen, Seeker and Great Wyrm remain explicitly literary/reference-only and are outside this certification.

## Certified runtime roster

### Base class

- Player's Handbook 2024 Warlock runtime is active under `class:warlock`.
- Production base catalog revision: `xphb-2024-warlock-ui-qa-v1`.
- Pact Magic progression is implemented through Warlock levels 1–20.
- Pact slots use the persistent CE resource `warlock_pact_slots`, recover fully on Short Rest and Long Rest, and are spent by the authoritative Pact Magic RPC.
- Magical Cunning, Eldritch Master, Contact Patron and Mystic Arcanum 6–9 use structured CE resources/actions/choices where the application owns durable state.
- All 28 supported Eldritch Invocations are runtime-backed through the generic Choice Runtime v2 contract, including prerequisites, repeatable selector instances, one-per-level-change replacement and dependent Pact of the Tome choices.

### PHB 2024 patrons

Runtime revision: `xphb-2024-warlock-subclasses-runtime-v1`.

1. `subclass:warlock:archfey`
2. `subclass:warlock:celestial`
3. `subclass:warlock:fiend`
4. `subclass:warlock:great-old-one`

### Supplemental patrons

Runtime revision: `warlock-supplemental-runtime-v1`.

1. `subclass:warlock:hexblade`
2. `subclass:warlock:fathomless`
3. `subclass:warlock:genie`
4. `subclass:warlock:undead`
5. `subclass:warlock:undying`

All nine patrons are active children of `class:warlock` and unlock from Warlock level 3. The five supplemental patrons expose their finite resources/actions through the same parser → Character Engine → persistence contract as the base class.

## Supplemental patron spell closure

Final production migration: `20260907125000_warlock_ready_stage4_source_gated_spells.sql`.

The migration closes the last known runtime defect: supplemental expanded patron spell lists are not globally available to every Warlock.

- `option_rules.source_requirements_any` is attached to source-dependent Warlock spell choices.
- Hexblade `Shield` requires an active `subclass:warlock:hexblade` source.
- Genie subtype spells require both `subclass:warlock:genie` and the matching persistent `warlock_genie_patron_kind` option. Production verification explicitly confirmed the Dao gate on `Sanctuary`.
- Stale selected patron spells become mechanically inert when their required patron/source disappears.
- `private.character_meets_choice_source_requirements_v1(uuid,jsonb)` provides the shared source-requirement primitive.
- `character_choice_source_requirements_v1` rejects invalid persisted source-dependent choices at the database boundary.
- `public.cast_warlock_pact_spell_v1` and `public.use_character_template_spell_v1` revalidate source requirements server-side so UI filtering is not an authority boundary.
- Six legacy spell identities required by the supplemental packages are present in production: `wrathful-smite`, `branding-smite`, `staggering-smite`, `banishing-smite`, `bigbys-hand`, `feign-death`.

## End-to-end verification

Stage 3 certification already completed a production-safe 1–20 run at levels `1, 2, 3, 5, 7, 9, 11, 13, 15, 17, 19, 20`, including all nine patrons, Pact Magic spend/recovery, Mystic Arcanum recovery, subclass level following and cleanup of the temporary test character.

Final code gate:

- GitHub Actions CI run `#1863` (`34132411173`) on commit `9ae81b7f189a69f9f1f8295c89af6dd36f2782b1` passed Build, Lint and the complete test suite.
- Warlock package regressions cover the base class, Pact Magic selection/casting, all 28 invocations, Mystic Arcanum, the four PHB patrons, the five supplemental patrons, the nine-patron reference boundary and source-gated supplemental spell access.
- The final source-gate regression is `tests/warlockReadyStage4SupplementalSpellAccess.test.ts`.

## Production audit

Post-deployment SQL verification on 2026-09-07 confirmed:

- active Warlock base templates: `1`;
- active runtime patrons: `9`;
- patrons unlocking at Warlock level 3: `9/9`;
- supplemental patrons with expanded-spell runtime metadata: `5/5`;
- active duplicate Warlock catalog keys: `0`;
- orphan Warlock subclasses: `0`;
- source-gate function installed: yes;
- source-gate validation trigger installed: yes;
- `Shield` Hexblade gate: yes;
- `Sanctuary` Genie/Dao gate: yes;
- seeded supplemental legacy spell identities present: `6/6`;
- source-gate revision: `warlock-ready-stage4-source-gated-spells-v1`.

Supabase security and performance advisors were run after deployment. They continue to report project-wide pre-existing RLS/SECURITY DEFINER/index debt. No Warlock-specific advisor finding invalidates the certified runtime. The public Warlock gameplay RPC is intentionally authenticated and performs `auth.uid()` plus `can_operate_character_resources` authorization before mutating resources.

## GM adjudication boundary

READY does not mean the application invents combat state it does not own. Target legality, hit/kill/nearby-creature facts, reaction timing, once-per-turn legality, scene positioning and randomized cooldown facts without authoritative app state remain GM-adjudicated under `GM_ADJUDICATION_BOUNDARY.md`. No fake CE counters were introduced to simulate them.

## Reference boundary

Runtime-backed and player-visible as implemented:

- base Warlock;
- Archfey;
- Celestial;
- Fiend;
- Great Old One;
- Hexblade;
- Fathomless;
- Genie;
- Undead;
- Undying.

Literary/reference-only, outside READY runtime scope:

- Raven Queen;
- Seeker;
- Great Wyrm.

## Certification result

The supported Warlock package has no known class-specific implementation, persistence, deployment or source-eligibility blockers. GitHub runtime, player-facing runtime roster and production Supabase agree on the supported nine-patron boundary.

**Warlock mechanics/runtime is `READY` as of 2026-09-07.**
