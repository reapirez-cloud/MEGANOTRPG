# Rogue Stage 1 source freeze and runtime feature matrix — 2026-09-12

> Canonical internal specification for `src/data/classes/rogueRuntimePlan.md`.
> This document freezes source/version identity and runtime ownership before executable Rogue work begins.
> It is not player-facing content and must not be used as literary copy.

## Stage 1 result

**Source audit:** `VERIFIED_2026_09_12`  
**Literary layer:** `READY`  
**Runtime implementation:** `NOT_STARTED`  
**Next stage:** `Stage 2 — clean class foundation and 1–20 progression`

The two missing base literary cards, Steady Aim / Точный прицел and Slippery Mind / Скользкий ум, are now authored. No `TRANSLATION_MISSING` marker remains in the supported Rogue scope.

## Frozen source boundary

- Base class: Player's Handbook 2024 Rogue.
- `subclass:rogue:thief`: Player's Handbook 2024.
- `subclass:rogue:assassin`: Player's Handbook 2024.
- `subclass:rogue:arcane-trickster`: Player's Handbook 2024.
- `subclass:rogue:soulknife`: Player's Handbook 2024.
- `subclass:rogue:swashbuckler`: Xanathar's Guide to Everything legacy package on the Rogue 2024 parent.
- `subclass:rogue:inquisitive`: Xanathar's Guide to Everything legacy package on the Rogue 2024 parent.
- `subclass:rogue:mastermind`: Xanathar's Guide to Everything legacy package on the Rogue 2024 parent.
- `subclass:rogue:scout`: Xanathar's Guide to Everything legacy package on the Rogue 2024 parent.
- `subclass:rogue:phantom`: Tasha's Cauldron of Everything package on the Rogue 2024 parent.

Do not silently substitute later revised/UA/reprint mechanics for the five legacy/supplement packages. In particular, the supported Phantom is the Tasha version, whose Death's Friend fallback Soul Trinket is created at the end of a Long Rest when none are held.

## Stable catalog identities

- class: `class:rogue`
- subclasses:
  - `subclass:rogue:thief`
  - `subclass:rogue:assassin`
  - `subclass:rogue:arcane-trickster`
  - `subclass:rogue:soulknife`
  - `subclass:rogue:swashbuckler`
  - `subclass:rogue:inquisitive`
  - `subclass:rogue:mastermind`
  - `subclass:rogue:scout`
  - `subclass:rogue:phantom`

Subclass effective level is always derived from the parent Rogue assignment. Total character level must never unlock Rogue subclass features.

## Runtime mode legend

- **grant** — native CE capability/proficiency/language/save/movement grant; no bespoke state.
- **choice** — persistent shared Choice Runtime state validated server-side.
- **formula** — deterministic CE value derived from Rogue source level/abilities.
- **action** — shared GENA/template action; action-economy legality remains GM-adjudicated unless another authoritative system owns it.
- **resource** — persistent finite state in the shared Shapoklyak character resource ledger.
- **spell** — shared spell catalog/choice/slot/access runtime.
- **attack** — native CE attack/access, not inventory-instance truth unless the rule actually creates an item.
- **structured** — exact rule exposed in CE/presentation while transient scene legality remains with the GM.
- **hybrid** — combination of shared state plus structured scene rule.
- **reference** — exact rule that requires no machine-owned mutation and is deliberately GM-adjudicated.

## Base Rogue 2024

