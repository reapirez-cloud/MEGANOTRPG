import {
  druidClassVossNarration,
  getDruidBaseVossNarration,
  getDruidSubclassFeatureVossNarration as getGeminiDruidSubclassFeatureVossNarration,
  getDruidSubclassVossNarration,
} from "./druidVossNarrationGemini.ts"

export {
  druidClassVossNarration,
  getDruidBaseVossNarration,
  getDruidSubclassVossNarration,
}

const featureNameAliases: Record<string, string> = {
  "spores:Ореол спор и Симбиотическая сущность": "Ореоло спор и Симбиотическая сущность",
}

export function getDruidSubclassFeatureVossNarration(subclassId: string, featureName: string) {
  const alias = featureNameAliases[`${subclassId}:${featureName}`] ?? featureName
  return getGeminiDruidSubclassFeatureVossNarration(subclassId, alias)
}

export {
  druidClassVossComment,
  getDruidSubclassVossComment,
} from "./druidVossNarrationLegacy.ts"
