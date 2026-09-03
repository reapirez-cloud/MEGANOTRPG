import {
  clericClassVossComment as currentClericClassVossComment,
  clericClassVossNarration as currentClericClassVossNarration,
  clericVossNarrationCoverage,
  getClericBaseVossComment as getCurrentClericBaseVossComment,
  getClericBaseVossNarration as getCurrentClericBaseVossNarration,
  getClericSubclassFeatureVossNarration as getCurrentClericSubclassFeatureVossNarration,
  getClericSubclassVossComment as getCurrentClericSubclassVossComment,
  getClericSubclassVossNarration as getCurrentClericSubclassVossNarration,
  normalizeClericDomainId,
} from "./clericVossNarrationCurrent"
import {
  clericDomainComments,
  clericDomainFeatureComments,
  clericDomainFeatureNarration,
  clericDomainNarration,
} from "./clericVossNarrationDomainsGemini"
import {
  clericMoreDomainComments,
  clericMoreDomainFeatureComments,
  clericMoreDomainFeatureNarration,
  clericMoreDomainNarration,
} from "./clericVossNarrationDomainsGeminiMore"
import {
  clericBatch2DomainComments,
  clericBatch2DomainFeatureComments,
  clericBatch2DomainFeatureNarration,
  clericBatch2DomainNarration,
} from "./clericVossNarrationDomainsGeminiBatch2"
import {
  clericBatch3DomainComments,
  clericBatch3DomainFeatureComments,
  clericBatch3DomainFeatureNarration,
  clericBatch3DomainNarration,
} from "./clericVossNarrationDomainsGeminiBatch3"
import { normalizeVossWorldTone } from "./vossWorldTone"

export { clericVossNarrationCoverage, normalizeClericDomainId }

export const clericClassVossNarration = normalizeVossWorldTone(currentClericClassVossNarration)
export const clericClassVossComment = normalizeVossWorldTone(currentClericClassVossComment)

export function getClericBaseVossNarration(level: number, sourceKey: string) {
  return normalizeVossWorldTone(getCurrentClericBaseVossNarration(level, sourceKey))
}

export function getClericBaseVossComment(level: number, sourceKey: string) {
  return normalizeVossWorldTone(getCurrentClericBaseVossComment(level, sourceKey))
}

export function getClericSubclassVossNarration(subclassId: string) {
  const id = normalizeClericDomainId(subclassId)
  return normalizeVossWorldTone(
    clericBatch3DomainNarration[id]
      || clericBatch2DomainNarration[id]
      || clericMoreDomainNarration[id]
      || clericDomainNarration[id]
      || getCurrentClericSubclassVossNarration(subclassId),
  )
}

export function getClericSubclassVossComment(subclassId: string) {
  const id = normalizeClericDomainId(subclassId)
  return normalizeVossWorldTone(
    clericBatch3DomainComments[id]
      || clericBatch2DomainComments[id]
      || clericMoreDomainComments[id]
      || clericDomainComments[id]
      || getCurrentClericSubclassVossComment(subclassId),
  )
}

export function getClericSubclassFeatureVossNarration(subclassId: string, sourceKey: string) {
  const id = normalizeClericDomainId(subclassId)
  return normalizeVossWorldTone(
    clericBatch3DomainFeatureNarration[id]?.[sourceKey]
      || clericBatch2DomainFeatureNarration[id]?.[sourceKey]
      || clericMoreDomainFeatureNarration[id]?.[sourceKey]
      || clericDomainFeatureNarration[id]?.[sourceKey]
      || getCurrentClericSubclassFeatureVossNarration(subclassId, sourceKey),
  )
}

export function getClericSubclassFeatureVossComment(subclassId: string, sourceKey: string) {
  const id = normalizeClericDomainId(subclassId)
  return normalizeVossWorldTone(
    clericBatch3DomainFeatureComments[id]?.[sourceKey]
      || clericBatch2DomainFeatureComments[id]?.[sourceKey]
      || clericMoreDomainFeatureComments[id]?.[sourceKey]
      || clericDomainFeatureComments[id]?.[sourceKey]
      || "",
  )
}
