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
} from "./clericVossNarrationCurrent.ts"
import {
  clericDomainComments,
  clericDomainFeatureComments,
  clericDomainFeatureNarration,
  clericDomainNarration,
} from "./clericVossNarrationDomainsGemini.ts"
import {
  clericMoreDomainComments,
  clericMoreDomainFeatureComments,
  clericMoreDomainFeatureNarration,
  clericMoreDomainNarration,
} from "./clericVossNarrationDomainsGeminiMore.ts"
import {
  clericBatch2DomainComments,
  clericBatch2DomainFeatureComments,
  clericBatch2DomainFeatureNarration,
  clericBatch2DomainNarration,
} from "./clericVossNarrationDomainsGeminiBatch2.ts"
import {
  clericBatch3DomainComments,
  clericBatch3DomainFeatureComments,
  clericBatch3DomainFeatureNarration,
  clericBatch3DomainNarration,
} from "./clericVossNarrationDomainsGeminiBatch3.ts"
import { normalizeVossWorldToneDeep } from "./vossWorldToneDeep.ts"

export { clericVossNarrationCoverage, normalizeClericDomainId }

function normalizeClericVoss(text: string | null | undefined) {
  return normalizeVossWorldToneDeep(text)
    .replace(/первоклассного бухгалтера/giu, "сухого счётного писаря")
    .replace(/бухгалтера/giu, "счётного писаря")
    .replace(/бухгалтером/giu, "счётным писарем")
    .replace(/бухгалтер/giu, "счётный писарь")
}

export const clericClassVossNarration = normalizeClericVoss(currentClericClassVossNarration)
export const clericClassVossComment = normalizeClericVoss(currentClericClassVossComment)

export function getClericBaseVossNarration(level: number, sourceKey: string) {
  return normalizeClericVoss(getCurrentClericBaseVossNarration(level, sourceKey))
}

export function getClericBaseVossComment(level: number, sourceKey: string) {
  return normalizeClericVoss(getCurrentClericBaseVossComment(level, sourceKey))
}

export function getClericSubclassVossNarration(subclassId: string) {
  const id = normalizeClericDomainId(subclassId)
  return normalizeClericVoss(
    clericBatch3DomainNarration[id]
      || clericBatch2DomainNarration[id]
      || clericMoreDomainNarration[id]
      || clericDomainNarration[id]
      || getCurrentClericSubclassVossNarration(subclassId),
  )
}

export function getClericSubclassVossComment(subclassId: string) {
  const id = normalizeClericDomainId(subclassId)
  return normalizeClericVoss(
    clericBatch3DomainComments[id]
      || clericBatch2DomainComments[id]
      || clericMoreDomainComments[id]
      || clericDomainComments[id]
      || getCurrentClericSubclassVossComment(subclassId),
  )
}

export function getClericSubclassFeatureVossNarration(subclassId: string, sourceKey: string) {
  const id = normalizeClericDomainId(subclassId)
  return normalizeClericVoss(
    clericBatch3DomainFeatureNarration[id]?.[sourceKey]
      || clericBatch2DomainFeatureNarration[id]?.[sourceKey]
      || clericMoreDomainFeatureNarration[id]?.[sourceKey]
      || clericDomainFeatureNarration[id]?.[sourceKey]
      || getCurrentClericSubclassFeatureVossNarration(subclassId, sourceKey),
  )
}

export function getClericSubclassFeatureVossComment(subclassId: string, sourceKey: string) {
  const id = normalizeClericDomainId(subclassId)
  return normalizeClericVoss(
    clericBatch3DomainFeatureComments[id]?.[sourceKey]
      || clericBatch2DomainFeatureComments[id]?.[sourceKey]
      || clericMoreDomainFeatureComments[id]?.[sourceKey]
      || clericDomainFeatureComments[id]?.[sourceKey]
      || "",
  )
}