import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { readFileSync } from "node:fs"
import test from "node:test"

const botToken = "telegram-test-token"
const source = readFileSync("api/telegram-auth.mjs", "utf8").replace(
  'import { createClient } from "@supabase/supabase-js"',
  "const createClient = globalThis.__telegramAuthTestClient",
)

function signedInitData(id: number) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id, first_name: "Player" }),
  })
  const checkString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest()
  params.set("hash", createHmac("sha256", secret).update(checkString).digest("hex"))
  return params.toString()
}

async function request(handler: (req: unknown, res: unknown) => Promise<void>, initData: string) {
  let status = 0
  let body: Record<string, unknown> = {}
  const res = {
    setHeader() {},
    status(code: number) { status = code; return this },
    json(value: Record<string, unknown>) { body = value },
  }
  await handler({ method: "POST", headers: {}, body: { initData } }, res)
  return { status, body }
}

test("Telegram authentication admits players without owner status while rejecting identity mismatch", async () => {
  const previous = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  }
  process.env.TELEGRAM_BOT_TOKEN = botToken
  process.env.SUPABASE_URL = "https://example.supabase.co"
  process.env.SUPABASE_SECRET_KEY = "test-secret"

  let identity: { user_id: string } | null = null
  let generatedUserId = "player-1"
  let upserts = 0
  let lookups = 0
  ;(globalThis as typeof globalThis & { __telegramAuthTestClient?: () => unknown })
    .__telegramAuthTestClient = () => ({
      from(table: string) {
        assert.equal(table, "telegram_identities")
        return {
          select() { return { eq() { return { async maybeSingle() { lookups++; return { data: identity, error: null } } } } } },
          async upsert() { upserts++; return { error: null } },
        }
      },
      auth: { admin: {
        async generateLink() { return { data: { user: { id: generatedUserId }, properties: { hashed_token: "one-time-token" } }, error: null } },
        async updateUserById() { return { error: null } },
      } },
    })

  try {
    const { default: handler } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)
    const newPlayer = await request(handler, signedInitData(11001))
    assert.equal(newPlayer.status, 200)
    assert.equal(newPlayer.body.token_hash, "one-time-token")
    assert.equal(upserts, 1)

    identity = { user_id: "player-1" }
    const existingPlayer = await request(handler, signedInitData(11002))
    assert.equal(existingPlayer.status, 200)
    assert.equal(upserts, 2)

    generatedUserId = "different-account"
    const mismatch = await request(handler, signedInitData(11003))
    assert.equal(mismatch.status, 403)
    assert.equal(upserts, 2)
    assert.equal(lookups, 3)

    const invalid = await request(handler, signedInitData(11004).replace(/.$/, "X"))
    assert.equal(invalid.status, 401)
    assert.equal(lookups, 3)
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    delete (globalThis as typeof globalThis & { __telegramAuthTestClient?: () => unknown }).__telegramAuthTestClient
  }
})
