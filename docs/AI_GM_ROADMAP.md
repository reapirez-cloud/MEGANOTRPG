# AI GM Roadmap

This file is the persistent stage counter for the AI GM implementation.
Update it when a stage actually reaches READY. Do not skip stage numbers.

| Stage | Status | Scope |
| --- | --- | --- |
| 1 | READY | Durable AI GM turn in the canonical game chat |
| 2 | READY | Canonical 50-message context, split-party awareness and PC autonomy |
| 3 | READY | 45-message reconcile/archive worker with watermark |
| 4 | READY | Declarative player turn composer: ordered action/bonus/movement/reaction plan, final-Send seal, interruptible execution |
| 5 | READY | Durable player roll requests and hard wait/resume |
| 6 | READY | Canonical NPC attacks, rolls, abilities and resources |
| 7 | READY | Multi-message Narrator/NPC dialogue tool flow |
| 8 | READY | Short rest, long rest, dawn and game-time recovery |
| 9 | READY | NPC/location art lifecycle and chat media publication |
| 10 | READY | Campaign GM + junior-worker model selectors and AI button |
| 11 | READY | Regenerate, edit/retry and undo ledger |
| 12 | READY | Final READY audit, concurrency, RLS, long-campaign certification |

## Cross-cutting cooperative certification

Stage 12 closed the remaining cooperative contracts:
- explicit shared-scene sequencing with free-play concurrency outside shared scenes;
- explicit PC→PC audience metadata with server validation and RLS;
- no AI speech or decisions for player characters;
- persistent latest-50 chat context across location changes with physical-presence snapshots.

## Model-selector extension — 2026-09-24

- MiMo V2.5 Pro (`mimo-v2.5-pro`) is registered as a 1M campaign agent and runs with `reasoning_effort=high`.
- The primary GM selector can use MiMo alongside the existing GM-capable models.
- AI-world campaigns have a separate `junior` model setting.
- Junior choices are intentionally bounded to DeepSeek V4.1 Flash and MiMo V2.5 Pro.
- The same junior setting drives blocking materialization, mechanic normalization, Stage 18 post-turn commits, daily background simulation and 45-message maintenance.
- Daily background runs freeze the selected junior model when the run is reserved so a mid-run setting change cannot alter replay semantics.

## Interruptible-turn and NPC-resistance hardening — 2026-09-24

- Clicking an AI-world player ability, spell, item or roll only appends a draft plan entry. It does not wake the AI GM, roll dice or spend resources.
- Final Send creates one sealed turn declaration. The GM then advances legal components one at a time and may stop the remaining sequence at a real world/NPC intervention window.
- Reactions are declared with a trigger condition and spend only when the trigger actually occurs.
- Social checks now require situational leverage analysis; meaningless pressure is allowed to fail without a decorative roll.
- Sparse persistent NPC identity can be completed by a tactic-blind junior refiner that cannot overwrite already established identity.

## Current pointer

**Stage 12 is READY. READY stages: 1–12. AI GM roadmap complete.**
