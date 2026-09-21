import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const dicePath = new URL("../src/ui-v1-isolated/chat-room/DiceGlyph.tsx", import.meta.url)
const cardPath = new URL("../src/ui-v1-isolated/chat-room/ChatGameEventCard.tsx", import.meta.url)
const cssPath = new URL("../src/ui-v1-isolated/chat-room/chat-room.css", import.meta.url)

test("chat roll stage 4 draws canonical dice with distinct SVG geometry", async () => {
  const dice = await readFile(dicePath, "utf8")

  for (const sides of [4, 6, 8, 10, 12, 20]) {
    assert.match(dice, new RegExp(`sides === ${sides}`))
  }

  assert.match(dice, /sides === 100/)
  assert.match(dice, /PercentileDie/)
  assert.match(dice, /data-die-kind=\{sides === 100 \? "percentile"/)
  assert.match(dice, /className="u1-die-glyph__kind"/)
})

test("chat roll stage 4 puts the raw value inside the die SVG", async () => {
  const dice = await readFile(dicePath, "utf8")

  assert.match(dice, /const text = String\(value\)/)
  assert.match(dice, /<text x="50" y="68" fontSize=\{fontSize\}>\{text\}<\/text>/)
  assert.match(dice, /<text x="50" y="63" fontSize=\{fontSize\}>\{text\}<\/text>/)
  assert.match(dice, /aria-label=\{label\}/)
})

test("chat roll stage 4 uses percentile dice for d100 and honest fallback for arbitrary dN", async () => {
  const dice = await readFile(dicePath, "utf8")

  assert.match(dice, /const tens = normalized === 100/)
  assert.match(dice, /const ones = normalized === 100/)
  assert.match(dice, /<StandardDie sides=\{10\} value=\{Number\(tens\)\} \/>/)
  assert.match(dice, /<StandardDie sides=\{10\} value=\{Number\(ones\)\} \/>/)
  assert.match(dice, />d\{sides\}<\/text>/)
})

test("chat roll stage 4 replaces generic stat cells with one symmetric result composition", async () => {
  const [card, css] = await Promise.all([
    readFile(cardPath, "utf8"),
    readFile(cssPath, "utf8"),
  ])

  assert.match(card, /import DiceGlyph from "\.\/DiceGlyph"/)
  assert.match(card, /data-roll-visual-stage="4"/)
  assert.match(card, /className="u1-room-roll-stage4__summary"/)
  assert.match(card, /className="u1-room-roll-stage4__dice"/)
  assert.match(card, /<DiceGlyph[\s\S]*sides=\{roll\.sides\}[\s\S]*value=\{value\}/)
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\) auto/)
  assert.match(css, /data-dice-density="single"/)
  assert.match(css, /data-dice-density="group"/)
  assert.match(css, /data-dice-density="dense"/)
})

test("chat roll stage 4 keeps raw dice, modifier and total semantically separate", async () => {
  const card = await readFile(cardPath, "utf8")

  assert.match(card, /rawValuesLabel = roll\.values\.join\(" · "\)/)
  assert.match(card, /signedRollValue\(roll\.modifier\)/)
  assert.match(card, /String\(roll\.total\)/)
  assert.match(card, />Модификатор<\/span>/)
  assert.match(card, />Итого<\/span>/)
  assert.doesNotMatch(card, /Успех|Провал|success|failure|critical/i)
})
