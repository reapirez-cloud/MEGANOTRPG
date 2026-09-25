# AI Survival — Master Roadmap

> Scope: experimental AI-world campaigns only.
>
> Machine-readable implementation contract: `src/ai-survival/contract.ts`.
>
> Keep this roadmap at four stages. Do not split normal implementation/testing work into artificial micro-stages.

## Locked product rules

### Two independent survival tracks

The character has two canonical 0–100 resources:

- `survival_satiety` — **Сытость**. Low value means hunger.
- `survival_alertness` — **Бодрость**. Low value means fatigue/sleep pressure.

Each resource derives its own stage:

| Value | Stage | Roll pressure |
| ---: | ---: | --- |
| 51–100 | 0 | none |
| 26–50 | I | disadvantage |
| 11–25 | II | disadvantage + -5 |
| 0–10 | III | disadvantage + -7 |

Hunger and fatigue are separate statuses and must remain separately visible in UI, AI context and roll provenance.

They **do not numerically stack with each other**. Survival roll pressure is one non-stacking channel:

- disadvantage is applied at most once;
- flat penalty is the worse active survival penalty, never their sum;
- Hunger III + Fatigue III therefore resolves to disadvantage + -7, not -14;
- both source statuses still remain visible in the roll explanation.

MVP adds no hidden extra penalty merely because both tracks are active.

### Exact world time

AI-world time has a canonical `campaign_minute` clock.

Legacy `campaign_day/day_period` remain as compatibility projections while older systems are migrated.

Initial period mapping:

- deep_night: 00:00–04:59
- dawn: 05:00–06:59
- morning: 07:00–10:59
- day: 11:00–14:59
- late_day: 15:00–17:59
- evening: 18:00–21:59
- night: 22:00–23:59

Normal conversational scene advancement is capped at +5 minutes.
Long actions, travel and sleep use explicit elapsed duration.

Initial tuning constants are deliberately centralized and versionable:

- satiety 100 -> 0 in 48 hours without food;
- alertness 100 -> 0 in 72 hours continuously awake.

Sub-minute resource fractions are carried server-side so repeated five-minute scenes cannot round survival drain to zero forever.

### AI authority boundary

The AI may decide semantic facts such as:

- how much fictional time an action reasonably consumed;
- whether the player actually ate;
- how filling the consumed food was;
- how long the player slept;
- whether the fiction established a short/long rest.

The AI does **not** calculate survival stages, d20 disadvantage or numeric penalties. The server owns those mechanics.

## Stage 1 — Minute clock + Survival Core

**Status: IMPLEMENTED — 2026-09-25**

Implement:

- canonical `campaign_minute` on character and scene world state;
- compatibility projection to/from `campaign_day/day_period`;
- minute-aware colocated-player catch-up;
- `survival_satiety` and `survival_alertness` resources;
- high-resolution depletion remainders;
- independent hunger/fatigue stage calculation;
- one non-stacking survival roll-pressure contract;
- generic Character Engine resource conditions.

Idle-life catch-up deliberately does not drain survival. A lagging player being synchronized is assumed to have lived routine ordinary life off-screen.

Done when minute state is authoritative, survival can tick deterministically, and both statuses can be evaluated without involving an LLM.

## Stage 2 — D20 + food + sleep/rest mechanics

**Status: IMPLEMENTED — 2026-09-25**

Implemented as one mechanical layer:

- universal `normal / advantage / disadvantage` d20 mode;
- survival pressure applied to all intended d20 tests through the authoritative roll path;
- payload/provenance preserving both hunger and fatigue sources;
- atomic food consumption + satiety restoration;
- AI-supplied food restoration bounded by server to 0–100;
- sleep duration + alertness restoration;
- short/long rest advancing real game time;
- dawn crossing processed from exact time;
- optional canonical `travel_minutes` on location transitions;
- bounded AI-directed extra satiety/alertness depletion for genuinely heavy exertion.

Food amount is a semantic AI decision over a real canonical inventory item, while the server owns the 0–100 bounds and atomic consume+restore transaction. Heavy exertion may only deplete through bounded `extra_*_depletion`; the AI never writes resource values directly.

## Stage 3 — AI GM + player status drawer

**Status: IMPLEMENTED — 2026-09-25**

AI-world only:

- replace the left GM drawer with a player status drawer;
- show exact time, day/period, current location, satiety, alertness and active survival stages;
- keep the old GM drawer unchanged in human-GM campaigns;
- primary GM emits structured elapsed-time semantics;
- ordinary scene advancement is server-capped to 0–5 minutes;
- long action / travel / sleep use explicit reasoned durations;
- post-turn junior commits one deterministic time/survival mutation;
- AI context receives exact time and both survival tracks.

The player never manually presses “give rest” in an AI-run world. The AI/runtime owns that event.

## Stage 4 — Cooperative time + rollback + certification

**Status: CERTIFIED — 2026-09-25**

Operational safety completed:

- shared scene advances the runtime-authoritative physically present PC set coherently;
- split parties keep independent exact clocks;
- colocated convergence keeps idle-life semantics;
- retry inside one revision replays the receipt without advancing time twice;
- regenerate uses a new revision-scoped idempotency key after the old revision is rolled back;
- undo/revision rolls back room/character time, hunger, fatigue, depletion remainders, food consumption, rest resources and rest/preparation sessions together;
- long actions crossing dawn/day boundaries remain idempotent;
- transactional certification covers single-PC rollback, co-op convergence, full food restoration, long-rest restoration and regenerate idempotency;
- Stage 4 certification closes the four-stage survival implementation contract.

## Explicit non-goals for MVP

Do not add a survival spreadsheet nobody asked for.

MVP intentionally excludes:

- calories/macros;
- hydration;
- weather exposure damage;
- body temperature;
- detailed encumbrance survival;
- disease simulation.

Those can reuse the same resource/status framework later if the game actually needs them.
