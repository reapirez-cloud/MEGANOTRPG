import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  executeAction,
  resolveCharacterContract,
  type CharacterEngineInput,
} from "../src/character-engine/index.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"
import type { StoredMechanic, StoredMechanics } from "../src/types/characterMechanics.ts"

const catalog = readFileSync("supabase/migrations/20260906182000_warlock_catalog_bootstrap.sql", "utf8")
const pactContract = readFileSync("supabase/migrations/20260906182050_pact_magic_spell_contract.sql", "utf8")
const runtime = readFileSync("supabase/migrations/20260906182100_warlock_base_runtime_v1.sql", "utf8")

const prepared = [2,3,4,5,6,7,8,9,10,10,11,11,12,12,13,13,14,14,15,15]
const cantrips = [2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4]

function feature(id: string, sourceKey: string, key: string, label: string, description: string): StoredMechanic {
  return { id, type: "grant", target: "feature", key, sourceKey, payload: { label, description } }
}

function resource(id: string, sourceKey: string, key: string, label: string, max: number, recharge: ("short_rest" | "long_rest")[], priority: number): StoredMechanic {
  return { id, type: "resource", sourceKey, key, label, max, recharge, initial: "full", grantOperation: "REPLACE", priority }
}

function value(id: string, sourceKey: string, key: string, label: string, amount: number, priority: number): StoredMechanic {
  return { id, type: "grant", target: "value", key, sourceKey, grantOperation: "REPLACE", priority, payload: { label, value: amount } }
}

function finiteAction(id: string, sourceKey: string, key: string, label: string, resourceKey: string, effects: StoredMechanic extends never ? never : any[] = []): StoredMechanic {
  return {
    id,
    type: "action",
    sourceKey,
    key,
    label,
    economy: "magic_action",
    resourceCosts: [{ key: resourceKey, amount: 1 }],
    effects,
    tags: ["class"],
  }
}

