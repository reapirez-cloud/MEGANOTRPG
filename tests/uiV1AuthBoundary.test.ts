import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const gate = fs.readFileSync("src/components/auth/AuthGate.tsx", "utf8")
const entry = fs.readFileSync("src/ui-v1-isolated/main.tsx", "utf8")

test("UI 1.0 cannot mount outside the Telegram auth boundary", () => {
  assert.match(entry, /import AuthGate from "\.\.\/components\/auth\/AuthGate"/)
  assert.match(entry, /<AuthGate>[\s\S]*<AIProvider>[\s\S]*<UiV1App \/>/)
  assert.match(entry, /\.\.\/auth\.css/)
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

test("Playwright auth bypass is restricted to local Vite development", () => {
  assert.match(gate, /import\.meta\.env\.DEV/)
  assert.match(gate, /isLocalDevelopment\(\)/)
  assert.match(gate, /VITE_E2E_AUTH_BYPASS === "true"/)
})
