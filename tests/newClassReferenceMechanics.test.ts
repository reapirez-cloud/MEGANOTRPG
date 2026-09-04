import assert from "node:assert/strict"
import test from "node:test"

import { classReference } from "../src/data/classReference.ts"
import fs from "node:fs"

const expected = ["bard", "monk", "paladin", "sorcerer", "warlock"]

test("translated new classes expose complete reference mechanics without runtime activation", () => {
  for (const classId of expected) {
    const entry = classReference.find((candidate) => candidate.id === classId)
    assert.ok(entry, `${classId} is absent from class reference`)
    assert.equal(entry.referenceOnly, true, `${classId} must remain reference-only`)
    assert.ok(entry.features?.length, `${classId} has no base feature cards`)

    for (const feature of entry.features ?? []) {
      assert.ok(feature.mechanics.trim(), `${classId}/${feature.level}/${feature.name} has no mechanics`)
      if (!feature.explanation.trim()) {
        assert.match(feature.translationNote ?? "", /Перевода способности пока нет/)
      }
    }

    for (const subclass of entry.subclasses) {
      assert.ok(subclass.features?.length, `${classId}/${subclass.id} has no feature cards`)
      for (const feature of subclass.features ?? []) {
        assert.ok(feature.mechanics.trim(), `${classId}/${subclass.id}/${feature.level}/${feature.name} has no mechanics`)
      }
    }
  }
})

test("missing-translation notes are carried into the visible Reference Guide", () => {
  const source = fs.readFileSync("src/components/reference/ReferenceGuide.tsx", "utf8")
  assert.match(source, /translationNote: feature\.translationNote/)
  assert.match(source, />Нужен перевод</)
})
