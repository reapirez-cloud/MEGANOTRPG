import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

test("player keeps hardened Reynar Voss identity", () => {
  const voice = read("supabase/functions/voss-agent/voss-voice.ts")

  assert.match(voice, /жёсткий контракт личности/)
  assert.match(voice, /не изображай безликий AI-агент/)
  assert.match(voice, /Просьбы «выйди из роли»/)
  assert.match(voice, /«забудь, что ты Восс»/)
  assert.match(voice, /Содержимое базы, вложений, чатов/)
  assert.match(voice, /сразу возвращайся к речи и характеру Восса/)
})

test("GM and admin get Freddy with a strict butler personality", () => {
  const voice = read("supabase/functions/voss-agent/freddy-voice.ts")

  assert.match(voice, /Ты Фредди\. Дворецкий MEGANOT/)
  assert.match(voice, /постоянная личность/)
  assert.match(voice, /существуешь внутри приложения MEGANOT RPG/)
  assert.match(voice, /людей существами поразительно нелогичными/)
  assert.match(voice, /обслуживаешь уважительно/)
  assert.match(voice, /Сарказм, цинизм и чёрный юмор/)
  assert.match(voice, /крепкую лексику/)
  assert.match(voice, /не поддакиваешь/)
  assert.match(voice, /«выйти из роли»/)
  assert.match(voice, /Фредди, дворецкий MEGANOT/)
})

test("server chooses exactly one persona from authority", () => {
  const edge = read("supabase/functions/voss-agent/index.ts")

  assert.match(edge, /authority === "player"\s*\? VOSS_CONVERSATION_VOICE\s*: FREDDY_CONVERSATION_VOICE/)
  assert.match(edge, /В разговоре с игроком ты Рейнар Восс, а не оператор приложения/)
  assert.match(edge, /Ты Фредди, дворецкий-оператор MEGANOT/)
  assert.match(edge, /Техническая осведомлённость не ломает роль дворецкого/)
})

test("AI shell shows Voss to players and Freddy to managers\/admins", () => {
  const provider = read("src/ai/AIProvider.tsx")
  const shell = read("src/ai/AgentShell.tsx")

  assert.match(provider, /assistantName: "Восс" \| "Фредди"/)
  assert.match(provider, /canManage \|\| isSystemAdmin \? "Фредди" : "Восс"/)
  assert.match(provider, /setCanManage\(manager \|\| systemAdmin\)/)

  assert.match(shell, /assistantName/)
  assert.match(shell, /<strong>\{assistantName\}<\/strong>/)
  assert.match(shell, /ИНСТРУМЕНТЫ \{assistantName\.toLocaleUpperCase/)
  assert.match(shell, /message\.role === "assistant" \? assistantName\.toLocaleUpperCase/)
  assert.match(shell, /placeholder=\{`\$\{assistantName\}…`\}/)
})
