import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const source = readFileSync(new URL("../src/components/reference/ReferenceGuide.tsx", import.meta.url), "utf8")

test("class and subclass reference keep summary, description and Voss as separate layers", () => {
  assert.match(source, /<section className="reference-class-description"><span>Описание класса<\/span><p>\{classNarration\}<\/p><\/section>/)
  assert.match(source, /<section className="reference-class-description"><span>Описание подкласса<\/span><p>\{subclassNarration\}<\/p><\/section>/)
  assert.doesNotMatch(source, /<span>\{classTemplate\?\.author_description/)
  assert.doesNotMatch(source, /<span>\{selectedSubclassTemplate\?\.author_description/)
  assert.doesNotMatch(source, /const subclassNarration =[^\n]*selectedSubclass\?\.voss/)
  assert.match(source, /reference-voss-note surface"><span>Заметка Восса<\/span>/)
})
