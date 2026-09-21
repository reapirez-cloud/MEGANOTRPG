import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveCharacterContract, resolveSemanticDieRoll } from "../src/character-engine/index.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"
import type { StoredMechanic } from "../src/types/characterMechanics.ts"

const migration = fs.readFileSync(
  "supabase/migrations/20260921150000_rogue_stage5_phb_subclasses_v1.sql",
  "utf8",
)
const runtimeSource = fs.readFileSync(
  "src/engine-runtime/supabaseCharacterRuntimeSource.ts",
  "utf8",
)
const legacyAdapter = fs.readFileSync(
  "src/lib/legacyCharacterEngineAdapter.ts",
  "utf8",
)

function baseTemplate(
  id: string,
  kind: "class" | "subclass",
  catalogKey: string,
  name: string,
  parent: string | null,
  summary: string,
) {
  return {
    id,
    campaign_id: "campaign",
    kind,
    slug: catalogKey.replaceAll(":", "-"),
    name,
    description: summary,
    version: 1,
    mechanics: [],
    choices: [],
    parent_template_id: parent,
    unlock_level: kind === "subclass" ? 3 : null,
    catalog_key: catalogKey,
    catalog_revision:
      kind === "class"
        ? "xphb-2024-rogue-stage4-base-runtime-v1"
        : "xphb-2024-rogue-stage5-phb-subclasses-v1",
    source_kind: "official" as const,
    source_label: "Player's Handbook 2024",
    is_builtin: true,
    mechanical_summary: summary,
    author_description: "",
    author_comment: "",
    rules_meta: {},
    is_active: true,
    created_by: null,
    created_at: "2026-09-21T00:00:00Z",
    updated_at: "2026-09-21T00:00:00Z",
  }
}

function feature(
  id: string,
  sourceKey: string,
  key: string,
  label: string,
  description: string,
  mechanic: Record<string, unknown>,
): StoredMechanic {
  return {
    id,
    type: "grant",
    sourceKey,
    target: "feature",
    key,
    payload: { label, description, mechanic },
  }
}

function parentBundle(level: number): CharacterTemplateBundle {
  return {
    assignment: {
      id: "rogue-parent-assignment",
      character_id: "rogue-stage5-character",
      template_id: "rogue-parent",
      template_level: level,
      selected_choices: {},
      assigned_at: "2026-09-21T00:00:00Z",
      updated_at: "2026-09-21T00:00:00Z",
    },
    template: baseTemplate(
      "rogue-parent",
      "class",
      "class:rogue",
      "Разбойник",
      null,
      "Базовый Разбойник 2024 с сертифицированной прогрессией 1–20, общими навыками, Скрытой атакой и классовыми действиями.",
    ),
    levels: [],
  }
}

function subclassBundle(
  id: string,
  catalogKey: string,
  name: string,
  summary: string,
  level: number,
  mechanics: StoredMechanic[],
): CharacterTemplateBundle {
  return {
    assignment: {
      id: `${id}-assignment`,
      character_id: "rogue-stage5-character",
      template_id: id,
      template_level: 20,
      selected_choices: {},
      assigned_at: "2026-09-21T00:00:00Z",
      updated_at: "2026-09-21T00:00:00Z",
    },
    template: baseTemplate(
      id,
      "subclass",
      catalogKey,
      name,
      "rogue-parent",
      summary,
    ),
    levels: [{
      id: `${id}-l${level}`,
      template_id: id,
      level,
      mechanics,
      choices: [],
    }],
  }
}

const thief = subclassBundle(
  "rogue-thief-stage5",
  "subclass:rogue:thief",
  "Вор",
  "Вор 2024 использует быстрые действия с предметами и воровскими проверками, улучшенную скрытность, магические предметы и дополнительный ход первого раунда.",
  3,
  [
    feature(
      "thief-fast-hands",
      "fast-hands",
      "subclass:rogue:thief:fast-hands",
      "Быстрые руки",
      "Бонусным действием выполните подходящую проверку Ловкости рук либо используйте предмет действием Utilize; подходящее свойство магического предмета с Magic action также получает эту экономику.",
      {
        kind: "action_economy_override",
        economy: "bonus_action",
        inventoryExecutor: "shared",
      },
    ),
    {
      id: "thief-fast-hands-action",
      type: "action",
      sourceKey: "fast-hands",
      key: "thief_fast_hands_item",
      label: "Быстрые руки: предмет",
      economy: "bonus_action",
      range: { kind: "self" },
      effects: [{
        kind: "semantic",
        key: "inventory_action_economy_override",
        payload: { executor: "shared_inventory" },
      }],
      tags: ["thief", "inventory"],
    },
  ],
)

