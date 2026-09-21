# Artificer Runtime Feature Matrix

> Stage 1 source freeze — 2026-09-21  
> Canonical rules target: **Eberron: Forge of the Artificer (2025)**.  
> Literary policy: translation, `author_description`, `author_comment`, feature explanations and Voss prose remain intentionally blank until supplied by the user.

## Frozen catalog identity

- `class:artificer`
- `subclass:artificer:alchemist`
- `subclass:artificer:armorer`
- `subclass:artificer:artillerist`
- `subclass:artificer:battle-smith`
- `subclass:artificer:cartographer`

No other Artificer subclass is part of the supported runtime target. In particular,
the retired historical `artificer-reanimator` package is outside this roster.

## Base Artificer

| Stable key | Level | Feature | Runtime ownership | Executable contract |
|---|---:|---|---|---|
| `artificer:spellcasting` | 1 | Spellcasting | Shapoklyak + shared spell runtime + CE | Intelligence casting; fixed prepared progression; shared slots; one cantrip replacement after Long Rest. |
| `artificer:tinkers-magic` | 1 | Tinker's Magic | GENA → Cheburashka, projected to CE | Mending plus temporary mundane item creation; uses = INT modifier, min 1; created item expires at next Long Rest. |
| `artificer:replicate-magic-item` | 2 | Replicate Magic Item | Chasovoy definitions + Shapoklyak choices + Cheburashka instances | Persistent known-plan choices; plan tiers 2/6/10/14; Long-Rest loadout creates real magic-item instances; instant attunement when allowed. |
| `artificer:magic-item-tinker` | 6 | Magic Item Tinker | GENA orchestration + Cheburashka + Shapoklyak slots | Charge, Drain and Transmute are authoritative item/slot mutations; temporary gained slot expires at Long Rest. |
| `artificer:flash-of-genius` | 7 | Flash of Genius | Shapoklyak resource + GENA action + CE | Reaction only after failed ability check/save; persistent uses; INT modifier bonus. |
| `artificer:magic-item-adept` | 10 | Magic Item Adept | Cheburashka item state + CE projection | Attunement capacity = 4. |
| `artificer:spell-storing-item` | 11 | Spell-Storing Item | Cheburashka instance + shared spell runtime | Bind one eligible Artificer spell level 1–3 to an item; item exposes a Magic-action casting method; consumed material component disallowed. |
| `artificer:advanced-artifice` | 14 | Advanced Artifice | Cheburashka + Shapoklyak resource recovery | Attunement capacity = 5; Refreshed Genius restores one Flash of Genius use after Short Rest. |
| `artificer:magic-item-master` | 18 | Magic Item Master | Cheburashka item state + CE projection | Attunement capacity = 6. |
| `artificer:soul-of-artifice` | 20 | Soul of Artifice | GENA cross-owner orchestration | Cheat Death destroys chosen Uncommon/Rare replicated items and restores 20 HP per item; Magical Guidance restores all Flash uses after Short Rest while attuned to at least one magic item. |

## Alchemist

| Stable key | Level | Feature | Runtime ownership | Executable contract |
|---|---:|---|---|---|
| `artificer:alchemist:tools-of-the-trade` | 3 | Tools of the Trade | CE grants | Alchemist's Supplies + Herbalism Kit; potion crafting-time modifier. |
| `artificer:alchemist:alchemist-spells` | 3 | Alchemist Spells | Shared spell runtime | Always-prepared subclass spell grants by Artificer level. |
| `artificer:alchemist:experimental-elixir` | 3 | Experimental Elixir | GENA + Cheburashka | Long-Rest random elixir creation; additional slot-paid chosen elixirs; inventory-backed consumables with effect variant. |
| `artificer:alchemist:alchemical-savant` | 5 | Alchemical Savant | CE spell modifier | INT modifier added to one qualifying healing/damage roll when casting through Alchemist's Supplies. |
| `artificer:alchemist:restorative-reagents` | 9 | Restorative Reagents | Shapoklyak resource + shared spell execution | Limited free Lesser Restoration casts; Long-Rest recovery. |
| `artificer:alchemist:chemical-mastery` | 15 | Chemical Mastery | CE + shared spell runtime | Acid/Poison defenses, once-per-turn qualifying Force-damage rider and free daily Tasha's Bubbling Cauldron casting. |

## Armorer

