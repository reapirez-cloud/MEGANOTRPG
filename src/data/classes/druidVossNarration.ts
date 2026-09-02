import {
  druidClassVossComment,
  druidClassVossNarration,
  getDruidBaseVossNarration,
  getDruidSubclassFeatureVossComment as getCurrentDruidSubclassFeatureVossComment,
  getDruidSubclassFeatureVossNarration as getCurrentDruidSubclassFeatureVossNarration,
  getDruidSubclassVossComment as getCurrentDruidSubclassVossComment,
  getDruidSubclassVossNarration as getCurrentDruidSubclassVossNarration,
} from "./druidVossNarrationMoon"
import {
  druidGeminiFeatureComments,
  druidGeminiFeatureNarration,
  druidGeminiSubclassComments,
  druidGeminiSubclassNarration,
} from "./druidVossNarrationGemini"

export { druidClassVossComment, druidClassVossNarration, getDruidBaseVossNarration }

const subclassAliases: Record<string, string> = {
  "circle-of-stars": "stars",
  "circle-of-wildfire": "wildfire",
  "circle-of-the-land": "land",
}

function literarySubclassId(subclassId: string) {
  return subclassAliases[subclassId] || subclassId
}

export function getDruidSubclassVossNarration(subclassId: string) {
  const id = literarySubclassId(subclassId)
  return druidGeminiSubclassNarration[id] || getCurrentDruidSubclassVossNarration(subclassId)
}

export function getDruidSubclassVossComment(subclassId: string) {
  const id = literarySubclassId(subclassId)
  return druidGeminiSubclassComments[id] || getCurrentDruidSubclassVossComment(subclassId)
}

export function getDruidSubclassFeatureVossNarration(subclassId: string, featureName: string) {
  const id = literarySubclassId(subclassId)
  return druidGeminiFeatureNarration[id]?.[featureName] || getCurrentDruidSubclassFeatureVossNarration(subclassId, featureName)
}

export function getDruidSubclassFeatureVossComment(subclassId: string, featureName: string) {
  const id = literarySubclassId(subclassId)
  return druidGeminiFeatureComments[id]?.[featureName] || getCurrentDruidSubclassFeatureVossComment(subclassId, featureName)
}