| Stable feature key | Level | Feature | Runtime mode | Stage | Frozen implementation boundary |
|---|---:|---|---|---:|---|
| `rogue:sneak_attack` | 1 | Скрытая атака | formula + structured | 2/3 | CE owns 1d6→10d6 progression. Weapon/Advantage/ally/Disadvantage and once-per-turn scene legality remain GM-adjudicated. |
| `rogue:expertise` | 1, 6 | Компетентность | choice + grant | 2 | Shared skill-proficiency provider; 2 picks at Rogue 1, +2 at Rogue 6. 2024 Rogue Expertise is skill-only. |
| `rogue:thieves_cant` | 1 | Воровской жаргон | grant + choice | 2 | Native Thieves' Cant plus one language choice. No invented detection DC. |
| `rogue:weapon_mastery` | 1 | Оружейное мастерство | choice + grant | 2 | Two proficient weapon kinds; replacement after Long Rest through generic rest-editable choice policy. |
| `rogue:cunning_action` | 2 | Хитрое действие | action | 3 | Dash / Disengage / Hide as Bonus Action presentation/execution; no turn tracker. |
| `rogue:steady_aim` | 3 | Точный прицел | structured | 3 | Bonus Action, next attack this turn gets Advantage; only if no movement yet; Speed becomes 0 until turn end. Movement/turn legality is GM-adjudicated. |
| `rogue:cunning_strike` | 5 | Хитрый удар | hybrid | 3 | Generic Sneak-Attack-dice sacrifice primitive if absent. Save DC = 8 + Dex + PB. Poison/Trip/Withdraw are structured riders; Poison requires Poisoner's Kit. |
| `rogue:uncanny_dodge` | 5 | Невероятное уклонение | structured | 4 | Reaction rule halves damage from a visible attack-roll hit, round down. Hit/visibility/reaction legality stays GM-adjudicated. |
| `rogue:evasion` | 7 | Увёртливость | structured | 4 | Passive Dex-save-for-half transformation; disabled while Incapacitated. |
| `rogue:reliable_talent` | 7 | Надёжный талант | structured/formula | 4 | Generic minimum d20=10 rule for ability checks using owned skill or tool proficiency. |
| `rogue:improved_cunning_strike` | 11 | Улучшенный хитрый удар | structured | 3 | Up to two Cunning Strike effects; pay each die cost separately. |
| `rogue:devious_strikes` | 14 | Коварные удары | structured | 3 | Adds Daze 2d6, Obscure 3d6, Knock Out 6d6 to the same generic Cunning Strike catalog. |
| `rogue:slippery_mind` | 15 | Скользкий ум | grant | 4 | Native Wisdom and Charisma saving-throw proficiencies. |
| `rogue:elusive` | 18 | Неуловимый | structured | 4 | Attack rolls cannot have Advantage against the Rogue unless Incapacitated. |
| `rogue:stroke_of_luck` | 20 | Мастерский удар | resource + hybrid | 4 | One use per Short/Long Rest; failed D20 Test can become d20 result 20. Actual roll override must reuse the authoritative roll path, not local UI dice. |

Base progression hooks outside the literary feature array:

- subclass unlock: Rogue 3;
- ASI/feat hooks: Rogue 4, 8, 10, 12, 16;
- Epic Boon/qualified feat hook: Rogue 19;
- all hooks must reuse the generic feat/choice architecture available at implementation time and may not spawn a Rogue-only feat picker.

## Thief — PHB 2024

| Stable feature key | Level | Feature | Runtime mode | Stage | Frozen implementation boundary |
|---|---:|---|---|---:|---|
| `rogue:thief:fast_hands` | 3 | Быстрые руки | action + hybrid | 5 | Shared Sleight/Thieves' Tools and Cheburashka item-use paths. Bonus Action may perform the exact Utilize or qualifying magic-item Magic action. |
| `rogue:thief:second_story_work` | 3 | Ловкость второго этажа | grant + formula | 5 | Climb Speed = Speed; jump distance may use Dexterity instead of Strength. |
| `rogue:thief:supreme_sneak` | 9 | Скрытность в движении | structured | 5 | Adds Stealth Attack Cunning Strike option, cost 1d6. Hide-derived Invisible persists through the attack only under the exact end-of-turn cover condition. |
| `rogue:thief:use_magic_device` | 13 | Использование магических предметов | hybrid + spell | 5 | Attunement cap 4; charge-conservation d6; any Spell Scroll with Intelligence and the exact Arcana check for level 2+. Reuse canonical items/spells. |
| `rogue:thief:thiefs_reflexes` | 17 | Воровские рефлексы | structured | 5 | Exact two-turn first-round rule, second Initiative = first minus 10. No Rogue-only turn tracker; GM/table adjudicates turn schedule. |

## Assassin — PHB 2024

| Stable feature key | Level | Feature | Runtime mode | Stage | Frozen implementation boundary |
|---|---:|---|---|---:|---|
| `rogue:assassin:assassinate` | 3 | Ликвидация | formula + structured | 5 | Initiative Advantage is deterministic; first-round/not-yet-acted target and Sneak Attack trigger remain scene rules; extra damage = Rogue level. |
| `rogue:assassin:assassins_tools` | 3 | Инструменты убийцы | grant | 5 | Disguise Kit and Poisoner's Kit ownership/proficiency grant exactly as authored; no invented replacement if already proficient. |
| `rogue:assassin:infiltration_expertise` | 9 | Искусство проникновения | structured | 5 | Masterful Mimicry is GM-adjudicated; Roving Aim removes Steady Aim's post-use Speed=0 effect but does not erase its pre-use no-movement requirement. |
| `rogue:assassin:envenom_weapons` | 13 | Отравленное оружие | structured | 5 | Poison Cunning Strike failed save also deals 2d6 Poison and ignores Poison resistance, not immunity. |
| `rogue:assassin:death_strike` | 17 | Смертельный удар | structured | 5 | First-round Sneak Attack hit forces Con save vs Rogue Cunning Strike DC; failed save doubles the attack's damage. |

