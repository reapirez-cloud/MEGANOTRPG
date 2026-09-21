import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const panelPath = new URL(
  "../src/ui-v1-isolated/chat-room/ChatActionPanel.tsx",
  import.meta.url,
)

test("new chat preserves the old slot-first spell casting route", async () => {
  const panel = await readFile(panelPath, "utf8")

  assert.match(panel, /type SpellChannel = "cantrips" \| string \| null/)
  assert.match(panel, /type SpellCastSelection = \{[\s\S]*accessKey: string[\s\S]*methodKey: string[\s\S]*optionKey\?: string/)
  assert.match(panel, /function exactSpellCast\(selection: SpellCastSelection\)/)
  assert.match(panel, /spellCastForSlot\(spell, slot\.level, slot\.resource\.stateKey\)/)
  assert.match(panel, /cost\.stateKey === stateKey && cost\.available/)
  assert.match(panel, />Выбери ячейку</)
  assert.match(panel, /Шаг 2 · \{casts\.length\} доступно/)
  assert.match(panel, /onSpell\(exactSpellCast\(selection\)\)/)
})

test("new chat preserves the old three-way attack route", async () => {
  const panel = await readFile(panelPath, "utf8")

  assert.match(
    panel,
    /type AttackChannel = "weapon" \| "spell" \| "special" \| null/,
  )
  assert.match(panel, /setAttackChannel\("weapon"\)/)
  assert.match(panel, /setAttackChannel\("spell"\)/)
  assert.match(panel, /setAttackChannel\("special"\)/)
  assert.match(panel, /spells=\{model\.attackSpells\}/)
  assert.match(panel, /group\.actions\.filter\(actionIsAttack\)/)
  assert.match(panel, /attackSpellKeys\.has\(spell\.key\)/)
})

test("new ability surface keeps class and non-item unique sources", async () => {
  const panel = await readFile(panelPath, "utf8")

  assert.match(panel, /const nonItemUniqueGroups = useMemo/)
  assert.match(
    panel,
    /const abilityGroups = useMemo\([\s\S]*\.\.\.model\.classGroups[\s\S]*\.\.\.nonItemUniqueGroups/,
  )
  assert.match(panel, /groups=\{abilityGroups\}/)
  assert.match(panel, /groups=\{itemGroups\}/)
})
