const DRAW_COMMAND =
  /(?:^|[.!?]\s*|,\s*|(?:теперь|тогда|давай|ладно|окей|ок|всё|все|можешь|прошу)\s+)(?:рисуй|нарисуй|отрисуй|перерисуй|дорисуй|сгенерируй|генерируй)(?![\p{L}\p{N}_])/u

const CREATE_IMAGE_COMMAND =
  /(?:^|[.!?]\s*|,\s*|(?:теперь|тогда|давай|ладно|окей|ок|всё|все|можешь|прошу)\s+)(?:создай|create|generate|draw)\s+(?:мне\s+)?(?:арт|изображение|картинку|рисунок|иконку|аватар|портрет|панораму|рендер|image|picture|icon|avatar|portrait|render)(?![\p{L}\p{N}_])/u

const NEGATED_DRAW_COMMAND =
  /(?:^|[.!?]\s*|,\s*)(?:не|пока\s+не|ещ[её]\s+не|не\s+надо|не\s+нужно|не\s+стоит)\s+(?:мне\s+)?(?:рисуй|нарисуй|отрисуй|перерисуй|дорисуй|сгенерируй|генерируй|создай|generate|draw|create)(?![\p{L}\p{N}_])/gu

/**
 * Generation is intentionally opt-in.
 *
 * Discussing an image, writing a prompt, choosing composition/style or saying
 * what could be drawn must not spend image-generation tokens. The current user
 * turn needs an unmistakable drawing/generation command.
 */
export function isExplicitImageGenerationRequest(message: string) {
  const normalized = message
    .toLocaleLowerCase("ru-RU")
    .replace(/\s+/g, " ")
    .trim()

  if (!normalized) return false

  const withoutNegatedCommands = normalized.replace(NEGATED_DRAW_COMMAND, " ")
  return (
    DRAW_COMMAND.test(withoutNegatedCommands) ||
    CREATE_IMAGE_COMMAND.test(withoutNegatedCommands)
  )
}
