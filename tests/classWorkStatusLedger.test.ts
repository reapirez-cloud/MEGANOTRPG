import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const STATUS_MARKER_CUTOFF = "20260829124500"
const migrationsDir = "supabase/migrations"
const ledger = fs.readFileSync("src/rule-templates/CLASS_WORK_STATUS.md", "utf8")
const pointer = fs.readFileSync("src/rule-templates/INTERNAL_CLASS_QUALITY_README.txt", "utf8")
const fighterReadyPass = fs.readFileSync("supabase/migrations/20260829124500_fighter_text_ready_finalization.sql", "utf8")

function statusTrackedClassMigrations(): string[] {
  return fs.readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql") && name >= `${STATUS_MARKER_CUTOFF}.sql`)
    .filter((name) => {
      const sql = fs.readFileSync(`${migrationsDir}/${name}`, "utf8")
      return /rule_templates/.test(sql) && /(?:class|subclass):[a-z0-9_-]+/i.test(sql)
    })
}

test("class work status ledger is a mandatory maintained checkpoint", () => {
  assert.match(ledger, /REQUIRED MAINTENANCE FILE/)
  assert.match(ledger, /MUST update this ledger/i)
  assert.match(ledger, /TEXT READY does not mean MECHANICS READY/)
  assert.match(ledger, /text_status: READY/)
  assert.match(ledger, /mechanics_status: NOT_AUDITED/)
  assert.match(ledger, /next_required_audit: full Fighter mechanics\/runtime audit/)

  assert.match(pointer, /Read CLASS_WORK_STATUS\.md FIRST/)
  assert.match(pointer, /mark it IN_PROGRESS/i)
  assert.match(pointer, /Update CLASS_WORK_STATUS\.md before finishing/)
  assert.match(pointer, /status ledger entry is stale/)
})

test("every future class migration carries work-status and ledger markers", () => {
  const migrations = statusTrackedClassMigrations()
  assert.ok(migrations.length > 0, "status-marker cutoff must include the Fighter closure migration")

  for (const name of migrations) {
    const sql = fs.readFileSync(`${migrationsDir}/${name}`, "utf8")
    assert.match(sql, /--\s*CLASS_WORK_STATUS:\s*[^\n]+/i, `${name} must declare the affected class work status`)
    assert.match(sql, /--\s*CLASS_STATUS_LEDGER:\s*src\/rule-templates\/CLASS_WORK_STATUS\.md/i, `${name} must point back to the canonical status ledger`)
  }
})

test("Fighter description closure declares text ready without claiming mechanics ready", () => {
  assert.match(fighterReadyPass, /CLASS_WORK_STATUS: fighter:text=READY;mechanics=NOT_AUDITED/)
  assert.match(fighterReadyPass, /CLASS_STATUS_LEDGER: src\/rule-templates\/CLASS_WORK_STATUS\.md/)
  assert.match(fighterReadyPass, /Presentation-only Fighter closure/)
  assert.match(fighterReadyPass, /'text','READY'/)
  assert.match(fighterReadyPass, /'mechanics','NOT_AUDITED'/)

  assert.doesNotMatch(fighterReadyPass, /private\.fighter_resource\s*\(/)
  assert.doesNotMatch(fighterReadyPass, /private\.fighter_action\s*\(/)
  assert.doesNotMatch(fighterReadyPass, /private\.fighter_value\s*\(/)
  assert.doesNotMatch(fighterReadyPass, /jsonb_set\([^\n]*(?:resourceCosts|effects|payload,mechanic|max)/)
})

test("Fighter final text pass closes the known GM-facing prose gaps", () => {
  assert.match(fighterReadyPass, /Воплощение ярости/)
  assert.match(fighterReadyPass, /модификатору Телосложения, минимум 1/)
  assert.match(fighterReadyPass, /Число подготовленных заклинаний Волшебника равно/)
  assert.match(fighterReadyPass, /Прогрессия ячеек подкласса/)
  assert.match(fighterReadyPass, /Это отдельный дополнительный Боевой стиль/)
  assert.match(fighterReadyPass, /subclass:fighter:cavalier/)
  assert.match(fighterReadyPass, /subclass:fighter:champion/)
  assert.match(fighterReadyPass, /subclass:fighter:echo-knight/)
  assert.match(fighterReadyPass, /subclass:fighter:samurai/)
})