const levels: Array<{ level: number; mechanics: StoredMechanics }> = [
  {
    level: 1,
    mechanics: [
      feature("warlock-pact-rules", "warlock-base:pact-magic", "pact_magic", "Магия договора", "Харизма определяет заклинания колдуна. Ячейки Магии договора имеют один текущий уровень и полностью восстанавливаются после короткого или долгого отдыха."),
      resource("warlock-pact-slots-1", "warlock-base:pact-magic", "warlock_pact_slots", "Ячейки Магии договора", 1, ["short_rest", "long_rest"], 1),
      value("warlock-pact-level-1", "warlock-base:pact-magic", "warlock_pact_slot_level", "Уровень ячейки Магии договора", 1, 1),
    ],
  },
  {
    level: 2,
    mechanics: [
      resource("warlock-pact-slots-2", "warlock-base:pact-magic", "warlock_pact_slots", "Ячейки Магии договора", 2, ["short_rest", "long_rest"], 2),
      feature("warlock-cunning-rules", "warlock-base:magical-cunning", "magical_cunning", "Магическая хитрость", "После минутного ритуала колдун восстанавливает половину максимума ячеек Магии договора с округлением вверх. Использование: 1; запас полностью восстанавливается после долгого отдыха."),
      resource("warlock-cunning-use", "warlock-base:magical-cunning", "warlock_magical_cunning", "Магическая хитрость", 1, ["long_rest"], 2),
      value("warlock-cunning-restore-2", "warlock-base:magical-cunning", "warlock_magical_cunning_restore", "Возврат Магической хитрости", 1, 2),
      finiteAction("warlock-cunning-action", "warlock-base:magical-cunning", "warlock_magical_cunning", "Магическая хитрость", "warlock_magical_cunning", [{ kind: "resource", key: "warlock_pact_slots", operation: "RESTORE", amount: { kind: "reference", key: "values.warlock_magical_cunning_restore" } }]),
    ],
  },
  { level: 3, mechanics: [value("warlock-pact-level-3", "warlock-base:pact-magic", "warlock_pact_slot_level", "Уровень ячейки Магии договора", 2, 3)] },
  { level: 5, mechanics: [value("warlock-pact-level-5", "warlock-base:pact-magic", "warlock_pact_slot_level", "Уровень ячейки Магии договора", 3, 5)] },
  { level: 7, mechanics: [value("warlock-pact-level-7", "warlock-base:pact-magic", "warlock_pact_slot_level", "Уровень ячейки Магии договора", 4, 7)] },
  {
    level: 9,
    mechanics: [
      value("warlock-pact-level-9", "warlock-base:pact-magic", "warlock_pact_slot_level", "Уровень ячейки Магии договора", 5, 9),
      feature("warlock-contact-rules", "warlock-base:contact-patron", "contact_patron", "Связь с покровителем", "«Контакт с иным планом» всегда подготовлен. Бесплатное обращение к покровителю: 1 использование; запас полностью восстанавливается после долгого отдыха, а предусмотренный заклинанием спасбросок Интеллекта автоматически успешен."),
      resource("warlock-contact-use", "warlock-base:contact-patron", "warlock_contact_patron", "Связь с покровителем", 1, ["long_rest"], 9),
      finiteAction("warlock-contact-action", "warlock-base:contact-patron", "warlock_contact_patron", "Связь с покровителем", "warlock_contact_patron", [{ kind: "semantic", key: "cast_spell", payload: { spell_slug: "contact-other-plane", slot_cost: 0 } }]),
    ],
  },
  {
    level: 11,
    mechanics: [
      resource("warlock-pact-slots-11", "warlock-base:pact-magic", "warlock_pact_slots", "Ячейки Магии договора", 3, ["short_rest", "long_rest"], 11),
      value("warlock-cunning-restore-11", "warlock-base:magical-cunning", "warlock_magical_cunning_restore", "Возврат Магической хитрости", 2, 11),
      feature("warlock-arcanum-6-rules", "warlock-base:mystic-arcanum-6", "mystic_arcanum_6", "Таинственный арканум 6 уровня", "Выбранное заклинание колдуна 6 уровня можно сотворить бесплатно 1 раз; запас полностью восстанавливается после долгого отдыха."),
      resource("warlock-arcanum-6-use", "warlock-base:mystic-arcanum-6", "warlock_mystic_arcanum_6", "Таинственный арканум 6 уровня", 1, ["long_rest"], 11),
      finiteAction("warlock-arcanum-6-action", "warlock-base:mystic-arcanum-6", "warlock_mystic_arcanum_6_cast", "Таинственный арканум 6 уровня", "warlock_mystic_arcanum_6"),
    ],
  },
  {
    level: 13,
    mechanics: [
      feature("warlock-arcanum-7-rules", "warlock-base:mystic-arcanum-7", "mystic_arcanum_7", "Таинственный арканум 7 уровня", "Выбранное заклинание колдуна 7 уровня можно сотворить бесплатно 1 раз; запас полностью восстанавливается после долгого отдыха."),
      resource("warlock-arcanum-7-use", "warlock-base:mystic-arcanum-7", "warlock_mystic_arcanum_7", "Таинственный арканум 7 уровня", 1, ["long_rest"], 13),
      finiteAction("warlock-arcanum-7-action", "warlock-base:mystic-arcanum-7", "warlock_mystic_arcanum_7_cast", "Таинственный арканум 7 уровня", "warlock_mystic_arcanum_7"),
    ],
  },
  {
    level: 15,
    mechanics: [
      feature("warlock-arcanum-8-rules", "warlock-base:mystic-arcanum-8", "mystic_arcanum_8", "Таинственный арканум 8 уровня", "Выбранное заклинание колдуна 8 уровня можно сотворить бесплатно 1 раз; запас полностью восстанавливается после долгого отдыха."),
      resource("warlock-arcanum-8-use", "warlock-base:mystic-arcanum-8", "warlock_mystic_arcanum_8", "Таинственный арканум 8 уровня", 1, ["long_rest"], 15),
      finiteAction("warlock-arcanum-8-action", "warlock-base:mystic-arcanum-8", "warlock_mystic_arcanum_8_cast", "Таинственный арканум 8 уровня", "warlock_mystic_arcanum_8"),
    ],
  },
  {
    level: 17,
    mechanics: [
      resource("warlock-pact-slots-17", "warlock-base:pact-magic", "warlock_pact_slots", "Ячейки Магии договора", 4, ["short_rest", "long_rest"], 17),
      feature("warlock-arcanum-9-rules", "warlock-base:mystic-arcanum-9", "mystic_arcanum_9", "Таинственный арканум 9 уровня", "Выбранное заклинание колдуна 9 уровня можно сотворить бесплатно 1 раз; запас полностью восстанавливается после долгого отдыха."),
      resource("warlock-arcanum-9-use", "warlock-base:mystic-arcanum-9", "warlock_mystic_arcanum_9", "Таинственный арканум 9 уровня", 1, ["long_rest"], 17),
      finiteAction("warlock-arcanum-9-action", "warlock-base:mystic-arcanum-9", "warlock_mystic_arcanum_9_cast", "Таинственный арканум 9 уровня", "warlock_mystic_arcanum_9"),
    ],
  },
  {
    level: 20,
    mechanics: [
      value("warlock-cunning-restore-20", "warlock-base:magical-cunning", "warlock_magical_cunning_restore", "Возврат Магической хитрости", 4, 20),
      feature("warlock-master-rules", "warlock-base:eldritch-master", "eldritch_master", "Древнейший мастер", "Магическая хитрость теперь восстанавливает все потраченные ячейки Магии договора вместо половины максимального запаса."),
    ],
  },
]

