import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const backPath = new URL("../src/ui-v1-isolated/telegramBackButton.ts", import.meta.url)
const telegramPath = new URL("../src/ui-v1-isolated/telegramMiniApp.ts", import.meta.url)
const mainPath = new URL("../src/ui-v1-isolated/main.tsx", import.meta.url)
const appPath = new URL("../src/ui-v1-isolated/UiV1App.tsx", import.meta.url)
const characterPath = new URL("../src/ui-v1-isolated/CharacterView.tsx", import.meta.url)
const stylesPath = new URL("../src/ui-v1-isolated/styles.css", import.meta.url)
const agentPath = new URL("../src/ai/AgentShell.tsx", import.meta.url)
const aiCssPath = new URL("../src/ai/ai-voss.css", import.meta.url)

test("Telegram BackButton remains owned by MEGANOT and nested handlers use priority", async () => {
  const [back, app, character] = await Promise.all([
    readFile(backPath, "utf8"),
    readFile(appPath, "utf8"),
    readFile(characterPath, "utf8"),
  ])

  assert.match(back, /backButton\.show\?\.\(\)/)
  assert.doesNotMatch(back, /backButton\.hide\?\.\(\)/)
  assert.match(back, /right\.priority - left\.priority/)
  assert.match(app, /bindTelegramBackButton\(navigateBack, \{ priority: 0 \}\)/)
  assert.match(character, /bindTelegramBackButton\(handleBack, \{ priority: 100 \}\)/)
})

test("Telegram shell disables collapse swipes and synchronizes the content safe area", async () => {
  const [telegram, main, styles, agent, aiCss] = await Promise.all([
    readFile(telegramPath, "utf8"),
    readFile(mainPath, "utf8"),
    readFile(stylesPath, "utf8"),
    readFile(agentPath, "utf8"),
    readFile(aiCssPath, "utf8"),
  ])

  assert.match(main, /initializeTelegramMiniApp\(\)/)
  assert.match(telegram, /disableVerticalSwipes\?\.\(\)/)
  assert.match(telegram, /contentSafeAreaChanged/)
  assert.match(telegram, /--u1-telegram-content-safe-top/)
  assert.match(styles, /--u1-content-safe-top:/)
  assert.match(styles, /padding-top: var\(--u1-content-safe-top\)/)
  assert.match(styles, /--u1-safe-top: 0px/)
  assert.match(agent, /function orbMinY\(\)/)
  assert.match(agent, /TELEGRAM_SAFE_AREA_EVENT/)
  assert.match(aiCss, /top: var\(--u1-content-safe-top, 0px\)/)
})
