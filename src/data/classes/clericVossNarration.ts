import {
  clericClassVossComment,
  clericClassVossNarration,
  clericVossNarrationCoverage,
  getClericBaseVossComment,
  getClericBaseVossNarration,
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

export {
  clericClassVossComment,
  clericClassVossNarration,
  clericVossNarrationCoverage,
  getClericBaseVossComment,
  getClericBaseVossNarration,
  normalizeClericDomainId,
}

export function getClericSubclassVossNarration(subclassId: string) {
  const id = normalizeClericDomainId(subclassId)
  return clericBatch2DomainNarration[id]
    || clericMoreDomainNarration[id]
    || clericDomainNarration[id]
    || getCurrentClericSubclassVossNarration(subclassId)
}

export function getClericSubclassVossComment(subclassId: string) {
  const id = normalizeClericDomainId(subclassId)
  return clericBatch2DomainComments[id]
    || clericMoreDomainComments[id]
    || clericDomainComments[id]
    || getCurrentClericSubclassVossComment(subclassId)
}

export function getClericSubclassFeatureVossNarration(subclassId: string, sourceKey: string) {
  const id = normalizeClericDomainId(subclassId)
  return clericBatch2DomainFeatureNarration[id]?.[sourceKey]
    || clericMoreDomainFeatureNarration[id]?.[sourceKey]
    || clericDomainFeatureNarration[id]?.[sourceKey]
    || getCurrentClericSubclassFeatureVossNarration(subclassId, sourceKey)
}

export function getClericSubclassFeatureVossComment(subclassId: string, sourceKey: string) {
  const id = normalizeClericDomainId(subclassId)
  return clericBatch2DomainFeatureComments[id]?.[sourceKey]
    || clericMoreDomainFeatureComments[id]?.[sourceKey]
    || clericDomainFeatureComments[id]?.[sourceKey]
    || ""
}
