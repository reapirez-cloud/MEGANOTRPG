import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const gate = fs.readFileSync("src/components/auth/AuthGate.tsx", "utf8")
const telegramAuth = fs.readFileSync("api/telegram-auth.mjs", "utf8")
const context = fs.readFileSync("src/context/AuthContext.tsx", "utf8")
const entry = fs.readFileSync("src/ui-v1-isolated/main.tsx", "utf8")
const html = fs.readFileSync("index.html", "utf8")
const aliasHtml = fs.readFileSync("ui-v1.html", "utf8")

test("Telegram Mini App SDK loads before the UI entry", () => {
  for (const document of [html, aliasHtml]) {
    assert.match(document, /telegram\.org\/js\/telegram-web-app\.js/)
    assert.ok(
      document.indexOf("telegram-web-app.js") <
        document.indexOf("src/ui-v1-isolated/main.tsx"),
    )
  }
})

test("UI 1.0 cannot mount outside the complete app access boundary", () => {
  assert.match(entry, /import AuthGate from "\.\.\/components\/auth\/AuthGate"/)
  assert.match(entry, /<AuthGate>[\s\S]*<AIProvider>[\s\S]*<UiV1App \/>/)
  assert.match(entry, /\.\.\/auth\.css/)

  assert.match(gate, /\.from\("campaign_members"\)/)
  assert.match(gate, /\.eq\("user_id", currentUser\.id\)/)
  assert.match(gate, /ownerRows = rows\.filter\(\(row\) => row\.is_owner === true\)/)
  assert.match(gate, /phase === "not-found"/)
  assert.match(gate, /phase !== "ready"/)
  assert.match(gate, /<AuthProvider[\s\S]*campaign=\{campaign\}/)

  assert.match(context, /export type AppCampaignAccess/)
  assert.match(context, /role: "gm" \| "player"/)
  assert.match(context, /canManage: boolean/)
})

test("remembered campaign id is only a hint after live membership lookup", () => {
  const queryIndex = gate.indexOf('.from("campaign_members")')
  const rememberedIndex = gate.indexOf("const remembered = rememberedCampaignId()")
  const selectedIndex = gate.indexOf("standardOwnerRows.find")

  assert.ok(queryIndex >= 0)
  assert.ok(rememberedIndex > queryIndex)
  assert.ok(selectedIndex > rememberedIndex)
  assert.match(
    gate,
    /standardOwnerRows\.find\(\(row\) => row\.campaign_id === remembered\)/,
  )
})

test("production access is owner-only and unauthorized users see 404", () => {
  assert.match(
    gate,
    /if \(!selected\) \{[\s\S]*signOut\(\{ scope: "local" \}\)[\s\S]*setPhase\("not-found"\)[\s\S]*return/,
  )
  assert.match(gate, /response\.status === 404/)
  assert.match(gate, /<h1 className="auth-title">404<\/h1>/)
  assert.match(gate, /Страница не найдена\./)

  assert.match(telegramAuth, /\.from\("telegram_identities"\)/)
  assert.match(telegramAuth, /\.from\("campaign_members"\)/)
  assert.match(telegramAuth, /\.eq\("is_owner", true\)/)
  assert.match(telegramAuth, /return json\(res, 404, \{ error: "Not found" \}\)/)
  assert.match(
    telegramAuth,
    /linkData\.user\.id !== existingIdentity\.user_id/,
  )
})

test("production never reuses a stale Supabase browser session without Telegram initData", () => {
  assert.doesNotMatch(gate, /VITE_ALLOW_LEGACY_BROWSER_SESSION/)
  assert.match(gate, /session\?\.user && !localDevelopment/)
  assert.match(gate, /signOut\(\{ scope: "local" \}\)/)
  assert.match(gate, /currentTelegramId/)
  assert.match(gate, /sessionTelegramId/)
  assert.match(gate, /sessionTelegramId !== currentTelegramId/)
  assert.match(gate, /Telegram-аккаунт и сессия приложения не совпали/)
})

test("development bypasses cannot weaken production", () => {
  assert.match(gate, /import\.meta\.env\.DEV/)
  assert.match(gate, /isLocalDevelopment\(\)/)
  assert.match(gate, /VITE_E2E_AUTH_BYPASS === "true"/)
  assert.match(
    gate,
    /isLocalDevelopment\(\) && currentUser\.is_anonymous === true/,
  )
})
