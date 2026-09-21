import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const presentationPath = new URL("../src/ui-v1-isolated/chat-room/chatGameEventPresentation.ts", import.meta.url)
const cardPath = new URL("../src/ui-v1-isolated/chat-room/ChatGameEventCard.tsx", import.meta.url)

test("chat roll stage 3 has one structured dice model", async () => {
  const presentation = await readFile(presentationPath, "utf8")

  assert.match(presentation, /export type GameCardRoll = \{[\s\S]*sides: number[\s\S]*values: number\[\][\s\S]*count: number[\s\S]*modifier: number \| null[\s\S]*total: number \| null[\s\S]*formula: string/)
  assert.match(presentation, /roll: GameCardRoll \| null/)
  assert.match(presentation, /sides: 20,[\s\S]*values: \[d20\],[\s\S]*count: 1/)
  assert.match(presentation, /sides,[\s\S]*values: rolls,[\s\S]*count,[\s\S]*modifier: effectModifier,[\s\S]*total: effectTotal,[\s\S]*formula/)
})

test("chat roll stage 3 preserves arbitrary die sides instead of whitelisting dice", async () => {
  const presentation = await readFile(presentationPath, "utf8")
  const rollStart = presentation.indexOf("function rollPresentation")
  const spellStart = presentation.indexOf("function spellPresentation")
  const rollSection = presentation.slice(rollStart, spellStart)

  assert.match(rollSection, /rawSides !== null && rawSides >= 2/)
  assert.match(rollSection, /Math\.floor\(rawSides\)/)
  assert.doesNotMatch(rollSection, /\[4,\s*6,\s*8,\s*10,\s*12,\s*20/)
})

test("chat roll stage 3 removes valid rolls from generic stats", async () => {
  const presentation = await readFile(presentationPath, "utf8")
  const rollStart = presentation.indexOf("function rollPresentation")
  const spellStart = presentation.indexOf("function spellPresentation")
  const rollSection = presentation.slice(rollStart, spellStart)

  assert.match(rollSection, /chips: \[\],[\s\S]*roll,[\s\S]*stats: roll[\s\S]*\? \[\]/)
  assert.doesNotMatch(rollSection, /Успех|Провал|success|failure|critical/i)
})

test("chat roll stage 3 renders the structured model without parsing strings", async () => {
  const card = await readFile(cardPath, "utf8")

  assert.match(card, /function StructuredRollSummary/)
  assert.match(card, /roll\.values\.join\(" · "\)/)
  assert.match(card, /signedRollValue\(roll\.modifier\)/)
  assert.match(card, /String\(roll\.total\)/)
  assert.match(card, /data-roll-model-stage="3"/)
  assert.match(card, /data-die-sides=\{roll\.sides\}/)
  assert.match(card, /data-dice-count=\{roll\.count\}/)
  assert.match(card, /<StructuredRollSummary roll=\{presentation\.roll\} \/>/)
})
