# Stage 17 — Canon-bound intent adjudication and real player rolls

Status: PLANNED

This stage exists because a player d20 answers **how well the character performs an action**. It does not get to decide whether an unstated world fact suddenly exists.

## Core invariant

The AI GM evaluates the player's declared intent against the current canonical scene **before any player roll is made**.

The server persists that adjudication before exposing the roll request. After the d20 exists, neither the model nor a retry may change the difficulty, exact-goal permission, canonical evidence fingerprint or outcome envelope.


## Primary GM does not need the application API

The primary GM should think like a tabletop GM, not like a Supabase client.

It may semantically request any ordinary D&D-style check that follows from fiction, for example:

- strong alcohol -> Constitution check/save;
- forced march, climbing or swimming -> appropriate Strength/Constitution/Athletics check;
- reading an NPC -> Insight;
- tracking -> Survival;
- noticing hidden detail -> Perception;
- searching carefully -> Investigation where appropriate;
- recalling plausible lore -> the relevant Intelligence check;
- resisting fear/poison/charm -> the appropriate save;
- other normal checks when the fiction and rules justify them.

The primary GM does **not** need to know the RPC name, database schema, UI widget, modifier lookup or exact application call.

It emits a bounded semantic mechanic directive.

A smaller mechanic worker receives:
- the semantic directive;
- target character;
- current canonical character mechanics;
- current scene context;
- the frozen pre-roll adjudication.

That worker normalizes the request into the existing server roll system.

The server remains authoritative for the real modifier and real d20.

This also means we do not need to stuff the primary GM prompt with application tool documentation merely so it can ask for a Constitution check.

## Separate two kinds of uncertainty

### World existence

Questions such as these are world-state questions:

- Is there actually a hut in this forest?
- Is a dragon currently present here?
- Does this locked drawer contain a particular named artifact?

A player skill roll cannot create the answer.

The answer must come from one of:

1. existing canon;
2. an already materialized hidden fact;
3. when genuinely unresolved and appropriate, a Stage 11 World Resolver decision committed **before** the player check.

If none establishes the requested target, the exact target is not treated as present merely because the player searches well.

### Character performance

Once the target/opportunity is canonically possible, the player may need a real check:

- finding a known hidden trail;
- spotting a hut that canon says exists;
- tracking a known creature;
- forcing a difficult door;
- recalling information the character could plausibly know.

The AI GM chooses the check and difficulty from circumstances and canon, then the server freezes them before the d20.

## Adjudication modes

Every declared intent resolves to one of four modes:

- `deterministic_success` — no roll; the action simply works.
- `deterministic_failure` — no roll; canon/physics makes it fail.
- `check` — a real player d20 is required with a precommitted DC and outcome envelope.
- `impossible_exact` — the exact requested result is unavailable. A roll is optional only when failure/exceptional effort can still reveal something useful. Natural 20 may unlock **partial success only**.

`impossible_exact` is not DC 30 disguised as possibility. The exact goal stays false even on natural 20.

## Difficulty

For `check`, the AI GM chooses the DC from the current situation, not from player wording and not from the future roll.

A normal rubric may use familiar anchors such as 5 / 10 / 15 / 20 / 25 / 30, but the important artifact is the persisted reasoning/evidence that made the selected DC appropriate.

The server validates the allowed numeric range and freezes the selected value.

## Natural 20 and impossible goals

Natural 20 does not summon missing canon.

Example: player says, “I search the forest for a hut.”

- If canon says the hut exists here: normal search check.
- If canon says no hut exists: exact result is impossible.
- If there is no canonical hut at all: the skill roll cannot invent one.
- A natural 20 may produce a precommitted partial result such as finding a rock overhang, ruined foundation, smoke from a distant camp, old human tracks or another plausible lead.

Example: player says, “I search this ordinary forest for a dragon.”

If no dragon is established here, even a natural 20 does not spawn one. A bounded partial result could be an unusually large reptile track, a carved dragon symbol, scorched wood with another plausible cause, a witness rumor, or another clue that does **not** assert a dragon exists.

The partial-success envelope is fixed before the roll. The GM cannot see 20 and then decide retroactively that the dragon was there after all.

## Persisted receipt

The Stage 17 receipt must be created before the existing player-roll request and contain at minimum:

- campaign / room / GM job / character;
- source message and intent fingerprint;
- scene/canon evidence fingerprint;
- concise evidence references or snapshot identifiers;
- adjudication mode;
- exact goal description;
- whether exact goal is allowed;
- request type / ability / skill / attack kind when applicable;
- DC and DC visibility for normal checks;
- natural-20 policy;
- frozen success / failure / partial-success envelopes;
- creation timestamp and immutable fingerprint.

The existing `pending_player_roll_requests` row must reference this receipt.

## Resume

After the real player roll:

1. server resolves the existing d20 normally;
2. server maps it through the frozen adjudication;
3. GM resumes with the adjudication + actual roll + server-resolved outcome class;
4. GM narrates inside that outcome and cannot promote a partial result into an exact success.

## Explicit anti-patterns

Stage 17 is **not complete** if:

- only the system prompt says “be logical”;
- the model can silently alter DC after the d20;
- natural 20 automatically succeeds on impossible exact goals;
- an Investigation/Survival/Perception roll creates a hut, dragon, NPC or item that was not established;
- every player sentence triggers a roll;
- world-existence randomness and player skill are collapsed into one die.

## Certification examples

1. Known hidden hut -> Survival check DC frozen before roll -> real player d20 -> normal success/failure.
2. No established hut -> impossible_exact -> natural 20 -> useful partial result, still no hut.
3. No established dragon -> impossible_exact -> natural 20 -> bounded clue/analogue, no dragon entity and no dragon fact.
4. Deterministic open door -> no roll.
5. Canonically sealed impossible door -> deterministic failure unless another mechanic changes the situation.
6. Genuinely unresolved world existence -> Stage 11 d100 resolves existence first -> only then, if present and still nontrivial to locate, player skill check happens.