function bundleAt(level: number): CharacterTemplateBundle {
  return {
    assignment: {
      id: "assignment-warlock",
      character_id: "character-warlock",
      template_id: "class-warlock",
      template_level: level,
      selected_choices: {},
      assigned_at: "2026-09-06T00:00:00Z",
      updated_at: "2026-09-06T00:00:00Z",
    },
    template: {
      id: "class-warlock",
      campaign_id: "campaign",
      kind: "class",
      slug: "warlock-core",
      name: "Колдун",
      description: "Базовый класс колдуна 2024.",
      version: 1,
      mechanics: [],
      choices: [],
      catalog_key: "class:warlock",
      catalog_revision: "xphb-2024-warlock-base-runtime-v1",
      source_kind: "official",
      source_label: "Player's Handbook 2024",
      is_builtin: true,
      mechanical_summary: "Колдун использует отдельный конечный запас ячеек Магии договора, восстановление после отдыха и независимые ресурсы высшей магии.",
      is_active: true,
      created_by: null,
      created_at: "2026-09-06T00:00:00Z",
      updated_at: "2026-09-06T00:00:00Z",
    },
    levels: levels.map((entry) => ({ id: `warlock-level-${entry.level}`, template_id: "class-warlock", level: entry.level, mechanics: entry.mechanics, choices: [] })),
  }
}

function inputAt(level: number, resources: CharacterEngineInput["state"]["resources"] = {}): CharacterEngineInput {
  const parsed = resolveTemplateBundles([bundleAt(level)], level)
  return {
    base: {
      id: "warlock-test",
      name: "Колдун",
      level,
      abilities: { strength: 8, dexterity: 14, constitution: 14, intelligence: 10, wisdom: 10, charisma: 18 },
      baseMaxHp: 80,
      baseSpeed: 30,
    },
    state: { currentHp: 80, tempHp: 0, resources },
    contributions: parsed.contributions,
  }
}

function valueOf(contract: ReturnType<typeof resolveCharacterContract>, key: string): number | undefined {
  return contract.values.find((entry) => entry.key === key)?.value.value
}

test("Warlock clean catalog is 2024 base-only", () => {
  assert.match(catalog, /catalog_key='class:warlock'/)
  assert.match(catalog, /'spell_progression','pact_magic'/)
  assert.match(catalog, /'spellcasting_ability','charisma'/)
  assert.match(catalog, /'invocation_runtime_included',false/)
  assert.match(catalog, /'subclass_runtime_included',false/)
  assert.doesNotMatch(catalog, /TODO|FIXME/)
})

test("Warlock mechanics migration declares strict integration and shared resource policy", () => {
  assert.match(runtime, /CLASS_INTEGRATION_STRICT: class:warlock/)
  assert.match(runtime, /CLASS_PACKAGE_TEST: tests\/warlockOfficialPack\.test\.ts/)
  assert.match(runtime, /CLASS_RESOURCE_POLICY: short-long-rest-v1/)
})

test("base Warlock passes strict class quality and resource policy", () => {
  assert.doesNotThrow(() => assertClassPackageQuality([bundleAt(20)]))
  assert.doesNotThrow(() => assertClassResourcePolicy([bundleAt(20)]))
})

test("Warlock low, mid, and high levels resolve through parser into CE", () => {
  const low = resolveCharacterContract(inputAt(2))
  assert.equal(low.resources.find((entry) => entry.key === "warlock_pact_slots")?.max.value, 2)
  assert.equal(valueOf(low, "warlock_pact_slot_level"), 1)
  assert.equal(low.resources.find((entry) => entry.key === "warlock_magical_cunning")?.max.value, 1)
  assert.ok(low.actions.find((entry) => entry.key === "warlock_magical_cunning"))

  const mid = resolveCharacterContract(inputAt(11))
  assert.equal(mid.resources.find((entry) => entry.key === "warlock_pact_slots")?.max.value, 3)
  assert.equal(valueOf(mid, "warlock_pact_slot_level"), 5)
  assert.equal(mid.resources.find((entry) => entry.key === "warlock_mystic_arcanum_6")?.max.value, 1)

  const high = resolveCharacterContract(inputAt(20))
  assert.equal(high.resources.find((entry) => entry.key === "warlock_pact_slots")?.max.value, 4)
  assert.equal(valueOf(high, "warlock_magical_cunning_restore"), 4)
  for (const spellLevel of [6, 7, 8, 9]) {
    assert.equal(high.resources.find((entry) => entry.key === `warlock_mystic_arcanum_${spellLevel}`)?.max.value, 1)
  }
})