## Arcane Trickster — PHB 2024

| Stable feature key | Level | Feature | Runtime mode | Stage | Frozen implementation boundary |
|---|---:|---|---|---:|---|
| `rogue:arcane_trickster:spellcasting` | 3 | Использование заклинаний | spell + choice | 5 | Shared Wizard spell catalog, Intelligence casting, exact 1/3-caster slot/prepared progression, Arcane Focus. No 2014 Illusion/Enchantment school restriction. |
| `rogue:arcane_trickster:mage_hand_legerdemain` | 3 | Ловкость рук мага | spell + structured | 5 | Mage Hand may be cast/controlled as Bonus Action, can be Invisible, and can make Sleight of Hand checks. Reuse canonical spell access. |
| `rogue:arcane_trickster:magical_ambush` | 9 | Магическая засада | structured | 5 | If Rogue is Invisible when casting on a creature, that creature has Disadvantage on saves against the spell made that turn. Scene visibility stays GM-owned. |
| `rogue:arcane_trickster:versatile_trickster` | 13 | Универсальный ловкач | structured | 5 | Trip Cunning Strike may also target a second creature within 5 ft of Mage Hand. Mage Hand position is not invented as hidden persistent state. |
| `rogue:arcane_trickster:spell_thief` | 17 | Воровство заклинаний | hybrid + spell | 5 | Reaction, caster Int save vs spell DC. Failed save negates effect on Rogue; eligible level 1+ spell of any class is stolen for 8h. Feature locks only after an actual steal. Temporary spell access must use shared spell state; no automatic Larisa-time expiry. |

## Soulknife — PHB 2024

| Stable feature key | Level | Feature | Runtime mode | Stage | Frozen implementation boundary |
|---|---:|---|---|---:|---|
| `rogue:soulknife:psionic_power` | 3 | Псионическая сила | resource + hybrid | 5 | Shared Psionic Energy Dice pool with exact fixed 2024 count/die progression, one die on Short Rest/all on Long Rest. Knack spends only on success. Whispers first use after Long Rest is free; later uses spend a die. |
| `rogue:soulknife:psychic_blades` | 3 | Психические клинки | attack | 5 | Native CE attack, never inventory. 1d6 Psychic, Finesse, Thrown 60/120, Vex, usable for Attack action or Opportunity Attack; second blade Bonus Action d4. |
| `rogue:soulknife:soul_blades` | 9 | Заряды пси-клинков | resource + hybrid | 5 | Homing Strikes conditionally spends a die only if miss becomes hit; Psychic Teleportation spends one die and uses result×10 ft. |
| `rogue:soulknife:psychic_veil` | 13 | Психическая завеса | resource + structured | 5 | One Long Rest use; can restore by spending one Psionic Energy Die. Invisible state and its damage/save end triggers are structured; no world-time auto-expiry. |
| `rogue:soulknife:rend_mind` | 17 | Разрыв разума | resource + structured | 5 | Sneak Attack with Psychic Blades; Wisdom save, Stunned up to 1 minute with repeats. One Long Rest use; restore by spending three Psionic dice. |

2024 Psychic Whispers language note: its subclass text no longer repeats Tasha's explicit language clauses. The general 2024 Telepathy rule governs comprehension; do not reinsert the removed Tasha wording as if it were subclass text.

## Swashbuckler — Xanathar legacy

| Stable feature key | Level | Feature | Runtime mode | Stage | Frozen implementation boundary |
|---|---:|---|---|---:|---|
| `rogue:swashbuckler:fancy_footwork` | 3 | Причудливая дерзость | structured | 6 | A creature attacked in melee by the Rogue can't make Opportunity Attacks against the Rogue for the rest of that turn; hit not required. |
| `rogue:swashbuckler:rakish_audacity` | 3 | Дерзкая отвага | formula + structured | 6 | Add Charisma modifier to Initiative; alternative Sneak Attack condition for isolated melee target. |
| `rogue:swashbuckler:panache` | 9 | Панегирик / Насмешка | structured | 6 | Persuasion vs Insight contest, hostile/nonhostile branches, 60-ft/language/hearing requirements. Scene attitude and effect-end triggers remain GM-owned. |
| `rogue:swashbuckler:elegant_maneuver` | 13 | Элегантный маневр | structured | 6 | Bonus Action grants Advantage on next Acrobatics or Athletics check in current turn. |
| `rogue:swashbuckler:master_duelist` | 17 | Мастерский выпад | resource + structured | 6 | Missed attack can be rerolled with Advantage; one use per Short/Long Rest. |

