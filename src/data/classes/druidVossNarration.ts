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
import {
  druidMoreFeatureComments,
  druidMoreFeatureNarration,
  druidMoreSubclassComments,
  druidMoreSubclassNarration,
} from "./druidVossNarrationGeminiMore"

export { druidClassVossComment, druidClassVossNarration, getDruidBaseVossNarration }

const subclassAliases: Record<string, string> = {
  "circle-of-stars": "stars",
  "circle-of-wildfire": "wildfire",
  "circle-of-the-land": "land",
  "circle-of-the-sea": "sea",
  "circle-of-the-shepherd": "shepherd",
  "circle-of-dreams": "dreams",
}

function literarySubclassId(subclassId: string) {
  return subclassAliases[subclassId] || subclassId
}

export function getDruidSubclassVossNarration(subclassId: string) {
  const id = literarySubclassId(subclassId)
  return druidMoreSubclassNarration[id]
    || druidGeminiSubclassNarration[id]
    || getCurrentDruidSubclassVossNarration(subclassId)
}

export function getDruidSubclassVossComment(subclassId: string) {
  const id = literarySubclassId(subclassId)
  return druidMoreSubclassComments[id]
    || druidGeminiSubclassComments[id]
    || getCurrentDruidSubclassVossComment(subclassId)
}

export function getDruidSubclassFeatureVossNarration(subclassId: string, featureName: string) {
  const id = literarySubclassId(subclassId)
  return druidMoreFeatureNarration[id]?.[featureName]
    || druidGeminiFeatureNarration[id]?.[featureName]
    || getCurrentDruidSubclassFeatureVossNarration(subclassId, featureName)
}

export function getDruidSubclassFeatureVossComment(subclassId: string, featureName: string) {
  const id = literarySubclassId(subclassId)
  return druidMoreFeatureComments[id]?.[featureName]
    || druidGeminiFeatureComments[id]?.[featureName]
    || getCurrentDruidSubclassFeatureVossComment(subclassId, featureName)
}