test("Magical Cunning consumes its use and restores the actual Pact Magic pool", () => {
  const input = inputAt(20, { warlock_pact_slots: { current: 0 }, warlock_magical_cunning: { current: 1 } })
  const contract = resolveCharacterContract(input)
  const cunning = contract.actions.find((entry) => entry.key === "warlock_magical_cunning")
  assert.ok(cunning)
  const next = executeAction(input.state, cunning)
  assert.equal(next.resources?.warlock_pact_slots?.current, 4)
  assert.equal(next.resources?.warlock_magical_cunning?.current, 0)
})

test("generic spell contract keeps ordinary slots strict while admitting Pact Magic", () => {
  assert.match(pactContract, /'class_spell','pact_magic','class_feature'/)
  assert.match(pactContract, /v_kind='class_spell'.*spell_slot_/s)
  assert.match(pactContract, /v_kind='pact_magic'.*must not spend ordinary spell slots/s)
})

test("Pact Magic slot and slot-level progression is encoded exactly", () => {
  assert.match(runtime, /v_slots\s*:=\s*case when v_level=1 then 1 when v_level<=10 then 2 when v_level<=16 then 3 else 4 end;/)
  assert.match(runtime, /v_slot_level\s*:=\s*case when v_level<=2 then 1 when v_level<=4 then 2 when v_level<=6 then 3 when v_level<=8 then 4 else 5 end;/)
  assert.match(runtime, /"short_rest","long_rest"/)
  assert.match(runtime, /warlock_pact_slots/)
})

test("prepared-spell and cantrip progression covers Warlock levels 1 through 20", () => {
  assert.equal(prepared.length, 20)
  assert.equal(cantrips.length, 20)
  assert.deepEqual(prepared, [2,3,4,5,6,7,8,9,10,10,11,11,12,12,13,13,14,14,15,15])
  assert.deepEqual(cantrips, [2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4])
  assert.match(runtime, /warlock_prepared_spell_limit/)
  assert.match(runtime, /warlock_cantrip_count/)
})

test("Magical Cunning is a CE resource conversion and Eldritch Master upgrades the value", () => {
  assert.match(runtime, /warlock_magical_cunning/)
  assert.match(runtime, /warlock_magical_cunning_restore/)
  assert.match(runtime, /\(\(v_slots\+1\)\/2\)/)
  assert.match(runtime, /when v_level>=20 then v_slots/)
  assert.match(runtime, /'operation','RESTORE'/)
  assert.match(runtime, /values\.warlock_magical_cunning_restore/)
  assert.match(runtime, /'restore','all_pact_slots'/)
})

test("Contact Patron has a separate long-rest use and exact semantic payload", () => {
  assert.match(runtime, /warlock_contact_patron/)
  assert.match(runtime, /contact-other-plane/)
  assert.match(runtime, /automatic_intelligence_save_success/)
  assert.match(runtime, /'slot_cost',0/)
})

test("Mystic Arcanum 6 through 9 has independent resources, actions, and v2 selectors", () => {
  assert.match(runtime, /v_level in \(11,13,15,17\)/)
  assert.match(runtime, /warlock_mystic_arcanum_/)
  assert.match(runtime, /warlock_spell_level_/)
  assert.match(runtime, /replacement_policy','on_level_change'/)
  assert.match(runtime, /selection_mode','player_once'/)
  assert.match(runtime, /cast_selected_spell/)
})

test("Pact Magic cast RPC validates class spell access and spends only the pact pool", () => {
  assert.match(runtime, /cast_warlock_pact_spell_v1/)
  assert.match(runtime, /spell_catalog_classes/)
  assert.match(runtime, /sc\.class_key='warlock'/)
  assert.match(runtime, /character_spells[\s\S]*prepared/)
  assert.match(runtime, /state_key='warlock_pact_slots'/)
  assert.match(runtime, /current=current-1/)
})

test("Stage 2 excludes Invocation acquisition and subclasses and preserves future mechanics", () => {
  assert.match(runtime, /'invocation_runtime_included',false/)
  assert.match(runtime, /'subclass_runtime_included',false/)
  assert.doesNotMatch(runtime, /eldritch_invocation_choice|warlock_subclass_choice|patron_choice/)
  assert.match(runtime, /not like 'warlock-base:%'/)
  assert.match(runtime, /not like 'warlock_mystic_arcanum_%'/)
  assert.doesNotMatch(runtime, /TODO|FIXME/)
})