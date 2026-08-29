# INTERNAL: Class work status ledger

> **REQUIRED MAINTENANCE FILE — developer/agent only. Never render or import this file into player UI.**
>
> This file is the canonical checkpoint for class/subclass work. Any task that changes, audits, reopens, or closes a class/subclass layer MUST update this ledger in the same work session/commit series. Do not infer completion from migration names, old chat context, CI, or comments elsewhere.

## Mandatory update rule

Before touching a class or subclass:
1. Read this file and `CLASS_INTEGRATION_NOTES.md`.
2. Mark the layer being changed `IN_PROGRESS` if a previously closed layer is reopened.
3. Do the work.
4. Update this file before finishing: what changed, what is closed, what remains, and which layer must be audited next.
5. Never promote one layer because another layer is ready. **TEXT READY does not mean MECHANICS READY.**

Allowed statuses:
- `NOT_STARTED` — work has not begun.
- `IN_PROGRESS` — currently being built/audited or reopened by new work.
- `READY` — the declared layer was explicitly audited and has no known text blockers in its declared scope.
- `BLOCKED` — known blocker prevents closure; record it below.
- `NOT_AUDITED` — implementation may exist, but this layer has not been formally checked and must not be called ready.

When a future migration touches class/subclass content, add/update an internal header similar to:

```text
-- CLASS_WORK_STATUS: fighter:text=READY;mechanics=NOT_AUDITED
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
```

These are project-state markers, not player rules.

---

## Fighter (`class:fighter`)

**Overall project label:** `TEXT READY`  
**Gameplay mechanics/runtime label:** `NOT_AUDITED`

- `text_status: READY`
- `mechanics_status: NOT_AUDITED`
- `last_text_audit: 2026-08-29`
- `reference_delivery: SYNCED_2026_08_29`
- `reference_ui: tappable full-rule cards; list cards are previews and open a dedicated full rule view`
- `production_delivery_rule: the reference text sync migration may update presentation text and metadata only; it must not promote or rewrite choices/resources/actions/formulas/effects/CE dependencies`
- `text_scope: base Fighter levels 1–20 + every currently catalogued Fighter subclass + nested selectable rules (Arcane Shots, Battle Master maneuvers, Rune Knight runes) + Voss comments + GM-facing summaries/descriptions`
- `text_definition_of_ready: a player/GM must be able to understand trigger/activation, cost, target, exact effect, numbers/dice/DC/range, duration and limits/recharge from the user-facing rule text whenever those parts apply; no "расширяет/усиливает возможности" placeholders`
- `next_required_audit: full Fighter mechanics/runtime audit`

### Fighter subclasses — text layer

- Arcane Archer — `READY`
- Battle Master — `READY`
- Cavalier — `READY`
- Champion — `READY`
- Echo Knight — `READY`
- Eldritch Knight — `READY`
- Psi Warrior — `READY`
- Banneret — `READY`
- Rune Knight — `READY`
- Samurai — `READY`

### Known mechanics-only follow-up

These notes **do not reopen the text layer**. They are explicit reminders for the later mechanics audit:

- Echo Knight: verify that `Unleash Incarnation / Воплощение ярости` survives the final migration stack as its own mechanical feature/resource/action. Its full rule is deliberately preserved in the final GM-facing level-3 text even if the mechanical audit later finds a structural omission.
- Eldritch Knight: verify spell-slot/prepared-spell progression, multiclass slot interaction and replacement behavior against the Character Engine. The text pass only makes the intended progression explicit; it does not certify runtime accounting.
- Psi Warrior: the human-facing level-3 reference explicitly documents Protective Field, Psionic Strike and Telekinetic Movement, but their resources/actions/recovery are **not** mechanically certified by this text audit.
- Production legacy structure: the live database may still have empty/legacy choice structures for nested selectable rules. The reference delivery sync intentionally does not mutate those structures; Arcane Shot options, Battle Master maneuvers and Rune Knight runes are therefore included in full human-readable reference text until the mechanics audit addresses structure separately.
- All Fighter subclasses: finite resources, actions, formulas, replacement semantics, source suppression and runtime triggers remain outside this closure.

### What “READY” means here

The green/ready mark is permitted **only for Fighter descriptions/reference copy**. Do not describe the Fighter package as mechanically complete until `mechanics_status` is separately changed to `READY` after a dedicated audit.

---

## Druid (`class:druid`)

- `text_status: IN_PROGRESS`
- `mechanics_status: NOT_AUDITED`
- `text_scope_in_progress: static base-class reference + all eight catalogued circles + selectable/variant rule text + Voss comments + GM-facing summaries/descriptions`
- `audit_started: 2026-08-29`
- `known_boundary: this pass may rewrite presentation copy only; it must not silently move subclass levels, alter Wild Shape runtime, choices, resources, actions, formulas, source suppression, spell-slot accounting or CE dependencies`
- `next_required_audit: finish Druid text closure, then run a separate Druid mechanics/runtime audit`

---

## Cleric (`class:cleric`)

- `text_status: IN_PROGRESS`
- `mechanics_status: NOT_AUDITED`
- `note: extensive GM-facing text exists, but this ledger has not yet recorded a dedicated final closure pass equivalent to Fighter`
- `next_required_audit: finish/confirm Cleric text closure, then audit mechanics separately`

---

## Other classes

Add an explicit section when work begins. Absence from this ledger means **no completion claim may be inferred**.