| Stable key | Level | Feature | Runtime ownership | Executable contract |
|---|---:|---|---|---|
| `artificer:armorer:tools-of-the-trade` | 3 | Tools of the Trade | CE grants | Heavy Armor training + Smith's Tools; armor crafting-time modifier. |
| `artificer:armorer:armorer-spells` | 3 | Armorer Spells | Shared spell runtime | Always-prepared subclass spell grants. |
| `artificer:armorer:arcane-armor` | 3 | Arcane Armor | Cheburashka equipped item projection + CE | Bound worn armor ignores Strength requirement for owner, fast don/doff and acts as spellcasting focus. |
| `artificer:armorer:armor-model` | 3 | Armor Model | Shapoklyak rest choice + Cheburashka armor binding | Dreadnaught / Guardian / Infiltrator selection after Short or Long Rest; model contributes weapons/features. |
| `artificer:armorer:extra-attack` | 5 | Extra Attack | CE | Two attacks with Attack action. |
| `artificer:armorer:improved-armorer` | 9 | Improved Armorer | CE + Replicate Magic Item choice provider | Armor Model weapon enhancement plus additional armor-restricted magic-item plan. |
| `artificer:armorer:perfected-armor` | 15 | Perfected Armor | CE + GENA actions | Model-specific high-level Dreadnaught/Guardian/Infiltrator upgrades resolved from current Armor Model choice. |

## Artillerist

| Stable key | Level | Feature | Runtime ownership | Executable contract |
|---|---:|---|---|---|
| `artificer:artillerist:tools-of-the-trade` | 3 | Tools of the Trade | CE grants | Martial Ranged weapon training + Woodcarver's Tools; Wand crafting-time modifier. |
| `artificer:artillerist:artillerist-spells` | 3 | Artillerist Spells | Shared spell runtime | Always-prepared subclass spell grants. |
| `artificer:artillerist:eldritch-cannon` | 3 | Eldritch Cannon | Shapoklyak class construct state + GENA | Small/Tiny cannon creation; Bonus Action activates Flame / Force / Protector mode; no autonomous tactical AI. |
| `artificer:artillerist:arcane-firearm` | 5 | Arcane Firearm | Cheburashka item binding + CE spell modifier | Eligible focus gains +1d8 to one Artificer-spell damage roll cast through it. |
| `artificer:artillerist:explosive-cannon` | 9 | Explosive Cannon | CE + GENA reaction | Cannon modes scale; damaged cannon may detonate as Reaction with Force damage and Dexterity save. |
| `artificer:artillerist:fortified-position` | 15 | Fortified Position | Shapoklyak construct state + CE | Two active cannons, simultaneous Bonus-Action activation and Half Cover aura. |

## Battle Smith

| Stable key | Level | Feature | Runtime ownership | Executable contract |
|---|---:|---|---|---|
| `artificer:battle-smith:tools-of-the-trade` | 3 | Tools of the Trade | CE grants | Martial weapons + Smith's Tools; weapon crafting-time modifier. |
| `artificer:battle-smith:battle-smith-spells` | 3 | Battle Smith Spells | Shared spell runtime | Always-prepared subclass spell grants. |
| `artificer:battle-smith:battle-ready` | 3 | Battle Ready | CE attack modifier | INT can replace STR/DEX for attack/damage with magic weapons; proficient weapons may act as spellcasting focus. |
| `artificer:battle-smith:steel-defender` | 3 | Steel Defender | Shapoklyak companion state + GENA | Scaling Construct companion, same-turn participation, Bonus-Action command and Deflect Attack reaction; no scene-legality AI. |
| `artificer:battle-smith:extra-attack` | 5 | Extra Attack | CE + GENA | Two Attack-action attacks; subclass rule can replace one own attack with defender attack command. |
| `artificer:battle-smith:arcane-jolt` | 9 | Arcane Jolt | Shapoklyak resource + GENA | Limited Long-Rest uses triggered by qualifying hit; choose Force damage or healing. |
| `artificer:battle-smith:improved-defender` | 15 | Improved Defender | CE + GENA | Improves Arcane Jolt and adds Force counter-damage to Steel Defender's Deflect Attack. |

## Cartographer

