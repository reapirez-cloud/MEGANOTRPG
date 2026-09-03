type Replacement = readonly [RegExp, string]

/**
 * Player-facing Voss narration must sound like a brutal fantasy war memoir,
 * not a 19th/20th-century military report or a modern psychology textbook.
 *
 * IMPORTANT: apply this only to authored/literary narration and Voss comments.
 * Exact mechanical rules, class levels, action economy and rules terminology
 * must stay untouched.
 */
const worldToneReplacements: Replacement[] = [
  [/\bсозависимост(?:ь|и|ью)\b/giu, "цепь"],
  [/\bпистолет(?:а|у|ом|е|ы|ов|ам|ами|ах)?\b/giu, "ручная фитильная пищаль"],
  [/\bревольвер(?:а|у|ом|е|ы|ов|ам|ами|ах)?\b/giu, "редкая многозарядная пищаль"],
  [/\bвинтовк(?:а|и|е|у|ой|ою|ам|ами|ах)\b/giu, "длинная фитильная пищаль"],
  [/\bкарабин(?:а|у|ом|е|ы|ов|ам|ами|ах)?\b/giu, "короткая фитильная пищаль"],
  [/\bмушкет(?:а|у|ом|е|ы|ов|ам|ами|ах)?\b/giu, "тяжёлая фитильная пищаль"],
  [/\bружь(?:ё|е|я|ю|ём|ем|ев|ям|ями|ях)\b/giu, "фитильная пищаль"],
  [/\bобойм(?:а|ы|е|у|ой|ою|ам|ами|ах)\b/giu, "запас"],
  [/\bпатрон(?:а|у|ом|е|ы|ов|ам|ами|ах)?\b/giu, "порох и свинцовые шары"],
  [/\bпул(?:я|и|е|ю|ей|ями|ях)\b/giu, "свинцовый шар"],
  [/\bснайпер(?:а|у|ом|е|ы|ов|ам|ами|ах)?\b/giu, "меткий стрелок"],
  [/\bшрапнел(?:ь|и|ью)\b/giu, "железная сечка"],
  [/\bблиндаж(?:а|у|ом|е|и|ей|ей|ах)?\b/giu, "землянка"],
  [/\bпулем[её]т(?:а|у|ом|е|ы|ов|ам|ами|ах)?\b/giu, "ряд дымных пищалей"],
  [/\bметаболизм(?:а|у|ом|е)?\b/giu, "живучесть тела"],
  [/\bадреналин(?:а|у|ом|е)?\b/giu, "ярость и страх"],
  [/\bкислород(?:а|у|ом|е)?\b/giu, "воздух"],
  [/\bкогнитивн(?:ый|ая|ое|ые|ого|ому|ым|ых|ой|ую)\b/giu, "умственный"],
  [/\bпсихотерап(?:ия|ии|ию|ией|евт|евта|евту|евтом|евты|евтов)\b/giu, "лекарское копание в голове"],
  [/\bдиплом(?:а|у|ом|е|ы|ов|ам|ами|ах)?\b/giu, "печать академии"],
  [/\bпроцедур(?:а|ы|е|у|ой|ою|ам|ами|ах)\b/giu, "дело"],

  // Real-world place names that leaked into fantasy war stories.
  [/\bАустерлиц(?:ем|а|у|е)?\b/giu, "Старый Брод"],
  [/\bГродн(?:о|а|у|ом|е)\b/giu, "Серые Леса"],
  [/\bТорун(?:ь|и|ью|я)?\b/giu, "Каменная Стража"],
  [/\bШтральзунд(?:а|у|ом|е)?\b/giu, "Серая Гавань"],
]

export function normalizeVossWorldTone(text: string | null | undefined) {
  if (!text) return text || ""
  return worldToneReplacements.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), text)
}

export function normalizeVossOptional(text: string | null | undefined) {
  const normalized = normalizeVossWorldTone(text)
  return normalized || undefined
}

/**
 * Words that should not return to authored Voss prose. Kept exported so tests,
 * audits and future authoring tooling can share the same contract.
 */
export const vossForbiddenWorldTonePatterns = [
  /\bпистолет/iu,
  /\bревольвер/iu,
  /\bвинтовк/iu,
  /\bкарабин/iu,
  /\bмушкет/iu,
  /\bружь/iu,
  /\bобойм/iu,
  /\bпатрон/iu,
  /\bснайпер/iu,
  /\bшрапнел/iu,
  /\bблиндаж/iu,
  /\bпулем[её]т/iu,
  /\bметаболизм/iu,
  /\bадреналин/iu,
  /\bкислород/iu,
  /\bсозависим/iu,
  /\bдиплом/iu,
  /\bАустерлиц/iu,
  /\bГродн/iu,
  /\bТорун/iu,
  /\bШтральзунд/iu,
] as const
