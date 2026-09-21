import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  resolveCharacterContract,
  resolveD20Floor,
  resolveD20ResultOverride,
} from "../src/character-engine/index.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"
import type {
  StoredMechanic,
  StoredMechanics,
} from "../src/types/characterMechanics.ts"

const migration = fs.readFileSync(
  "supabase/migrations/20260921140000_rogue_stage4_base_runtime_v1.sql",
  "utf8",
)
const genaGateway = fs.readFileSync("src/game-engine/supabase.ts", "utf8")
const chatHost = fs.readFileSync(
  "src/ui-v1-isolated/chat-room/ChatActionHost.tsx",
  "utf8",
)

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

function bundle(): CharacterTemplateBundle {
  const levels: CharacterTemplateBundle["levels"] = Array.from(
    { length: 20 },
    (_, index) => ({
      id: `rogue-stage4-l${index + 1}`,
      template_id: "rogue-stage4",
      level: index + 1,
      mechanics: [] as StoredMechanics,
      choices: [],
    }),
  )
  const at = (level: number) =>
    levels.find((entry) => entry.level === level)!.mechanics

  at(5).push(
    feature(
      "rogue-uncanny-dodge-feature-l5",
      "uncanny-dodge",
      "class:rogue:uncanny-dodge:l5",
      "Невероятное уклонение",
      "Когда видимый вами атакующий попадает по вам броском атаки, вы можете Реакцией уменьшить урон этой атаки вдвое, округляя вниз.",
      {
        kind: "incoming_attack_damage_rule",
        trigger: "visible_attacker_hits_with_attack_roll",
        economy: "reaction",
        adjudication: "gm",
      },
    ),
    {
      id: "rogue-uncanny-dodge-action",
      type: "action",
      sourceKey: "uncanny-dodge",
      key: "rogue_uncanny_dodge",
      label: "Невероятное уклонение",
      economy: "reaction",
      range: { kind: "self" },
      effects: [{
        kind: "semantic",
        key: "incoming_attack_damage_multiplier",
        payload: {
          numerator: 1,
          denominator: 2,
          round: "down",
          adjudication: "gm",
        },
      }],
      tags: ["rogue", "reaction", "gm-confirmed"],
    },
  )

  at(7).push(
    feature(
      "rogue-evasion-feature-l7",
      "evasion",
      "class:rogue:evasion:l7",
      "Увёртливость",
      "При спасброске Ловкости для половины урона вы получаете 0 урона при успехе и половину при провале; способность не работает, пока вы Недееспособны.",
      {
        kind: "saving_throw_damage_rule",
        ability: "dexterity",
        trigger: "half_damage_on_success",
        successDamageNumerator: 0,
        failureDamageNumerator: 1,
        failureDamageDenominator: 2,
        disabledCondition: "incapacitated",
      },
    ),
    feature(
      "rogue-reliable-talent-feature-l7",
      "reliable-talent",
      "class:rogue:reliable-talent:l7",
      "Надёжный талант",
      "Когда вы совершаете проверку характеристики, использующую навык или инструмент, которым владеете, результат d20 9 или ниже считается равным 10.",
      {
        kind: "d20_minimum",
        minimum: 10,
        testKinds: ["skill", "tool"],
        requiresProficiency: true,
        appliesToRawD20: true,
      },
    ),
  )

  at(15).push(
    feature(
      "rogue-slippery-mind-feature-l15",
      "slippery-mind",
      "class:rogue:slippery-mind:l15",
      "Скользкий ум",
      "Вы получаете владение спасбросками Мудрости и Харизмы.",
      {
        kind: "saving_throw_proficiency_grant",
        abilities: ["wisdom", "charisma"],
      },
    ),
    {
      id: "rogue-slippery-mind-wisdom-save",
      type: "grant",
      sourceKey: "slippery-mind",
      target: "proficiency",
      key: "savingThrow:wisdom",
      payload: { rank: 1, label: "Спасбросок: Мудрость" },
    },
    {
      id: "rogue-slippery-mind-charisma-save",
      type: "grant",
      sourceKey: "slippery-mind",
      target: "proficiency",
      key: "savingThrow:charisma",
      payload: { rank: 1, label: "Спасбросок: Харизма" },
    },
  )

  at(18).push(
    feature(
      "rogue-elusive-feature-l18",
      "elusive",
      "class:rogue:elusive:l18",
      "Неуловимый",
      "Ни один бросок атаки против вас не может иметь Преимущество, пока вы не Недееспособны.",
      {
        kind: "attack_advantage_rule",
        againstSelf: true,
        advantageForbidden: true,
        disabledCondition: "incapacitated",
      },
    ),
  )

  at(20).push(
    feature(
      "rogue-stroke-of-luck-feature-l20",
      "stroke-of-luck",
      "class:rogue:stroke-of-luck:l20",
      "Мастерский удар",
      "Когда вы проваливаете D20 Test, вы можете превратить результат броска d20 в 20. После применения способность восстанавливается после короткого или долгого отдыха.",
      {
        kind: "d20_result_override",
        trigger: "failed_d20_test",
        result: 20,
        usesResourceKey: "rogue_stroke_of_luck",
        adjudication: "gm",
      },
    ),
    {
      id: "rogue-stroke-of-luck-resource",
      type: "resource",
      sourceKey: "stroke-of-luck",
      key: "rogue_stroke_of_luck",
      label: "Мастерский удар",
      max: 1,
      recharge: ["short_rest", "long_rest"],
      initial: "full",
      grantOperation: "REPLACE",
      priority: 20,
    },
    {
      id: "rogue-stroke-of-luck-action",
      type: "action",
      sourceKey: "stroke-of-luck",
      key: "rogue_stroke_of_luck_override",
      label: "Мастерский удар: результат 20",
      economy: "triggered",
      range: { kind: "self" },
      resourceCosts: [{ key: "rogue_stroke_of_luck", amount: 1 }],
      effects: [{
        kind: "semantic",
        key: "d20_result_override",
        payload: {
          result: 20,
          trigger: "failed_d20_test",
          adjudication: "gm",
        },
      }],
      tags: ["rogue", "d20", "result-override", "gm-confirmed"],
    },
  )

  return {
    assignment: {
      id: "rogue-stage4-assignment",
      character_id: "rogue-stage4-character",
      template_id: "rogue-stage4",
      template_level: 20,
      selected_choices: {},
      assigned_at: "2026-09-21T00:00:00Z",
      updated_at: "2026-09-21T00:00:00Z",
    },
    template: {
      id: "rogue-stage4",
      campaign_id: "campaign",
      kind: "class",
      slug: "rogue-core",
      name: "Разбойник",
      description:
        "Базовый Разбойник 2024 использует общие CE-правила для реакций, проверок, владений и конечных ресурсов.",
      version: 1,
      mechanics: [],
      choices: [],
      parent_template_id: null,
      unlock_level: null,
      catalog_key: "class:rogue",
      catalog_revision: "xphb-2024-rogue-stage4-base-runtime-v1",
      source_kind: "official",
      source_label: "Player's Handbook 2024",
      is_builtin: true,
      mechanical_summary:
        "Базовый runtime Разбойника 1–20: реакционная защита, Увёртливость, Надёжный талант, дополнительные спасброски, Неуловимый и Мастерский удар.",
      author_description: "",
      author_comment: "",
      rules_meta: {
        mechanics_status: "IN_PROGRESS_STAGE4_BASE_RUNTIME_CERTIFIED",
        base_runtime_certified: true,
      },
      is_active: true,
      created_by: null,
      created_at: "2026-09-21T00:00:00Z",
      updated_at: "2026-09-21T00:00:00Z",
    },
    levels,
  }
}