## Inquisitive — Xanathar legacy

| Stable feature key | Level | Feature | Runtime mode | Stage | Frozen implementation boundary |
|---|---:|---|---|---:|---|
| `rogue:inquisitive:ear_for_deceit` | 3 | Ухо обманщика | structured/formula | 6 | Insight check specifically to detect lies treats d20 7 or lower as 8; not a global Insight floor. |
| `rogue:inquisitive:eye_for_detail` | 3 | Око проницательности | action | 6 | Bonus Action Perception for hidden creature/object or Investigation for clues. |
| `rogue:inquisitive:insightful_fighting` | 3 | Проницательный бой | structured | 6 | Insight vs Deception contest; on success alternate Sneak Attack condition for 1 minute/until successfully moved to another target. Target/scene duration is GM-adjudicated unless explicit state is later approved. |
| `rogue:inquisitive:steady_eye` | 9 | Непогрешимый взгляд | structured | 6 | Advantage on Perception/Investigation if movement this turn <= half Speed. |
| `rogue:inquisitive:unerring_eye` | 13 | Безошибочный глаз | resource + reference | 6 | Action, 30-ft deception-sense rule, uses = Wisdom modifier minimum 1 per Long Rest. What is actually detected remains GM information. |
| `rogue:inquisitive:eye_for_weakness` | 17 | Эксплуатация слабости | formula + structured | 6 | +3d6 Sneak Attack damage against a target currently under Insightful Fighting. |

## Mastermind — Xanathar legacy

| Stable feature key | Level | Feature | Runtime mode | Stage | Frozen implementation boundary |
|---|---:|---|---|---:|---|
| `rogue:mastermind:master_of_intrigue` | 3 | Мастер интриг | grant + choice + reference | 6 | Disguise Kit, Forgery Kit, one gaming set, two languages; one-minute speech/accent mimicry if Rogue knows the language. No invented Insight-vs-Deception detector. |
| `rogue:mastermind:master_of_tactics` | 3 | Мастер тактики | action + structured | 6 | Help as Bonus Action; attack-help target may be within 30 ft if target can see or hear Rogue. |
| `rogue:mastermind:insightful_manipulator` | 9 | Проницательный манипулятор | reference | 6 | One minute observation/interactions outside combat; choose two comparison categories. Result comes from GM, not CE-generated NPC mind reading. |
| `rogue:mastermind:misdirection` | 13 | Ложное направление | structured | 6 | Reaction redirects an attack to a nearby creature providing cover. Cover/target legality stays GM-owned. |
| `rogue:mastermind:soul_of_deceit` | 17 | Душа обмана | structured/reference | 6 | Mind-reading denial, optional false-thought Deception vs Insight, optional truth-detection deception, immunity to magical truth compulsion. |

## Scout — Xanathar legacy

| Stable feature key | Level | Feature | Runtime mode | Stage | Frozen implementation boundary |
|---|---:|---|---|---:|---|
| `rogue:scout:skirmisher` | 3 | Застрельщик | structured | 6 | Reaction movement up to half Speed when hostile creature ends turn within 5 ft; no Opportunity Attacks from that movement. |
| `rogue:scout:survivalist` | 3 | Мастер выживания | grant | 6 | Nature + Survival proficiency if absent, with doubled PB on those checks. |
| `rogue:scout:superior_mobility` | 9 | Превосходная подвижность | grant/formula | 6 | Walking Speed +10; existing Climb/Swim Speed also +10. Does not create missing speeds. |
| `rogue:scout:ambush_master` | 13 | Мастер засад | structured | 6 | Initiative Advantage; first creature hit in first round grants Advantage to attack rolls against it until start of Rogue's next turn. No persistent first-round target marker. |
| `rogue:scout:sudden_strike` | 17 | Внезапный удар | structured | 6 | Attack action enables one Bonus Action attack. It may carry a second Sneak Attack, but one target cannot receive Sneak Attack twice in the same turn. The extra attack itself may target the same creature if it does not carry a second Sneak Attack. |

## Phantom — Tasha

