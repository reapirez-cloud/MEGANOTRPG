# MEGANOTRPG engine closure gate

This document defines the point at which the engine foundation may be called **WORKING** rather than merely "in development".

The product can keep growing after this gate. The gate is about the integrity of the engine core.

## Required command paths

Normal gameplay:

```text
Player / gameplay UI
  -> GENA
  -> explicit owning engine
  -> canonical persisted state
  -> character/world invalidation
  -> runtime resolver/projections
  -> CE where character mechanics are affected
  -> Sheet / Chat / Revolver presentation
```

GM authority:

```text
GM Cabinet
  -> Oracle
  -> explicit owning engine
  -> canonical persisted state
  -> invalidation
  -> fresh read model / CE resolution
  -> presentation
```

Oracle must never depend on GENA. UI must not be canonical inter-engine transport.

## Required ownership

- CE: deterministic character calculation only; no persistence.
- GENA: gameplay/session orchestration and gameplay command correlation.
- Oracle: imperative GM entry point; no state, no gameplay legality checks.
- Tobik: authoritative random dice resolution.
- Shapoklyak: PC/NPC identity and canonical character assignment/lifecycle state.
- Cheburashka: inventory instances, equipment, charges, quantities and transfers.
- Larisa: runtime world state, discovery, positions, scenes, location/map topology.
- Chasovoy: reusable authored definitions/reference content.

## Closure criteria

The engine foundation is WORKING only when all of these are true:

1. `dev` passes Build, Lint and Tests on its exact HEAD.
2. The live Supabase schema contains every required owner RPC used by the current runtime.
3. Character template assignment/removal is an owner operation in Shapoklyak and is reachable through Oracle for GM authority.
4. Class assignment plus class sheet-profile synchronization is atomic on the server.
5. Character-affecting owner mutations request a fresh character resolution; definition revisions can invalidate the campaign.
6. Chat, Sheet and Revolver consume the shared character runtime resolver/read model rather than constructing incompatible CE snapshots independently.
7. Gameplay rests/recovery go through GENA and complete with a fresh character invalidation.
8. GM lifecycle/HP/assignment/inventory/world edits use Oracle -> owner paths where an owner contract exists.
9. No canonical random roll bypasses Tobik.
10. Failure of a character read/resolve reaches a finite error or stale state; indefinite loading is not a valid steady state.
11. Integration tests cover at least: item use, GM HP/lifecycle, rest/recovery, template assignment, owner invalidation, and Oracle/GENA separation.
12. A reload after successful mutation reconstructs the same canonical result from persistence.

## Not required to close the engine foundation

- every class/subclass/race/feat being authored;
- final visual redesign of every screen;
- tactical scene simulation, automatic HP damage application or action-economy policing;
- every future world/map editing feature;
- removal of every historical migration file.

Those are product/content capabilities built on top of the closed engine foundation.
