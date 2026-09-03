import { wizardReferenceSubclasses } from "./wizardReference"
import { wizardSupplementReferenceSubclasses } from "./wizardSupplementReference"
import { wizardTashaReferenceSubclasses } from "./wizardTashaReference"
import {
  getWizardSubclassVossComment as getBaseWizardSubclassVossComment,
  getWizardSubclassVossNarration as getBaseWizardSubclassVossNarration,
  wizardSubclassVossNarrationCoverage as baseWizardSubclassVossNarrationCoverage,
} from "./wizardSubclassVossNarrationBase.ts"
import {
  applyWizardGeminiPack1FeatureStories,
  getWizardGeminiPack1SubclassVossComment,
  getWizardGeminiPack1SubclassVossNarration,
  wizardGeminiPack1Coverage,
} from "./wizardSubclassVossNarrationGeminiPack1.ts"
import {
  applyWizardGeminiPack2FeatureStories,
  getWizardGeminiPack2SubclassVossComment,
  getWizardGeminiPack2SubclassVossNarration,
  wizardGeminiPack2Coverage,
} from "./wizardSubclassVossNarrationGeminiPack2.ts"
import {
  applyWizardGeminiPack3FeatureStories,
  getWizardGeminiPack3SubclassVossComment,
  getWizardGeminiPack3SubclassVossNarration,
  wizardGeminiPack3Coverage,
} from "./wizardSubclassVossNarrationGeminiPack3.ts"
import {
  applyWizardGeminiPack4FeatureStories,
  getWizardGeminiPack4SubclassVossComment,
  getWizardGeminiPack4SubclassVossNarration,
  wizardGeminiPack4Coverage,
} from "./wizardSubclassVossNarrationGeminiPack4.ts"
import { normalizeVossWorldTone } from "./vossWorldTone"

applyWizardGeminiPack1FeatureStories()
applyWizardGeminiPack2FeatureStories()
applyWizardGeminiPack3FeatureStories()
applyWizardGeminiPack4FeatureStories()

for (const subclass of [
  ...wizardReferenceSubclasses,
  ...wizardTashaReferenceSubclasses,
  ...wizardSupplementReferenceSubclasses,
]) {
  if (subclass.voss) subclass.voss = normalizeVossWorldTone(subclass.voss)
  for (const feature of subclass.features || []) {
    feature.explanation = normalizeVossWorldTone(feature.explanation)
    if (feature.voss) feature.voss = normalizeVossWorldTone(feature.voss)
  }
}

export function getWizardSubclassVossNarration(subclassId: string) {
  return normalizeVossWorldTone(
    getWizardGeminiPack4SubclassVossNarration(subclassId)
      || getWizardGeminiPack3SubclassVossNarration(subclassId)
      || getWizardGeminiPack2SubclassVossNarration(subclassId)
      || getWizardGeminiPack1SubclassVossNarration(subclassId)
      || getBaseWizardSubclassVossNarration(subclassId),
  )
}

export function getWizardSubclassVossComment(subclassId: string) {
  return normalizeVossWorldTone(
    getWizardGeminiPack4SubclassVossComment(subclassId)
      || getWizardGeminiPack3SubclassVossComment(subclassId)
      || getWizardGeminiPack2SubclassVossComment(subclassId)
      || getWizardGeminiPack1SubclassVossComment(subclassId)
      || getBaseWizardSubclassVossComment(subclassId),
  )
}

export const wizardSubclassVossNarrationCoverage = Array.from(new Set([
  ...wizardGeminiPack4Coverage,
  ...wizardGeminiPack3Coverage,
  ...wizardGeminiPack2Coverage,
  ...wizardGeminiPack1Coverage,
  ...baseWizardSubclassVossNarrationCoverage,
]))
