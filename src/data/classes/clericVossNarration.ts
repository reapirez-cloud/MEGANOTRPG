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
  return clericDomainNarration[id] || getCurrentClericSubclassVossNarration(subclassId)
}

export function getClericSubclassVossComment(subclassId: string) {
  const id = normalizeClericDomainId(subclassId)
  return clericDomainComments[id] || getCurrentClericSubclassVossComment(subclassId)
}

export function getClericSubclassFeatureVossNarration(subclassId: string, sourceKey: string) {
  const id = normalizeClericDomainId(subclassId)
  return clericDomainFeatureNarration[id]?.[sourceKey]
    || getCurrentClericSubclassFeatureVossNarration(subclassId, sourceKey)
}

export function getClericSubclassFeatureVossComment(subclassId: string, sourceKey: string) {
  const id = normalizeClericDomainId(subclassId)
  return clericDomainFeatureComments[id]?.[sourceKey] || ""
}
