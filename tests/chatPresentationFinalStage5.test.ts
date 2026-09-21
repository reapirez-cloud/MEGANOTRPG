import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const cardPath = new URL("../src/ui-v1-isolated/chat-room/ChatGameEventCard.tsx", import.meta.url)
const dicePath = new URL("../src/ui-v1-isolated/chat-room/DiceGlyph.tsx", import.meta.url)
const presentationPath = new URL("../src/ui-v1-isolated/chat-room/chatGameEventPresentation.ts", import.meta.url)
const cssPath = new URL("../src/ui-v1-isolated/chat-room/chat-room.css", import.meta.url)

test("chat final stage 5 compacts large dice pools instead of growing giant dice rows", async () => {
  const [card, css] = await Promise.all([
    readFile(cardPath, "utf8"),
    readFile(cssPath, "utf8"),
  ])

  assert.match(card, /roll\.values\.length <= 9 \? "dense" :[\s\S]*"packed"/)
  assert.match(css, /data-dice-density="packed"[\s\S]*--u1-die-size: 28px/)
  assert.match(css, /grid-template-columns: repeat\(4, var\(--u1-die-size\)\)/)
  assert.match(css, /@media \(max-width: 320px\)[\s\S]*data-dice-density="packed"[\s\S]*--u1-die-size: 23px/)
})

test("chat final stage 5 scales long modifier and total values without changing their meaning", async () => {
  const [card, css] = await Promise.all([
    readFile(cardPath, "utf8"),
    readFile(cssPath, "utf8"),
  ])

  assert.match(card, /data-total-density=\{totalDensity\}/)
  assert.match(card, /data-modifier-density=\{modifierDensity\}/)
  assert.match(card, /totalLabel\.length <= 3 \? "normal"/)
  assert.match(card, /modifierLabel !== null && modifierLabel\.length > 4/)
  assert.match(css, /data-total-density="long"[\s\S]*font-size: 16px/)
  assert.match(css, /data-modifier-density="compact"[\s\S]*font-size: 12px/)
})

test("chat final stage 5 keeps roll semantics raw and neutral", async () => {
  const [card, presentation] = await Promise.all([
    readFile(cardPath, "utf8"),
    readFile(presentationPath, "utf8"),
  ])

  const rollStart = presentation.indexOf("function rollPresentation")
  const spellStart = presentation.indexOf("function spellPresentation")
  const rollSection = presentation.slice(rollStart, spellStart)

  assert.match(card, /<DiceGlyph[\s\S]*sides=\{roll\.sides\}[\s\S]*value=\{value\}/)
  assert.match(card, />Модификатор<\/span>/)
  assert.match(card, />Итого<\/span>/)
  assert.doesNotMatch(rollSection, /\b(success|failure|critical|green|red)\b/i)
  assert.doesNotMatch(card, /data-(success|failure|critical)/i)
})

test("chat final stage 5 keeps PNG canonical and fallback dice inside one reusable component", async () => {
  const dice = await readFile(dicePath, "utf8")

  for (const sides of [4, 6, 8, 10, 12, 20]) {
    assert.ok(
      dice.includes(`${sides}: "/ui-v1/dice/d${sides}-graphite.png"`),
    )
  }
  assert.match(dice, /sides === 100/)
  assert.match(dice, /data-die-kind=\{sides === 100 \? "percentile"/)
  assert.match(dice, /CANONICAL_DIE_ASSETS\[sides\] \? "canonical" : "fallback"/)
  assert.match(dice, /className="u1-die-glyph__fallback"/)
  assert.doesNotMatch(dice, /<svg/)
})

test("chat final stage 5 leaves roll cards outside the legacy generic stats path", async () => {
  const presentation = await readFile(presentationPath, "utf8")
  const rollStart = presentation.indexOf("function rollPresentation")
  const spellStart = presentation.indexOf("function spellPresentation")
  const rollSection = presentation.slice(rollStart, spellStart)

  assert.match(rollSection, /stats: roll[\s\S]*\? \[\]/)
  assert.match(rollSection, /roll: GameCardRoll \| null/)
})