| Stable feature key | Level | Feature | Runtime mode | Stage | Frozen implementation boundary |
|---|---:|---|---|---:|---|
| `rogue:phantom:whispers_of_the_dead` | 3 | Шепот мертвецов | choice + grant | 6 | After Short/Long Rest choose one missing skill or tool proficiency; persists until feature is used after a later rest to choose another. |
| `rogue:phantom:wails_from_the_grave` | 3 | Вопли из могилы | resource + formula + structured | 6 | PB uses per Long Rest; second visible creature within 30 ft of first target; Necrotic damage rolls half the number of Sneak Attack dice, rounded up. |
| `rogue:phantom:tokens_of_the_departed` | 9 | Осколки усопших | resource + structured/reference | 6 | Soul Trinket pool max PB. Creature-death eligibility remains GM-adjudicated; shared resource max is enforced. Trinkets can fuel Wails/Ghost Walk or spirit question. Spirit need not tell truth. |
| `rogue:phantom:ghost_walk` | 13 | Призрачная походка | resource + structured | 6 | One free use per Long Rest or Soul Trinket alternate cost; 10-minute spectral form, Fly 10/Hover, attacks at Disadvantage, object traversal and 1d10 Force end-of-turn penalty. |
| `rogue:phantom:deaths_friend` | 17 | Друг смерти | formula + resource | 6 | Wails damages both first and second creature. At end of Long Rest, ensure one Soul Trinket if current count is zero. This Tasha contract does not use Initiative as the fallback-token trigger. |

## Source-audit locks

The Stage 1 audit specifically freezes the following easy-to-regress distinctions:

1. Rogue 2024 Expertise chooses skills, not Thieves' Tools; Reliable Talent still works with proficient tools.
2. Steady Aim is unchanged in substance: pre-use no movement, post-use Speed 0 for the turn.
3. Slippery Mind grants both Wisdom and Charisma save proficiency.
4. Stroke of Luck applies to any failed D20 Test and recharges on Short or Long Rest.
5. Thief Fast Hands may use a qualifying magic item's Magic action as a Bonus Action.
6. Arcane Trickster has no 2014 Illusion/Enchantment preparation restriction.
7. Arcane Trickster Spell Thief uses an Intelligence save, can steal a qualifying non-Wizard spell, and locks only after an actual steal.
8. Soulknife Psychic Blades have Vex, 60/120 range, and can be used for Opportunity Attacks.
9. Soulknife uses the fixed 2024 Psionic Energy Dice progression, one die recovered on Short Rest/all on Long Rest.
10. Master of Intrigue has no invented contest to expose the copied accent.
11. Scout Sudden Strike restricts the second Sneak Attack target, not the mere Bonus Action attack target.
12. Phantom is frozen to Tasha: no Undead/Construct token exclusion, spirit answers need not be truthful, Wails rolls half Sneak Attack dice rounded up, Death's Friend fallback token is after Long Rest rather than Initiative.

## Missing generic primitives discovered by Stage 1

These must be checked/reused in Stages 2–6 rather than solved with Rogue-only branches:

- rest-editable persistent weapon-mastery selection if the existing generic choice cadence cannot express Long Rest replacement;
- generic Sneak-Attack-dice-cost/rider representation for Cunning Strike if current structured actions cannot deduct damage dice without lying about damage;
- authoritative d20-result override seam for Stroke of Luck through the shared roll path;
- generic temporary spell-access state for Spell Thief if existing spell access cannot represent an explicit GM-cleared 8-hour grant;
- reusable conditional resource spending where a die is spent only if it changes a failed check/attack into success (Psi-Bolstered Knack / Homing Strikes);
- generic alternate resource payment/recovery actions for Psychic Veil, Rend Mind and Ghost Walk;
- generic ensure-minimum-on-rest resource effect for Tasha Death's Friend if the existing resource effect already used by other classes is not directly reusable.

No primitive should be implemented during Stage 1. Stage 1 freezes what is needed; Stage 2+ implements only the first real missing shared capability when encountered.

## Stage 1 completion gate

Stage 1 is complete only when all of the following are true:

- base literary gaps are closed;
- zero supported Rogue cards contain `TRANSLATION_MISSING`;
- all 15 base features and all 46 subclass features have exact neutral mechanics;
- all 61 features have a stable feature key and runtime mode in this matrix;
- source versions and the nine-subclass roster are frozen;
- known source-copy corrections have regression coverage;
- Rogue remains `referenceOnly=true` and no runtime/production READY claim is introduced;
- full repository CI is green on the Stage 1 head.
