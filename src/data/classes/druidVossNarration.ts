import { druidReference } from "./druidReference"
import {
  druidClassVossComment as currentDruidClassVossComment,
  getDruidBaseVossNarration as getCurrentDruidBaseVossNarration,
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
import {
  druidLechClassVossNarration,
  getDruidLechBaseVossComment,
  getDruidLechBaseVossNarration,
} from "./druidVossNarrationLech"
import { normalizeVossWorldToneDeep } from "./vossWorldToneDeep"

export const druidClassVossNarration = normalizeVossWorldToneDeep(druidLechClassVossNarration)
export const druidClassVossComment = normalizeVossWorldToneDeep(currentDruidClassVossComment)

export function getDruidBaseVossNarration(level: number, name: string) {
  return normalizeVossWorldToneDeep(
    getDruidLechBaseVossNarration(level, name)
      || getCurrentDruidBaseVossNarration(level, name),
  )
}

export function getDruidBaseVossComment(level: number, name: string) {
  return normalizeVossWorldToneDeep(getDruidLechBaseVossComment(level, name))
}

// The Druid class view still reads base-feature comments from druidReference directly.
// Keep only the authored literary comment field synchronized here; mechanics stay untouched.
for (const feature of druidReference.features) {
  const authoredComment = getDruidLechBaseVossComment(feature.level, feature.name)
  if (authoredComment) feature.voss = normalizeVossWorldToneDeep(authoredComment)
  feature.explanation = normalizeVossWorldToneDeep(feature.explanation)
}

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
  return normalizeVossWorldToneDeep(
    druidMoreSubclassNarration[id]
      || druidGeminiSubclassNarration[id]
      || getCurrentDruidSubclassVossNarration(subclassId),
  )
}

export function getDruidSubclassVossComment(subclassId: string) {
  const id = literarySubclassId(subclassId)
  return normalizeVossWorldToneDeep(
    druidMoreSubclassComments[id]
      || druidGeminiSubclassComments[id]
      || getCurrentDruidSubclassVossComment(subclassId),
  )
}

export function getDruidSubclassFeatureVossNarration(subclassId: string, featureName: string) {
  const id = literarySubclassId(subclassId)
  return normalizeVossWorldToneDeep(
    druidMoreFeatureNarration[id]?.[featureName]
      || druidGeminiFeatureNarration[id]?.[featureName]
      || getCurrentDruidSubclassFeatureVossNarration(subclassId, featureName),
  )
}

export function getDruidSubclassFeatureVossComment(subclassId: string, featureName: string) {
  const id = literarySubclassId(subclassId)
  return normalizeVossWorldToneDeep(
    druidMoreFeatureComments[id]?.[featureName]
      || druidGeminiFeatureComments[id]?.[featureName]
      || getCurrentDruidSubclassFeatureVossComment(subclassId, featureName),
  )
}