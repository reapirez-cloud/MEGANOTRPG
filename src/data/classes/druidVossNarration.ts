import {
  getDruidSubclassFeatureVossNarration as getDruidSubclassFeatureVossNarrationLegacy,
  getDruidSubclassVossNarration as getDruidSubclassVossNarrationLegacy,
} from "./druidVossNarrationLegacy.ts"

export {
  druidClassVossNarration,
  druidClassVossComment,
  getDruidBaseVossNarration,
  getDruidSubclassVossComment,
} from "./druidVossNarrationLegacy.ts"

export function getDruidSubclassVossNarration(subclassId: string) {
  if (subclassId === "moon" || subclassId === "circle-of-the-moon") {
    return "К лунным друидам я отношусь бережнее, чем к большинству магов: в звериной шкуре они не прячут человека, а выносят его на передовую вместе с клыками. Я видел, как медведь закрыл собой раненого мальчишку и стоял под копьями, пока того вытаскивали. После такого трудно смеяться над шерстью; смеёшься уже потом, когда лекарь считает дырки в обоих."
  }
  return getDruidSubclassVossNarrationLegacy(subclassId)
}

export function getDruidSubclassFeatureVossNarration(subclassId: string, featureName: string) {
  if ((subclassId === "land" || subclassId === "circle-of-the-land") && featureName === "Природное восстановление") {
    return "На коротком привале земной друид садится прямо в грязь и замолкает, пока остальные латают ремни и раны. Через несколько минут он встаёт заметно собраннее, будто сама почва вернула ему то, что бой успел выжечь. Я однажды сел рядом в надежде на тот же эффект. Земля вернула только холод в спину."
  }
  return getDruidSubclassFeatureVossNarrationLegacy(subclassId, featureName)
}
