import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const dicePath = new URL("../src/ui-v1-isolated/chat-room/DiceGlyph.tsx", import.meta.url)
const cardPath = new URL("../src/ui-v1-isolated/chat-room/ChatGameEventCard.tsx", import.meta.url)
const cssPath = new URL("../src/ui-v1-isolated/chat-room/chat-room.css", import.meta.url)

test("chat roll stage 4 uses lightweight PNG assets for canonical dice", async () => {
  const dice = await readFile(dicePath, "utf8")

  for (const sides of [4, 6, 8, 10, 12, 20]) {
    assert.ok(
      dice.includes(`${sides}: "d${sides}-graphite.png"`),
    )

    const asset = await readFile(
      new URL(`../public/ui-v1/dice/d${sides}-graphite.png`, import.meta.url),
    )
    assert.equal(asset.readUInt32BE(16), 192)
    assert.equal(asset.readUInt32BE(20), 192)
    assert.ok(asset.byteLength < 12_000)
  }

  assert.match(dice, /CANONICAL_DIE_FILES/)
  assert.match(dice, /DICE_ASSET_BASE/)
  assert.match(dice, /className="u1-die-glyph__image"/)
  assert.doesNotMatch(dice, /<svg/)
})

test("chat roll stage 4 overlays the raw value on the PNG face", async () => {
  const [dice, css] = await Promise.all([
    readFile(dicePath, "utf8"),
    readFile(cssPath, "utf8"),
  ])

  assert.match(dice, /const text = displayValue \?\? String\(value\)/)
  assert.match(dice, /className="u1-die-glyph__value"/)
  assert.match(dice, /data-value-length=\{valueLength\(text\)\}/)
  assert.match(dice, /aria-label=\{label\}/)

  for (const sides of [4, 6, 8, 10, 12, 20]) {
    assert.ok(
      css.includes(`.u1-die-glyph__asset[data-die-sides="${sides}"]`),
    )
  }
})

test("chat roll stage 4 uses PNG d10 pair for d100 and non-SVG fallback for arbitrary dN", async () => {
  const dice = await readFile(dicePath, "utf8")

  assert.match(dice, /const tens = normalized === 100/)
  assert.match(dice, /const ones = normalized === 100/)
  assert.match(dice, /<CanonicalDie[\s\S]*sides=\{10\}[\s\S]*displayValue=\{tens\}/)
  assert.match(dice, /<CanonicalDie[\s\S]*sides=\{10\}[\s\S]*displayValue=\{ones\}/)
  assert.match(dice, /className="u1-die-glyph__fallback"/)
  assert.match(dice, />d\{sides\}<\/span>/)
  assert.match(dice, /sides === 100/)
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
