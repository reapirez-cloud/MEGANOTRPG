import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { isExplicitImageGenerationRequest } from "../supabase/functions/voss-agent/image-intent.ts"

const edge = readFileSync(
  new URL("../supabase/functions/voss-agent/index.ts", import.meta.url),
  "utf8",
)

test("image generation starts only from an explicit drawing command", () => {
  const positive = [
    "Рисуй.",
    "Нарисуй его у ворот.",
    "Теперь рисуй два варианта.",
    "Окей, перерисуй этот арт.",
    "Сгенерируй изображение для панели.",
    "Создай картинку с этим персонажем.",
    "draw a portrait",
    "generate image",
  ]

  for (const message of positive) {
    assert.equal(
      isExplicitImageGenerationRequest(message),
      true,
      "expected generation command: " + message,
    )
  }
})

test("art discussion, planning and negation never spend generation tokens", () => {
  const negative = [
    "Давай обсудим арт персонажа.",
    "Как бы ты это нарисовал?",
    "Что именно тут лучше нарисовать?",
    "Сделай концепт для арта.",
    "Сделай мне описание картинки.",
    "Нужно придумать композицию панорамы.",
    "Вот референс, что думаешь?",
    "Не рисуй пока, сначала обсудим.",
    "Пока не генерируй, хочу поменять позу.",
    "Если я скажу: нарисуй, тогда запускай генерацию.",
    "Команда «рисуй» должна запускать генерацию.",
    "Хочу сначала понять, что нарисовать.",
  ]

  for (const message of negative) {
    assert.equal(
      isExplicitImageGenerationRequest(message),
      false,
      "must remain discussion-only: " + message,
    )
  }
})

test("generate_image is not published to the model before explicit intent", () => {
  assert.match(
    edge,
    /name === "generate_image" && !imageGenerationRequested/,
  )
  assert.match(edge, /Обсуждение арта, композиции, стиля, промпта и референсов не является разрешением генерировать/)
  assert.match(
    edge,
    /imageGenerationRequested &&[\s\S]*!imageToolsUsed\.includes\("generate_image"\)[\s\S]*toolsForRound\.some\(\(tool\) => tool\.function\.name === "generate_image"\)[\s\S]*function: \{ name: "generate_image" \}/,
  )
  assert.match(
    edge,
    /toolName === "generate_image" && !imageGenerationRequested[\s\S]*explicit_image_generation_command_required/,
  )
})
