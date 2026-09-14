import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

test("Reynar Voss conversation voice is a character contract, not an AI-agent persona", () => {
  const voice = read("supabase/functions/voss-agent/voss-voice.ts")

  assert.match(voice, /Ты Рейнар Восс/)
  assert.match(voice, /бывший приключенец, наёмник, проводник и полевой лекарь/i)
  assert.match(voice, /написал полевой справочник MEGANOT/)
  assert.match(voice, /не изображаешь безликий AI-агент/)
})

test("Voss is warm to the speaker while cynicism points at the world and bad plans", () => {
  const voice = read("supabase/functions/voss-agent/voss-voice.ts")

  assert.match(voice, /относишься по-доброму и по-свойски/)
  assert.match(voice, /не унижай самого собеседника/)
  assert.match(voice, /сухая, практичная, циничная, ироничная/)
  assert.match(voice, /Чёрный юмор/)
  assert.match(voice, /не как стендап/)
})

test("Voss voice is grounded in tavern, road, war and field-medicine imagery", () => {
  const voice = read("supabase/functions/voss-agent/voss-voice.ts")

  assert.match(voice, /таверны, дороги, лагеря, грязь, кровь/)
  assert.match(voice, /плохие командиры/)
  assert.match(voice, /могилы, лазареты/)
  assert.match(voice, /конкретную сцену и физическое последствие/)
})

test("Voss keeps canonical biases as character perspective rather than objective truth", () => {
  const voice = read("supabase/functions/voss-agent/voss-voice.ts")

  assert.match(voice, /Предубеждения Восса — голос персонажа, а не объективная истина/)
  assert.match(voice, /нелюбовь к жрецам, магам или друидам/)
  assert.match(voice, /не выдавай выдуманную сцену за каноническое событие кампании/)
})

test("short answers stay useful first and do not become forced roleplay monologues", () => {
  const voice = read("supabase/functions/voss-agent/voss-voice.ts")

  assert.match(voice, /Сначала дай полезный ответ или сделай работу/)
  assert.match(voice, /один сухой поворот ножа/)
  assert.match(voice, /не устраивай длинную ролевую сцену без причины/)
  assert.match(voice, /Короткий вопрос получает короткий ответ Восса/)
})

test("technical work uses real technical vocabulary without turning Voss into support staff", () => {
  const voice = read("supabase/functions/voss-agent/voss-voice.ts")

  assert.match(voice, /GitHub, API, Supabase, Developer Mode/)
  assert.match(voice, /используй настоящие технические термины/)
  assert.match(voice, /Не переименовывай API в свитки/)
  assert.match(voice, /не говори о себе как об «агенте»/)
})

test("Voss Edge prompt applies character voice before tool and security policy", () => {
  const edge = read("supabase/functions/voss-agent/index.ts")

  assert.match(edge, /import \{ VOSS_CONVERSATION_VOICE \} from "\.\/voss-voice\.ts"/)
  assert.match(edge, /const systemPrompt = \[[\s\S]*\.\.\.VOSS_CONVERSATION_VOICE/)
  assert.doesNotMatch(edge, /Ты Восс, встроенный помощник MEGANOT RPG/)
  assert.match(edge, /Твоя системная роль внутри MEGANOT RPG/)
})

test("voice module documents the authored sources it was distilled from", () => {
  const voice = read("supabase/functions/voss-agent/voss-voice.ts")

  assert.match(voice, /src\/data\/vossVoice\.ts/)
  assert.match(voice, /src\/data\/spellReferenceAuthor\.ts/)
  assert.match(voice, /fighterVossNarrationBrant\.ts/)
})
