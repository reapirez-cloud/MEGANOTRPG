import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { getDruidBaseFeatureNuances, getDruidSubclassFeatureNuances } from "../src/data/classes/druidNuances.ts"
import { druidReference } from "../src/data/classes/druidReference.ts"

const guide = fs.readFileSync("src/components/reference/ReferenceGuide.tsx", "utf8")

const subclassFeatures: Record<string, string[]> = {
  dreams: ["Бальзам Летнего Двора", "Очаг лунного света и тени", "Скрытые пути", "Странник во снах"],
  spores: ["Ореол спор и Симбиотическая сущность", "Грибковое заражение", "Распространение спор", "Грибковое тело"],
  shepherd: ["Речь леса и Духовный тотем", "Могучий призыватель", "Дух-хранитель", "Верный призыв"],
  wildfire: ["Заклинания Круга и Огненный дух", "Усиленная связь", "Прижигающее пламя", "Пылающее возрождение"],
  land: ["Заклинания Круга Земли", "Помощь земли", "Природное восстановление", "Защита природы", "Святилище природы"],
  moon: ["Формы круга и заклинания Луны", "Улучшенные формы круга", "Лунный шаг", "Лунная форма", "Лунный шаг · спутник"],
  sea: ["Гнев моря и заклинания Круга", "Связь с водой", "Рождённый бурей", "Дар океана"],
  stars: ["Звёздная карта", "Звёздная форма", "Космическое знамение", "Мерцающие созвездия", "Звёздная форма · усиление", "Полон звёзд"],
}

test("base druid features have distinct authored nuances", () => {
  const sets = druidReference.features.map((feature) => getDruidBaseFeatureNuances(feature.level, feature.name))
  for (const nuances of sets) assert.ok(nuances.length > 0)
  assert.equal(new Set(sets.map((nuances) => JSON.stringify(nuances))).size, sets.length)
})

test("druid subclass features have distinct authored nuances", () => {
  const sets: string[][] = []
  for (const [subclassId, names] of Object.entries(subclassFeatures)) {
    for (const name of names) {
      const nuances = getDruidSubclassFeatureNuances(subclassId, name)
      assert.ok(nuances.length > 0, `${subclassId}: ${name}`)
      sets.push(nuances)
    }
  }
  assert.equal(new Set(sets.map((nuances) => JSON.stringify(nuances))).size, sets.length)
})

test("catalog aliases keep authored druid nuances", () => {
  assert.deepEqual(getDruidSubclassFeatureNuances("circle-of-dreams", "Бальзам Летнего Двора"), getDruidSubclassFeatureNuances("dreams", "Бальзам Летнего Двора"))
  assert.deepEqual(getDruidSubclassFeatureNuances("circle-of-spores", "Грибковое тело"), getDruidSubclassFeatureNuances("spores", "Грибковое тело"))
  assert.deepEqual(getDruidSubclassFeatureNuances("circle-of-the-shepherd", "Верный призыв"), getDruidSubclassFeatureNuances("shepherd", "Верный призыв"))
  assert.deepEqual(getDruidSubclassFeatureNuances("circle-of-wildfire", "Пылающее возрождение"), getDruidSubclassFeatureNuances("wildfire", "Пылающее возрождение"))
})

test("ReferenceGuide uses authored druid nuance overrides", () => {
  assert.match(guide, /getDruidBaseFeatureNuances/)
  assert.match(guide, /getDruidSubclassFeatureNuances/)
})
