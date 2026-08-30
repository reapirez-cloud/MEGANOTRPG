# Engine Runtime Integration

> Status: **ACTIVE ON `dev`**
>
> This document describes how the named engines exchange runtime signals without collapsing their ownership boundaries.

## One graph, two command paths

```text
NORMAL GAMEPLAY
Player / gameplay UI
        |
        v
      GENA ----------------------> TOBIK
        |
        +--------> SHAPOKLYAK
        +--------> CHEBURASHKA
        +--------> LARISA

GM REALITY OVERRIDE
GM Cabinet
    |
    v
 ORACLE
    +--------> SHAPOKLYAK
    +--------> CHEBURASHKA
    +--------> LARISA
    +--------> CHASOVOY
```

Oracle is not a Gena facade and Gena is not in the Oracle path. Oracle directly addresses the owner selected by its explicit method. Gena remains the gameplay/session orchestrator.

## Shared nervous system

Domain engines do not import one another just to announce changes. Production runtimes publish their existing `EngineEvent` contracts into one ephemeral `EngineEventBus`.

```text
SHAPOKLYAK ----+
CHEBURASHKA ---+
LARISA --------+----> EngineEventBus ----> runtime/UI observers
CHASOVOY ------+
GENA -----------+
```

The bus is intentionally **not canonical storage, not durable history and not a transaction log**. It only distributes already-produced engine events inside the running application. Durable chat/session history and transactional mutations stay in their existing server/database paths.

Consumers may subscribe globally, by engine, or by campaign. This removes the need for React components to act as an engine-to-engine message bus.

## Character Engine invalidation

CE remains pure and has no outbound arrows.

Character-affecting owners request recalculation after committing canonical state:

```text
SHAPOKLYAK ----> CharacterResolutionBus(character) ----+
CHEBURASHKA ---> CharacterResolutionBus(character) ----+--> fresh snapshot assembly --> CE
```

Larisa does not request CE resolution by default because world position and descriptive time are not character mechanics by themselves.

Chasovoy is different. A reusable definition can be referenced by many characters, but Chasovoy must not know those usages. Therefore its definition event is bridged conservatively to campaign-level invalidation:

```text
CHASOVOY
  |
  +--> EngineEventBus: definition.*
                |
                v
      CharacterResolutionBus(campaign)
                |
                v
      mounted character resolvers rebuild fresh snapshots
```

This keeps reference ownership in Chasovoy and reference-usage knowledge outside Chasovoy.

## Composition root

`src/engine-runtime/runtime.ts` exposes the already-composed runtime graph:

- CE resolver;
- Gena and its durable session gateway;
- Tobik;
- Cheburashka;
- Shapoklyak;
- Larisa;
- Chasovoy;
- Oracle;
- shared event and character-resolution signals.

The composition root is **not another engine**. It stores nothing, decides nothing and routes nothing. Its purpose is to stop application adapters from rebuilding the engine graph independently.

## Ownership laws that remain unchanged

1. Oracle never calls Gena.
2. Gena handles normal gameplay intentions and may call domain owners.
3. Oracle handles GM reality overrides and calls domain owners directly.
4. Domain engines mutate only their own canonical state.
5. CE receives an explicit fresh snapshot and never performs I/O.
6. Tobik resolves requested dice; it does not mutate HP or decide scene legality.
7. Larisa world/time signals do not trigger mechanics unless a future explicit projection is introduced.
8. Chasovoy owns definitions, not which concrete character currently uses them.
9. EngineEventBus and CharacterResolutionBus are ephemeral signals, never canonical storage.

## Remaining migration boundary

The named-engine runtime is now connected, but some older product adapters still source canonical inputs through legacy tables/hooks:

- `rule_templates` / character template assignment hooks;
- `character_resource_states` runtime hooks;
- preparation/spell legacy tables;
- the current chat character resolver still assembles part of the CE snapshot inside `useResolvedChatActor`.

These are migration seams, not reasons to let engines import one another. The next consolidation step is to move fresh character snapshot assembly behind a runtime/read-model service so Sheet, Chat and Revolver consume the same resolved contract. Until that migration is complete, legacy adapters must listen to the shared resolution signals and rebuild from fresh data rather than cache a second truth.