const assassin = subclassBundle(
  "rogue-assassin-stage5",
  "subclass:rogue:assassin",
  "Ассасин",
  "Ассасин 2024 получает преимущество в начале боя, инструменты убийцы, внедрение, усиленный яд и смертельную атаку первого раунда.",
  3,
  [
    feature(
      "assassin-assassinate",
      "assassinate",
      "subclass:rogue:assassin:assassinate",
      "Ликвидация",
      "Вы совершаете Инициативу с Преимуществом; в первом раунде атаки имеют Преимущество против ещё не ходивших существ, а первая подходящая Скрытая атака наносит дополнительный урон, равный уровню Разбойника.",
      {
        kind: "first_round_assassination",
        initiativeAdvantage: true,
        sceneEligibility: "gm",
      },
    ),
  ],
)

const arcane = subclassBundle(
  "rogue-arcane-stage5",
  "subclass:rogue:arcane-trickster",
  "Мистический ловкач",
  "Мистический ловкач 2024 использует список Волшебника, Интеллект, общие ячейки заклинаний, Волшебную руку и временную кражу заклинаний.",
  3,
  [
    feature(
      "arcane-spellcasting",
      "spellcasting",
      "subclass:rogue:arcane-trickster:spellcasting",
      "Заклинания",
      "Вы используете Интеллект для выбранных заклинаний Волшебника; Волшебная рука известна автоматически, а остальные заговоры и подготовленные заклинания растут по уровню Разбойника.",
      {
        kind: "class_spellcasting",
        ability: "intelligence",
        spellList: "wizard",
        progression: "one_third_caster",
      },
    ),
    {
      id: "arcane-mage-hand",
      type: "spell",
      sourceKey: "mage-hand-legerdemain",
      key: "spell:mage-hand",
      variantKey: "arcane-trickster:mage-hand",
      catalogSlug: "mage-hand",
      payload: {
        spell: {
          name: "Волшебная рука",
          level: 0,
          school: "Conjuration",
          ritual: false,
        },
        preparation: { mode: "not_required" },
        methods: [{
          key: "arcane-trickster-cast",
          kind: "class_spell",
          ability: "intelligence",
          requiresPrepared: false,
        }],
      },
    },
    {
      id: "arcane-slot-1",
      type: "resource",
      sourceKey: "spellcasting",
      key: "spell_slot_1",
      label: "Ячейки заклинаний 1 уровня",
      max: 2,
      recharge: ["long_rest"],
      initial: "full",
      grantOperation: "REPLACE",
      priority: 703,
    },
  ],
)

const soulknife = subclassBundle(
  "rogue-soulknife-stage5",
  "subclass:rogue:soulknife",
  "Клинок души",
  "Клинок души 2024 использует общий запас Псионических костей, психические клинки, телепортацию, невидимость и Разрыв разума.",
  3,
  [
    feature(
      "soulknife-psionic-power",
      "psionic-power",
      "subclass:rogue:soulknife:psionic-power",
      "Псионическая сила",
      "Вы получаете четыре Псионические кости к6; после короткого отдыха восстанавливается одна потраченная кость, а после долгого отдыха восстанавливаются все.",
      {
        kind: "psionic_energy_dice",
        resourceKey: "soulknife_psionic_energy",
        dieSidesValueKey: "soulknife_psionic_die_sides",
      },
    ),
    {
      id: "soulknife-resource",
      type: "resource",
      sourceKey: "psionic-power",
      key: "soulknife_psionic_energy",
      label: "Псионические кости",
      max: 4,
      recharge: ["short_rest", "long_rest"],
      recoveryRules: [
        { trigger: "short_rest", restore: "amount", amount: 1 },
        { trigger: "long_rest", restore: "full" },
      ],
      initial: "full",
      grantOperation: "REPLACE",
      priority: 503,
    },
    {
      id: "soulknife-die",
      type: "grant",
      sourceKey: "psionic-power",
      target: "value",
      key: "soulknife_psionic_die_sides",
      grantOperation: "REPLACE",
      priority: 503,
      payload: { label: "Грани Псионической кости", value: 6 },
    },
    feature(
      "soulknife-blades-feature",
      "psychic-blades",
      "subclass:rogue:soulknife:psychic-blades",
      "Психические клинки",
      "При действии Атака или провоцированной атаке создайте психический клинок: атака Ловкостью наносит 1к6 психического урона; второй клинок можно метнуть бонусным действием и он наносит 1к4.",
      {
        kind: "native_ce_weapon_attacks",
        inventoryItem: false,
      },
    ),
    {
      id: "soulknife-blade",
      type: "action",
      sourceKey: "psychic-blades",
      key: "soulknife_psychic_blade",
      label: "Психический клинок",
      economy: "action",
      range: { kind: "ranged", normal: 60, long: 120, unit: "ft" },
      attackAbility: "dexterity",
      proficient: true,
      damage: [{
        key: "psychic_blade",
        damageType: "psychic",
        count: 1,
        sides: 6,
        modifierAbility: "dexterity",
      }],
      tags: ["soulknife", "attack"],
    },
    {
      id: "soulknife-utility-die",
      type: "action",
      sourceKey: "psionic-power",
      key: "soulknife_psionic_roll",
      label: "Псионическая кость",
      economy: "triggered",
      range: { kind: "self" },
      effects: [{
        kind: "semantic",
        key: "semantic_die_roll",
        payload: {
          count: 1,
          sidesValueKey: "soulknife_psionic_die_sides",
          label: "Псионическая кость",
        },
      }],
      tags: ["soulknife", "psionic"],
    },
  ],
)

