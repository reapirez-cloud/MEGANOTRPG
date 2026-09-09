import assert from "node:assert/strict"
import test from "node:test"

import { classReference, WARLOCK_RUNTIME_REFERENCE_SUBCLASS_IDS } from "../src/data/classReference.ts"
import fs from "node:fs"

const expected = ["bard", "monk", "paladin", "sorcerer", "warlock"]
const referenceOnlyClasses = new Set(["bard", "monk", "sorcerer"])
const warlockRuntimePatrons = new Set(WARLOCK_RUNTIME_REFERENCE_SUBCLASS_IDS)

test("translated new classes expose complete reference mechanics with truthful runtime activation", () => {
  for (const classId of expected) {
    const entry = classReference.find((candidate) => candidate.id === classId)
    assert.ok(entry, `${classId} is absent from class reference`)
    assert.equal(entry.referenceOnly, referenceOnlyClasses.has(classId), `${classId} runtime/reference status is stale`)
    assert.ok(entry.features?.length, `${classId} has no base feature cards`)

    for (const feature of entry.features ?? []) {
      assert.ok(feature.mechanics.trim(), `${classId}/${feature.level}/${feature.name} has no mechanics`)
      const translatedWarlockInvocation = classId === "warlock" && feature.name.startsWith("Воззвание:")
      if (!feature.explanation.trim() && !translatedWarlockInvocation) {
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

test("Warlock reference mirrors the certified nine-patron runtime boundary", () => {
  const warlock = classReference.find((candidate) => candidate.id === "warlock")
  assert.ok(warlock, "warlock is absent from class reference")
  assert.equal(warlock.referenceOnly, false, "base Warlock must use the certified runtime template")
  assert.equal(warlockRuntimePatrons.size, 9, "Warlock runtime roster must contain nine certified patrons")

  const seenRuntimePatrons = new Set<string>()
  for (const subclass of warlock.subclasses) {
    const runtimeReady = warlockRuntimePatrons.has(subclass.id)
    assert.equal(subclass.referenceOnly, !runtimeReady, `warlock/${subclass.id} runtime/reference status is stale`)
    if (runtimeReady) seenRuntimePatrons.add(subclass.id)
  }

  assert.deepEqual(seenRuntimePatrons, warlockRuntimePatrons)
})

test("missing-translation notes are carried into the visible Reference Guide", () => {
  const source = fs.readFileSync("src/components/reference/ReferenceGuide.tsx", "utf8")
  assert.match(source, /translationNote: feature\.translationNote/)
  assert.match(source, />Нужен перевод</)
})
