import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveCharacterContract } from "../src/character-engine/index.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"

const migration = fs.readFileSync(
  "supabase/migrations/20260918054000_cleric_cantrip_runtime_stage2.sql",
  "utf8",
)

const cantripMechanic = (slug: string, name: string, school: string) => ({
  id: `cleric-stage2-cantrip-${slug}`,
  type: "spell",
  key: `spell:${slug}`,
  sourceKey: "cleric-stage2:spellcasting",
  variantKey: `cleric:spellcasting:${slug}`,
  catalogSlug: slug,
  grantOperation: "GRANT",
  payload: {
    spell: { name, level: 0, school, ritual: false },
    preparation: { mode: "not_required" },
    methods: [{
      key: "cleric-cast",
      kind: "class_spell",
      ability: "wisdom",
      requiresPrepared: false,
    }],
  },
})

test("cleric stage 2 migration authors the base cantrip choice from the canonical catalog", () => {
  assert.match(migration, /lower\(scc\.class_key\) = 'cleric'/)
  assert.match(migration, /sc\.spell_level = 0/)
  assert.match(migration, /'key', 'cleric_cantrips'/)
  assert.match(migration, /'count_by_level', jsonb_build_object\('1', 3, '4', 4, '10', 5\)/)
  assert.match(migration, /'target', 'spell'/)
  assert.match(migration, /'preparation', jsonb_build_object\('mode', 'not_required'\)/)
  assert.match(migration, /rule_template_spell_links/)
  assert.match(migration, /cleric-stage2-cantrip-/)
})

test("cleric stage 2 backfill preserves canonical rows before deterministic defaults", () => {
  assert.match(migration, /from public\.character_spells cs/)
  assert.match(migration, /cs\.catalog_spell_id/)
  assert.match(migration, /v_defaults constant text\[\]/)
  assert.match(migration, /jsonb_set\([\s\S]*'\{cleric_cantrips\}'/)
  assert.match(migration, /when v_assignment\.template_level >= 4 then 4/)
})

test("selected cleric cantrips resolve through template mechanics into CE spell cards", () => {
  const choices = {
    key: "cleric_cantrips",
    count: 3,
    count_by_level: { "1": 3, "4": 4, "10": 5 },
    target: "spell",
    options: ["guidance", "sacred-flame", "thaumaturgy", "spare-the-dying"],
    option_mechanics: {
      guidance: [cantripMechanic("guidance", "Наставление", "Divination")],
      "sacred-flame": [cantripMechanic("sacred-flame", "Священное пламя", "Evocation")],
      thaumaturgy: [cantripMechanic("thaumaturgy", "Чудотворство", "Transmutation")],
      "spare-the-dying": [cantripMechanic("spare-the-dying", "Уход за умирающим", "Necromancy")],
    },
  }

  const bundle = {
    assignment: {
      id: "cleric-assignment",
      character_id: "cleric-hero",
      template_id: "cleric-template",
      template_level: 4,
      selected_choices: {
        cleric_cantrips: [
          "guidance",
          "sacred-flame",
          "thaumaturgy",
          "spare-the-dying",
        ],
      },
      assigned_at: "",
      updated_at: "",
    },
    template: {
      id: "cleric-template",
      campaign_id: "campaign",
      kind: "class",
      slug: "cleric-core",
      name: "Жрец",
      description: "",
      version: 1,
      mechanics: [],
      choices: [],
      parent_template_id: null,
      unlock_level: null,
      is_active: true,
      created_by: null,
      created_at: "",
      updated_at: "",
    },
    levels: [{
      id: "cleric-level-1",
      template_id: "cleric-template",
      level: 1,
      mechanics: [],
      choices: [choices],
    }],
  } as any

  const resolved = resolveTemplateBundles([bundle], 4)
  const spellContributions = resolved.contributions.filter(
    (entry) => entry.kind === "grant" && entry.target === "spell",
  )

  assert.equal(spellContributions.length, 4)

  const contract = resolveCharacterContract({
    base: {
      id: "cleric-hero",
      name: "Жрец",
      level: 4,
      abilities: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 18,
        charisma: 10,
      },
      baseMaxHp: 28,
      baseSpeed: 30,
      skillProficiencies: {},
      savingThrowProficiencies: {},
    },
    state: {
      currentHp: 28,
      tempHp: 0,
      resources: {},
    },
    contributions: resolved.contributions,
  } as any)

  assert.deepEqual(
    contract.spells.map((spell) => [spell.key, spell.identity.level]),
    [
      ["spell:guidance", 0],
      ["spell:sacred-flame", 0],
      ["spell:spare-the-dying", 0],
      ["spell:thaumaturgy", 0],
    ],
  )
  assert.equal(contract.spells.every((spell) => spell.available), true)
  assert.equal(
    contract.spells.every((spell) =>
      spell.accesses.every((access) => access.preparationMode === "not_required"),
    ),
    true,
  )
})