test("Stage 5 representative package passes shared quality/resource/parser/CE gates", () => {
  const bundles = [parentBundle(20), thief, assassin, arcane, soulknife]
  assert.doesNotThrow(() => assertClassPackageQuality(bundles))
  assert.doesNotThrow(() => assertClassResourcePolicy(bundles))

  const parsed = resolveTemplateBundles(bundles, 20)
  const contract = resolveCharacterContract({
    base: {
      id: "rogue-stage5-character",
      name: "Разбойник",
      level: 20,
      abilities: {
        strength: 10,
        dexterity: 18,
        constitution: 14,
        intelligence: 16,
        wisdom: 12,
        charisma: 10,
      },
      baseMaxHp: 100,
      baseSpeed: 30,
    },
    state: {
      currentHp: 100,
      tempHp: 0,
      resources: {
        soulknife_psionic_energy: { current: 4 },
        spell_slot_1: { current: 2 },
      },
    },
    contributions: parsed.contributions,
  })

  assert.ok(contract.actions.some((action) => action.key === "thief_fast_hands_item"))
  assert.ok(contract.actions.some((action) => action.key === "soulknife_psychic_blade"))
  assert.ok(contract.spells.some((spell) => spell.key === "spell:mage-hand"))
  assert.equal(
    contract.resources.find((resource) => resource.stateKey === "soulknife_psionic_energy")?.max.value,
    4,
  )

  const psionicRoll = contract.actions.find(
    (action) => action.key === "soulknife_psionic_roll",
  )
  assert.ok(psionicRoll)
  assert.deepEqual(resolveSemanticDieRoll(psionicRoll, contract.values), {
    count: 1,
    sides: 6,
    modifier: 0,
    label: "Псионическая кость",
  })
})

test("subclass source level is inherited from Rogue rather than total character level", () => {
  const lowParent = parentBundle(8)
  const highFeature = subclassBundle(
    "thief-parent-level-test",
    "subclass:rogue:thief",
    "Вор",
    "Вор 2024 использует общую прогрессию родительского Разбойника и не открывает подклассовые особенности по общему уровню персонажа.",
    9,
    [feature(
      "thief-l9-parent-test",
      "supreme-sneak",
      "subclass:rogue:thief:supreme-sneak",
      "Высшая скрытность",
      "На девятом уровне Разбойника Скрытная атака становится вариантом Хитрого удара стоимостью 1к6 и использует сценическое условие укрытия.",
      { kind: "cunning_strike_extension", diceCost: 1 },
    )],
  )
  const parsed = resolveTemplateBundles([lowParent, highFeature], 20)
  assert.equal(
    parsed.contributions.some(
      (entry) =>
        entry.kind === "grant" &&
        entry.target === "feature" &&
        entry.key === "subclass:rogue:thief:supreme-sneak",
    ),
    false,
  )
})

