# Artificer runtime plan — 2026-09-21

> Internal implementation contract. Player-facing literary text is intentionally
> deferred: translation, author_description and author_comment will be supplied later.

## Target

Create one clean runtime-backed `class:artificer` using the shared
Chasovoy → Shapoklyak/GENA → Character Engine path, with five supported
subclasses:

1. Alchemist
2. Armorer
3. Artillerist
4. Battle Smith
5. Cartographer

The literary layer is not a mechanics dependency. Blank narrator/translation
fields are allowed until the user provides the final text.

## Current checkpoint

- Stage 1 — source freeze/specification: NOT_STARTED
- Stage 2 — class foundation 1–20 + spellcasting: NOT_STARTED
- Stage 3 — core item/replication runtime: NOT_STARTED
- Stage 4 — remaining base class 1–20: NOT_STARTED
- Stage 5 — subclass wave 1: NOT_STARTED
- Stage 6 — subclass wave 2 + UX/runtime reconciliation: NOT_STARTED
- Stage 7 — final certification: GATE_INSTALLED_BLOCKED

Stage 7 is deliberately fail-closed. The private certifier exists, but it
cannot write READY until the database contains one active builtin Artificer,
20 exact level rows, the exact five-subclass roster, completed Stage 1–6
metadata, coherent choices/actions/resources, spell catalog access and valid
shared RPC permissions.

## Literary policy

- do not invent Voss prose;
- do not invent a Russian literary translation;
- keep author_description / author_comment blank unless supplied by the user;
- exact structured mechanics may be implemented without literary text;
- Stage 7 must never block READY solely because the literary layer is blank.

## Stage 7 runtime revision

`eberron-2025-artificer-runtime-final-v1`

Installed gate:
`private.certify_artificer_runtime_final_v1(uuid)`

The gate is service-role-only and is not auto-invoked while Stages 1–6 are absent.