function contract() {
  const rogue = bundle()
  const parsed = resolveTemplateBundles([rogue], 20)
  return {
    rogue,
    parsed,
    contract: resolveCharacterContract({
      base: {
        id: "rogue-stage4-character",
        name: "Разбойник",
        level: 20,
        abilities: {
          strength: 10,
          dexterity: 18,
          constitution: 14,
          intelligence: 12,
          wisdom: 10,
          charisma: 12,
        },
        baseMaxHp: 100,
        baseSpeed: 30,
      },
      state: {
        currentHp: 100,
        tempHp: 0,
        resources: { rogue_stroke_of_luck: 1 },
      },
      contributions: parsed.contributions,
    }),
  }
}

test("Stage 4 representative base package passes shared quality/resource/parser/CE gates", () => {
  const { rogue, parsed, contract: resolved } = contract()
  assert.doesNotThrow(() => assertClassPackageQuality([rogue]))
  assert.doesNotThrow(() => assertClassResourcePolicy([rogue]))
  assert.ok(parsed.contributions.length > 0)
  assert.equal(resolved.id, "rogue-stage4-character")
})

test("Reliable Talent uses the generic d20 floor only for proficient skill/tool checks", () => {
  const { contract: resolved } = contract()

  assert.deepEqual(
    resolveD20Floor(resolved, {
      kind: "skill",
      key: "stealth",
      proficiencyRank: 1,
    }),
    {
      minimum: 10,
      ruleKeys: ["class:rogue:reliable-talent:l7"],
    },
  )
  assert.equal(
    resolveD20Floor(resolved, {
      kind: "skill",
      key: "stealth",
      proficiencyRank: 0,
    }),
    null,
  )
  assert.equal(
    resolveD20Floor(resolved, {
      kind: "save",
      key: "dexterity",
      proficiencyRank: 1,
    }),
    null,
  )
  assert.equal(
    resolveD20Floor(resolved, {
      kind: "tool",
      key: "tool:thieves-tools",
      proficient: true,
    })?.minimum,
    10,
  )
})