test("Stage 5 migration installs exactly the four PHB 2024 Rogue subclasses", () => {
  for (const key of [
    "subclass:rogue:thief",
    "subclass:rogue:assassin",
    "subclass:rogue:arcane-trickster",
    "subclass:rogue:soulknife",
  ]) {
    assert.ok(migration.includes(key), key)
  }
  assert.match(migration, /ROGUE_STAGE5_PHB_ROSTER/)
  assert.match(migration, /ROGUE_STAGE5_NON_PHB_RUNTIME_LEAK/)
  assert.match(migration, /rogue-scion-of-the-three/)
  assert.match(migration, /stage5_phb_subclass_count',4/)
  assert.doesNotMatch(migration, /mechanics_status','READY'/)
})

test("Arcane Trickster uses Wizard catalog choices, exact prepared growth and shared slots", () => {
  assert.match(migration, /c\.class_key='wizard'/)
  assert.match(migration, /s\.slug<>'mage-hand'/)
  assert.match(migration, /private\.rogue_stage5_arcane_spell_v1\('mage-hand','mage-hand-legerdemain'\)/)
  assert.match(
    migration,
    /'count_by_level',jsonb_build_object\([\s\S]*?'3',3[\s\S]*?'20',13/,
  )
  assert.match(migration, /private\.rogue_stage5_slot_resource_v1\(19,4,1\)/)
  assert.match(migration, /'ability','intelligence'/)
  assert.match(migration, /'schoolRestriction',false/)
})

test("Spell Thief uses shared temporary character_spells state and spends only an actual steal", () => {
  for (const marker of [
    "temporary_until",
    "temporary_source_key",
    "temporary_assignment_id",
    "temporary_casting_ability",
    "grant_character_temporary_spell_access_core_v1",
    "arcane_trickster_steal_spell_v1",
    "interval '8 hours'",
    "SPELL_THIEF_REQUIRES_CONFIRMED_FAILED_SAVE",
  ]) {
    assert.ok(migration.includes(marker), marker)
  }
  assert.match(runtimeSource, /spell\.temporary_until/)
  assert.match(runtimeSource, /expiresAt > Date\.now\(\)/)
  assert.match(legacyAdapter, /temporary_casting_ability/)
  assert.match(legacyAdapter, /temporary_spell_access/)
})

test("Soulknife uses one shared persistent Psionic Energy Dice ledger with exact scaling", () => {
  for (const marker of [
    "private.rogue_stage5_psionic_resource_v1(3,4)",
    "private.rogue_stage5_psionic_resource_v1(5,6)",
    "private.rogue_stage5_psionic_resource_v1(9,8)",
    "private.rogue_stage5_psionic_resource_v1(13,10)",
    "private.rogue_stage5_psionic_resource_v1(17,12)",
    "'Грани Псионической кости',6",
    "'Грани Псионической кости',8",
    "'Грани Псионической кости',10",
    "'Грани Псионической кости',12",
  ]) {
    assert.ok(migration.includes(marker), marker)
  }
  assert.match(
    migration,
    /'short_rest','restore','amount','amount',1[\s\S]*?'long_rest','restore','full'/,
  )
})

test("Psychic Blades are CE attacks, while conditional Psionic spends remain explicit two-step confirmations", () => {
  assert.match(migration, /soulknife_psychic_blade/)
  assert.match(migration, /soulknife_psychic_blade_bonus/)
  assert.match(migration, /'notInventoryItem',true/)
  assert.match(migration, /soulknife_psi_bolstered_knack_roll/)
  assert.match(migration, /soulknife_psi_bolstered_knack_commit/)
  assert.match(migration, /spend_only_if_bonus_changes_failure_to_success/)
  assert.match(migration, /soulknife_homing_strikes_roll/)
  assert.match(migration, /soulknife_homing_strikes_commit/)
  assert.match(migration, /spend_only_if_bonus_changes_miss_to_hit/)
})

test("Thief stays on shared inventory semantics and Assassin scene truth stays GM-adjudicated", () => {
  assert.match(migration, /'inventoryExecutor','shared'/)
  assert.match(migration, /'executor','shared_inventory'/)
  assert.match(migration, /spell_scroll:any:intelligence/)
  assert.match(migration, /'persistentTurnTracker',false/)
  assert.match(migration, /'sceneEligibility','gm'/)
  assert.match(migration, /'requiresFailedSave',true/)
  assert.match(migration, /'ignoreResistance',true/)
  assert.match(migration, /'ignoreImmunity',false/)
})
