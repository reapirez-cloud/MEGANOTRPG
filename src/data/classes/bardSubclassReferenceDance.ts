import type { BardSubclassReferenceDraft } from "./bardSubclassReferenceDraft.ts"
import { normalizeVossWorldToneDeep } from "./vossWorldToneDeep.ts"

export const bardSubclassReferenceDance: BardSubclassReferenceDraft = {
  id: "dance",
  name: "Коллегия Танца",
  nameEn: "College of Dance",
  sourceHint: "Player's Handbook 2024",
  authorDescription: normalizeVossWorldToneDeep(
    "Коллегия Танца превращает дисциплину тела в такой же инструмент бардовской магии, как голос или струны. Это не артист, который случайно умеет драться, а человек, у которого движение, уклонение и удар складываются в один язык."
  ),
  authorComment: normalizeVossWorldToneDeep(
    "Самое неприятное в хорошем танцоре не то, что он красиво двигается. А то, что пока ты пытаешься понять, куда он шагнёт дальше, тебе уже прилетело пяткой в челюсть."
  ),
  features: [
    {
      level: 3,
      name: "Ослепительная работа ног",
      explanation: normalizeVossWorldToneDeep(
        "Танцор не разделяет выступление и драку: стойка, шаг и удар остаются частью одного ритма."
      ),
      mechanics: "",
      details: [],
      voss: normalizeVossWorldToneDeep("Если доспех мешает двигаться, он просто не надевает доспех."),
    },
    {
      level: 6,
      name: "Вдохновляющее движение и Совместная работа ног",
      explanation: normalizeVossWorldToneDeep(
        "К шестому уровню ритм начинает вытаскивать из опасности уже не только самого барда, но и людей рядом."
      ),
      mechanics: "",
      details: [],
      voss: normalizeVossWorldToneDeep("Один шаг вовремя иногда полезнее ещё одного удара."),
    },
    {
      level: 14,
      name: "Ведущее уклонение",
      explanation: normalizeVossWorldToneDeep(
        "Танцор читает опасное движение раньше, чем оно становится ударом, и может протащить через этот ритм стоящих рядом."
      ),
      mechanics: "",
      details: [],
      voss: normalizeVossWorldToneDeep("Красиво это выглядит только со стороны. Внутри обычно очень быстро и очень страшно."),
    },
  ],
}
