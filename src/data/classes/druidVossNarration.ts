import {
  getDruidSubclassFeatureVossNarration as getDruidSubclassFeatureVossNarrationGemini,
  getDruidSubclassVossNarration as getDruidSubclassVossNarrationGemini,
} from "./druidVossNarrationGemini.ts"

export {
  druidClassVossNarration,
  getDruidBaseVossNarration,
} from "./druidVossNarrationGemini.ts"

export {
  druidClassVossComment,
  getDruidSubclassVossComment,
} from "./druidVossNarrationLegacy.ts"

export function getDruidSubclassVossNarration(subclassId: string) {
  if (subclassId === "moon" || subclassId === "circle-of-the-moon") {
    return "К лунным друидам я отношусь бережнее, чем к большинству магов: в звериной шкуре они не прячут человека, а выносят его на передовую вместе с клыками. Я видел, как медведь закрыл собой раненого мальчишку и стоял под копьями, пока того вытаскивали. После такого трудно смеяться над шерстью; смеёшься уже потом, когда лекарь считает дырки в обоих."
  }
  return getDruidSubclassVossNarrationGemini(subclassId)
}

export function getDruidSubclassFeatureVossNarration(subclassId: string, featureName: string) {
  if ((subclassId === "spores" || subclassId === "circle-of-spores") && featureName === "Ореол спор и Симбиотическая сущность") {
    return getDruidSubclassFeatureVossNarrationGemini(subclassId, "Ореоло спор и Симбиотическая сущность")
  }
  return getDruidSubclassFeatureVossNarrationGemini(subclassId, featureName)
}
