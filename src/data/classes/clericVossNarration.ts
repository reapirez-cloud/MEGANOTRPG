import {
  getClericSubclassFeatureVossNarration as getClericSubclassFeatureVossNarrationGemini,
  normalizeClericDomainId,
} from "./clericVossNarrationGemini.ts"

export {
  clericClassVossNarration,
  normalizeClericDomainId,
  getClericBaseVossNarration,
  getClericSubclassVossNarration,
  clericVossNarrationCoverage,
} from "./clericVossNarrationGemini.ts"

export {
  clericClassVossComment,
  getClericSubclassVossComment,
} from "./clericVossNarrationLegacy.ts"

export function getClericSubclassFeatureVossNarration(subclassId: string, sourceKey: string) {
  if (normalizeClericDomainId(subclassId) === "death" && sourceKey === "blessed-strikes-l8-2") {
    return "Погребальный свет ложится на оружие без торжественных песен и красивых знамен. Я видел, как после такого удара человек ещё секунду стоял на ногах, будто тело не успело понять, что душа уже ушла вперёд. Жрец Смерти только вытер клинок и пошёл дальше — на его службе паузы обычно достаются мёртвым."
  }
  return getClericSubclassFeatureVossNarrationGemini(subclassId, sourceKey)
}
