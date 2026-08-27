import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { classReference } from "../src/data/classReference.ts"
import { druidReference } from "../src/data/classes/druidReference.ts"

const coreSql = fs.readFileSync(
  "supabase/migrations/20260827180000_official_class_catalog.sql",
  "utf8",
)
const subclassSql = fs.readFileSync(
  "supabase/migrations/20260827180100_official_subclass_catalog.sql",
  "utf8",
)
const detailedDruidSql = fs.readFileSync(
  "supabase/migrations/20260827170100_druid_official_subclasses_2024.sql",
  "utf8",
)

function embeddedCatalog(sql: string) {
  const match = sql.match(/v_catalog jsonb := \$catalog\$(.*?)\$catalog\$::jsonb/s)
  assert.ok(match?.[1], "embedded catalog is missing")
  return JSON.parse(match[1]) as Array<Record<string, any>>
}

const classes = embeddedCatalog(coreSql)
const generatedSubclasses = embeddedCatalog(subclassSql)

test("the mechanical catalog contains all thirteen main classes", () => {
  const keys = new Set(classes.map((entry) => entry.key))
  keys.add("druid")
  assert.deepEqual([...keys].sort(), [
    "artificer", "barbarian", "bard", "cleric", "druid", "fighter", "monk",
    "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard",
  ])
  assert.equal(classes.length, 12)
  assert.ok(classes.every((entry) => entry.features.length >= 15))
  assert.match(coreSql, /private\.install_official_class_catalog/)
  assert.match(coreSql, /private\.official_slot_mechanics/)
})

test("base classes emit native slots, resources, actions and suppressible sources", () => {
  const allMechanics = classes.flatMap((entry) => [
    ...entry.features.flatMap((feature: any) => feature.runtime || []),
    ...Object.values(entry.progression || {}).flat(),
  ])
  for (const key of [
    "rage", "bardic_inspiration", "channel_divinity", "second_wind",
    "focus_points", "lay_on_hands", "favored_enemy", "sorcery_points",
    "pact_slots", "arcane_recovery", "flash_of_genius",
  ]) assert.equal(allMechanics.some((item: any) => item.key === key), true, key)

  assert.equal(allMechanics.some((item: any) => item.type === "action"), true)
  assert.ok(classes.every((entry) => entry.features.every((feature: any) => feature.key)))
  for (const caster of ["artificer", "bard", "cleric", "paladin", "ranger", "sorcerer", "wizard"]) {
    const entry = classes.find((item) => item.key === caster)
    assert.ok(entry?.slots?.length === 20, caster)
  }
})

test("the latest official selection totals 129 subclasses without parallel old copies", () => {
  assert.equal(generatedSubclasses.length, 125)
  for (const key of [
    "subclass:druid:land", "subclass:druid:moon",
    "subclass:druid:sea", "subclass:druid:stars",
  ]) assert.match(detailedDruidSql, new RegExp(key.replaceAll(":", "\\:")))

  const expected: Record<string, number> = {
    artificer: 6, barbarian: 10, bard: 10, cleric: 14, druid: 8,
    fighter: 10, monk: 10, paladin: 10, ranger: 10, rogue: 10,
    sorcerer: 9, warlock: 9, wizard: 13,
  }
  const actual: Record<string, number> = {}
  for (const entry of generatedSubclasses) {
    actual[entry.classKey] = (actual[entry.classKey] || 0) + 1
  }
  actual.druid = (actual.druid || 0) + 4
  assert.deepEqual(actual, expected)

  const slugs = new Set(generatedSubclasses.map((entry) => entry.slug))
  for (const slug of [
    "artificer-cartographer", "artificer-reanimator", "bard-college-of-the-moon",
    "fighter-banneret", "paladin-oath-of-the-noble-genies",
    "ranger-winter-walker", "ranger-hollow-warden",
    "rogue-scion-of-the-three", "sorcerer-spellfire-sorcery",
    "warlock-undead-patron",
  ]) assert.equal(slugs.has(slug), true, slug)

  for (const removed of [
    "barbarian-path-of-the-totem-warrior",
    "sorcerer-aberrant-mind",
    "sorcerer-clockwork-soul",
    "wizard-school-of-abjuration",
    "fighter-purple-dragon-knight",
  ]) assert.equal(slugs.has(removed), false, removed)
})

test("every generated subclass has level mechanics, stable sources and structured rules", () => {
  const features = generatedSubclasses.flatMap((entry) => entry.features)
  const spells = generatedSubclasses.flatMap((entry) => entry.spells)
  const actions = features.flatMap((entry: any) => entry.runtime || [])
    .filter((entry: any) => entry.type === "action")

  assert.equal(features.length, 525)
  assert.equal(spells.length, 505)
  assert.ok(actions.length > 40)
  assert.ok(features.every((entry: any) => entry.level >= 1 && entry.level <= 20))
  assert.ok(features.every((entry: any) => entry.sourceKey && entry.mechanic))
  assert.ok(features.every((entry: any) => /[А-Яа-яЁё]/.test(entry.label)))
  assert.match(subclassSql, /private\.official_subclass_spell_mechanic/)
  assert.match(subclassSql, /'sourceKey',v_feature->>'sourceKey'/)
})

test("the in-app reference exposes the same 129 subclasses", () => {
  const total = classReference.reduce((sum, entry) => sum + entry.subclasses.length, 0)
  assert.equal(total, 129)
  assert.equal(druidReference.subclasses.length, 8)

  const required = new Set(classReference.flatMap((entry) =>
    entry.subclasses.map((subclass) => `${entry.id}:${subclass.id}`),
  ))
  for (const key of [
    "artificer:cartographer", "artificer:reanimator", "bard:moon",
    "fighter:banneret", "paladin:noble-genies", "ranger:hollow-warden",
    "ranger:winter-walker", "rogue:scion-of-the-three", "sorcerer:spellfire",
  ]) assert.equal(required.has(key), true, key)
})

test("player-facing Druid copy contains rules, not service history", () => {
  const visible = JSON.stringify({
    tagline: druidReference.tagline,
    mechanicalSummary: druidReference.mechanicalSummary,
    authorDescription: druidReference.authorDescription,
    authorComment: druidReference.authorComment,
    features: druidReference.features,
    subclasses: druidReference.subclasses,
  })
  assert.doesNotMatch(visible, /2014|2024|Character Engine|\bparser\b|\bCE\b/i)
  assert.match(visible, /два|2/)
  assert.match(visible, /запас здоровья зверя|HP и физические параметры зверя/i)
})
