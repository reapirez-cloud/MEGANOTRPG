# AI Survival Stage 4 — Certification

Date: 2026-09-25

Stage 4 closes the four-stage AI Survival implementation contract.

## Certified invariants

- Shared-scene time uses the runtime-authoritative set of physically present alive PCs captured before post-turn mutation.
- Split-party characters are not added to the shared turn and retain independent exact clocks.
- Shared-scene participants converge to the latest participant minute, then all receive the same elapsed turn duration.
- Ordinary scene duration remains server-limited to five minutes.
- Survival receipt identity is revision-scoped. Repeating the same revision replays without a second tick; a regenerated revision receives a new command identity.
- Survival mutations register as reversible Stage 11 turn effects.
- Undo/supersede restores exact room and character time, hunger, fatigue, fractional depletion remainders, touched character resources, rest/preparation sessions, and rollback-covered inventory.
- Fully consumed food is restored with its original inventory item UUID on rollback.
- Long-rest rollback restores the selected character-sheet/rest state captured before the turn.
- Junior post-turn execution cannot choose co-op participants. It receives an immutable participant list authored by the primary runtime.
- Survival mutation RPCs remain service-role only.

## Transactional certification

The following checks were executed against the live database schema inside transactions that ended with ROLLBACK:

| Check | Result |
| --- | --- |
| Single-PC exact-time + survival rollback | PASS |
| Shared-scene convergence + independent pre-turn clocks restored | PASS |
| Full food consumption + same-UUID item restoration | PASS |
| Same-revision retry does not double-advance | PASS |
| New regenerate revision receives a distinct idempotency key | PASS |
| Long-rest time/resource/session rollback | PASS |

No certification fixture is intentionally persisted.

## Operational state

- Database migration: `ai_survival_stage4_coop_rollback_certification_v1`
- Edge runtime: `voss-agent` v118
- Contract status: `certified`
