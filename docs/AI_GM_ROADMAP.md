# AI GM Roadmap

This file is the persistent stage counter for the AI GM implementation.
Update it when a stage actually reaches READY. Do not skip stage numbers.

| Stage | Status | Scope |
| --- | --- | --- |
| 1 | READY | Durable AI GM turn in the canonical game chat |
| 2 | READY | Canonical 50-message context, split-party awareness and PC autonomy |
| 3 | READY | 45-message reconcile/archive worker with watermark |
| 4 | READY | Player pending-turn queue: action + bonus action + movement + text |
| 5 | READY | Durable player roll requests and hard wait/resume |
| 6 | READY | Canonical NPC attacks, rolls, abilities and resources |
| 7 | READY | Multi-message Narrator/NPC dialogue tool flow |
| 8 | READY | Short rest, long rest, dawn and game-time recovery |
| 9 | READY | NPC/location art lifecycle and chat media publication |
| 10 | READY | Campaign GM model selector and AI button |
| 11 | READY | Regenerate, edit/retry and undo ledger |
| 12 | TODO | Final READY audit, concurrency, RLS, long-campaign certification |

## Cross-cutting cooperative debt

These are not extra numbered stages. They remain explicit in `src/ai/aiGmReadinessDebt.ts` until their owning stage closes them.

- Per-location/scene sequencing for split parties.
- Explicit PC→PC recipient/audience metadata.
- No AI speech or decisions for player characters.
- No information leakage between different locations without a canonical communication path.

## Current pointer

**Stage 11 is READY. READY stages: 1–11. Next stage to execute: 12.**
