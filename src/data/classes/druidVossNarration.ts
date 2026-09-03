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
import { normalizeVossWorldTone } from "./vossWorldTone"

export const druidClassVossNarration = normalizeVossWorldTone(druidLechClassVossNarration)
export const druidClassVossComment = normalizeVossWorldTone(currentDruidClassVossComment)

export function getDruidBaseVossNarration(level: number, name: string) {
  return normalizeVossWorldTone(
    getDruidLechBaseVossNarration(level, name)
      || getCurrentDruidBaseVossNarration(level, name),
  )
}

export function getDruidBaseVossComment(level: number, name: string) {
  return normalizeVossWorldTone(getDruidLechBaseVossComment(level, name))
}

// The Druid class view still reads base-feature comments from druidReference directly.
// Keep only the authored literary comment field synchronized here; mechanics stay untouched.
for (const feature of druidReference.features) {
  const authoredComment = getDruidLechBaseVossComment(feature.level, feature.name)
  if (authoredComment) feature.voss = normalizeVossWorldTone(authoredComment)
  feature.explanation = normalizeVossWorldTone(feature.explanation)
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
  return normalizeVossWorldTone(
    druidMoreSubclassNarration[id]
      || druidGeminiSubclassNarration[id]
      || getCurrentDruidSubclassVossNarration(subclassId),
  )
}

export function getDruidSubclassVossComment(subclassId: string) {
  const id = literarySubclassId(subclassId)
  return normalizeVossWorldTone(
    druidMoreSubclassComments[id]
      || druidGeminiSubclassComments[id]
      || getCurrentDruidSubclassVossComment(subclassId),
  )
}

export function getDruidSubclassFeatureVossNarration(subclassId: string, featureName: string) {
  const id = literarySubclassId(subclassId)
  return normalizeVossWorldTone(
    druidMoreFeatureNarration[id]?.[featureName]
      || druidGeminiFeatureNarration[id]?.[featureName]
      || getCurrentDruidSubclassFeatureVossNarration(subclassId, featureName),
  )
}

export function getDruidSubclassFeatureVossComment(subclassId: string, featureName: string) {
  const id = literarySubclassId(subclassId)
  return normalizeVossWorldTone(
    druidMoreFeatureComments[id]?.[featureName]
      || druidGeminiFeatureComments[id]?.[featureName]
      || getCurrentDruidSubclassFeatureVossComment(subclassId, featureName),
  )
}