test("Slippery Mind grants native Wisdom and Charisma saving throw proficiency", () => {
  const { contract: resolved } = contract()
  assert.equal(resolved.savingThrows.wisdom.proficiencyRank, 1)
  assert.equal(resolved.savingThrows.charisma.proficiencyRank, 1)
  assert.equal(resolved.savingThrows.wisdom.bonus.value, 6)
  assert.equal(resolved.savingThrows.charisma.bonus.value, 7)
})

test("Stroke of Luck is a real shared resource plus a generic d20 override action", () => {
  const { contract: resolved } = contract()
  const resource = resolved.resources.find(
    (entry) => entry.stateKey === "rogue_stroke_of_luck",
  )
  assert.ok(resource)
  assert.equal(resource.current, 1)
  assert.equal(resource.max.value, 1)
  assert.deepEqual(resource.recharge.triggers, ["short_rest", "long_rest"])

  const action = resolved.actions.find(
    (entry) => entry.key === "rogue_stroke_of_luck_override",
  )
  assert.ok(action)
  assert.equal(action.resourceCosts[0]?.amount, 1)
  assert.deepEqual(resolveD20ResultOverride(action), {
    result: 20,
    trigger: "failed_d20_test",
    adjudication: "gm",
  })
})

test("Stage 4 installs a server-authoritative generic d20 floor roll path", () => {
  assert.match(migration, /create or replace function public\.send_chat_roll_v4/)
  assert.match(migration, /v_d20:=greatest\(v_d20_raw,p_d20_floor\)/)
  assert.match(migration, /'d20Raw',v_d20_raw/)
  assert.match(migration, /'d20Floor',p_d20_floor/)
  assert.match(
    migration,
    /grant execute on function public\.send_chat_roll_v4[\s\S]*?to authenticated,service_role/,
  )
  assert.match(genaGateway, /rpc\("send_chat_roll_v4"/)
  assert.match(chatHost, /resolveD20Floor/)
})

test("Stage 4 closes the six remaining base Rogue features without subclass activation", () => {
  for (const marker of [
    "rogue-uncanny-dodge-feature-l5",
    "rogue-evasion-feature-l7",
    "rogue-reliable-talent-feature-l7",
    "rogue-slippery-mind-feature-l15",
    "rogue-elusive-feature-l18",
    "rogue-stroke-of-luck-feature-l20",
    "rogue-stroke-of-luck-resource",
    "rogue-stroke-of-luck-action",
  ]) {
    assert.ok(migration.includes(marker), marker)
  }
  assert.match(migration, /base_runtime_certified',true/)
  assert.match(migration, /subclass_runtime_included',false/)
  assert.match(migration, /ROGUE_STAGE4_SUBCLASS_RUNTIME_LEAK/)
  assert.doesNotMatch(migration, /mechanics_status','READY'/)
})

test("Stage 4 fail-closed certification requires all 15 canonical base feature source keys", () => {
  for (const key of [
    "sneak-attack",
    "expertise",
    "thieves-cant",
    "weapon-mastery",
    "cunning-action",
    "steady-aim",
    "cunning-strike",
    "uncanny-dodge",
    "evasion",
    "reliable-talent",
    "improved-cunning-strike",
    "devious-strikes",
    "slippery-mind",
    "elusive",
    "stroke-of-luck",
  ]) {
    assert.ok(migration.includes(`('${key}')`), key)
  }
})
