import {
  clericClassVossNarration,
  clericVossNarrationCoverage,
  getClericBaseVossNarration,
  getClericSubclassFeatureVossNarration as getGeminiClericSubclassFeatureVossNarration,
  getClericSubclassVossNarration,
  normalizeClericDomainId,
} from "./clericVossNarrationGemini.ts"

export {
  clericClassVossNarration,
  clericVossNarrationCoverage,
  getClericBaseVossNarration,
  getClericSubclassVossNarration,
  normalizeClericDomainId,
}

const featureNarrationOverrides: Record<string, string> = {
  "death:blessed-strikes-l8-2": "Погребальный свет ложится на врага не сиянием с храмовой росписи, а белым жаром крематория: плоть ещё держится на костях, а человек уже понимает, что отпевание ему устроили прямо посреди боя. Удобно — похоронной команде потом меньше работы.",
}

export function getClericSubclassFeatureVossNarration(subclassId: string, sourceKey: string) {
  const domainId = normalizeClericDomainId(subclassId)
  return featureNarrationOverrides[`${domainId}:${sourceKey}`]
    ?? getGeminiClericSubclassFeatureVossNarration(domainId, sourceKey)
}

export {
  clericClassVossComment,
  getClericSubclassVossComment,
} from "./clericVossNarrationLegacy.ts"
