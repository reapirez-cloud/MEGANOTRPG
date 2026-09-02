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
  return clericMoreDomainNarration[id]
    || clericDomainNarration[id]
    || getCurrentClericSubclassVossNarration(subclassId)
}

export function getClericSubclassVossComment(subclassId: string) {
  const id = normalizeClericDomainId(subclassId)
  return clericMoreDomainComments[id]
    || clericDomainComments[id]
    || getCurrentClericSubclassVossComment(subclassId)
}

export function getClericSubclassFeatureVossNarration(subclassId: string, sourceKey: string) {
  const id = normalizeClericDomainId(subclassId)
  return clericMoreDomainFeatureNarration[id]?.[sourceKey]
    || clericDomainFeatureNarration[id]?.[sourceKey]
    || getCurrentClericSubclassFeatureVossNarration(subclassId, sourceKey)
}

export function getClericSubclassFeatureVossComment(subclassId: string, sourceKey: string) {
  const id = normalizeClericDomainId(subclassId)
  return clericMoreDomainFeatureComments[id]?.[sourceKey]
    || clericDomainFeatureComments[id]?.[sourceKey]
    || ""
}
