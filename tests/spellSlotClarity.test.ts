import assert from "node:assert/strict"
import test from "node:test"
import fs from "node:fs"

const meter = fs.readFileSync("src/components/characters/SpellSlotMeter.tsx", "utf8")
const styles = fs.readFileSync("src/spell-slot-clarity.css", "utf8")

test("spell slot UI explains higher-level fallback", () => {
  assert.match(meter, /Можно использовать ячейку выше уровнем/)
  assert.match(meter, /спишется ближайшая доступная старшая/)
  assert.match(meter, /Ячейки закончились/)
  assert.match(meter, /Можно потратить вместо/)
})

test("depleted spell slot rows are visually neutralized", () => {
  assert.match(meter, /spell-slots-v3__level--depleted/)
  assert.match(styles, /spell-slots-v3__level--depleted/)
  assert.match(styles, /filter: grayscale\(1\)/)
})