| Stable key | Level | Feature | Runtime ownership | Executable contract |
|---|---:|---|---|---|
| `artificer:cartographer:tools-of-the-trade` | 3 | Tools of the Trade | CE grants | Calligrapher's Supplies + Cartographer's Tools; Spell Scroll scribing-time modifier. |
| `artificer:cartographer:cartographer-spells` | 3 | Cartographer Spells | Shared spell runtime | Always-prepared subclass spell grants. |
| `artificer:cartographer:adventurers-atlas` | 3 | Adventurer's Atlas | Shapoklyak linked-holder state + CE | Long-Rest linked maps, Initiative die/bonus, holder-location knowledge and targeting metadata. |
| `artificer:cartographer:mapping-magic` | 3 | Mapping Magic | Shapoklyak resource + GENA movement action | Free Faerie Fire uses plus Portal Jump that spends half Speed for short teleport/holder teleport. |
| `artificer:cartographer:guided-precision` | 5 | Guided Precision | CE spell/attack modifier | Once-per-turn INT damage modifier on qualifying spell/attack; damage cannot break own Faerie Fire Concentration. |
| `artificer:cartographer:ingenious-movement` | 9 | Ingenious Movement | GENA reaction rider | Flash of Genius may include a 30-foot teleport for self or willing visible creature within 30 feet. |
| `artificer:cartographer:superior-atlas` | 15 | Superior Atlas | GENA cross-owner orchestration + shared spell runtime | Map destruction at 0 HP restores 2 × Artificer level HP and teleports to another holder; map holder gets one free Find the Path per Long Rest. |

## Progression checkpoints frozen for Stage 2

Spell slots use the Artificer half-caster table and are not recomputed by a local
UI formula. Multiclass spell-slot contribution must use the official Artificer rule,
including Artificer-specific rounding.

Known-plan / created-item loadout must be represented as two separate facts:
**plans known** and **replicated items currently active**. A plan choice is not an
inventory item; an inventory item is not a definition.

Magic-item plan access unlocks in four tiers:

- Artificer 2+
- Artificer 6+
- Artificer 10+
- Artificer 14+

The Stage 2 installer must encode all 20 class level rows even when a level grants
no named class feature.

## Missing generic primitives discovered by Stage 1

1. **Magic-item plan choice provider**
   - dynamic options sourced from Chasovoy magic-item definitions;
   - filters by Artificer plan tier and any feature-specific category restriction;
   - persistent replacement without copying definitions into class JSON.

2. **Class-created inventory provenance and expiry**
   - Cheburashka needs a generic way to identify an instance created by a class
     assignment/choice and retire it on Long Rest, plan replacement, assignment
     removal, or feature-directed dismissal.

3. **Rest loadout reconciliation**
   - Long Rest may rebuild the allowed Replicate Magic Item set without duplicate
     item instances or stale attunement.

4. **Transactional item-charge ↔ spell-slot exchange**
   - Magic Item Tinker must mutate Cheburashka charges and Shapoklyak spell-slot
     state through one authoritative GENA command/receipt path.

5. **Temporary spell-slot expiry**
   - Drain Magic Item may create a temporary slot that must disappear at the next
     Long Rest without becoming a second spell-slot owner.

6. **Stored-spell item method**
   - Spell-Storing Item needs a reusable item-instance binding to one spell casting
     method and shared spell executor.

7. **Class construct / companion state**
   - Steel Defender and Eldritch Cannon need reusable owner state, scaling projection
     and command actions without a tactical simulator.

8. **Equipment-bound mode state**
   - Arcane Armor model must be a rest-changeable persistent choice bound to the
     equipped armor projection, not a free-floating UI toggle.

9. **Generated consumable variant instances**
   - Experimental Elixir needs inventory-backed generated consumables that retain
     their chosen/random effect variant and are consumed authoritatively.

10. **Linked-holder effect state**
    - Adventurer's Atlas needs canonical holder links independent of mounted chat UI.
      It may expose bonuses/targeting metadata but must not invent line-of-sight,
      distance or scene legality.

11. **Cross-owner zero-HP rescue orchestration**
    - Soul of Artifice and Superior Atlas combine item destruction with HP mutation.
      GENA must orchestrate explicit owner operations; UI and CE must not mutate both
      domains directly.

## GM adjudication boundary

Artificer runtime may own explicit resources, items, choices, companion statistics
and declared action effects. It does not decide whether a target is tactically legal,
whether a cannon has line of sight, whether a map holder can be reached through the
fiction, or whether an action is narratively valid. Those scene rulings remain with
the human GM.

## Stage 1 freeze result

- Base named features: **10**
- Supported subclasses: **5**
- Subclass named features: **33**
- Total stable feature identities: **43**
- Unsupported historical Artificer subclasses: excluded
- Literary fields: intentionally blank
- Runtime visibility: reference-only until later certification
