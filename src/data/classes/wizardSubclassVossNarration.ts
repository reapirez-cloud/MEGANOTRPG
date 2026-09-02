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
  applyWizardGeminiPack3FeatureStories,
  getWizardGeminiPack3SubclassVossComment,
  getWizardGeminiPack3SubclassVossNarration,
  wizardGeminiPack3Coverage,
} from "./wizardSubclassVossNarrationGeminiPack3.ts"

applyWizardGeminiPack1FeatureStories()
applyWizardGeminiPack3FeatureStories()

export function getWizardSubclassVossNarration(subclassId: string) {
  return getWizardGeminiPack3SubclassVossNarration(subclassId)
    || getWizardGeminiPack1SubclassVossNarration(subclassId)
    || getBaseWizardSubclassVossNarration(subclassId)
}

export function getWizardSubclassVossComment(subclassId: string) {
  return getWizardGeminiPack3SubclassVossComment(subclassId)
    || getWizardGeminiPack1SubclassVossComment(subclassId)
    || getBaseWizardSubclassVossComment(subclassId)
}

export const wizardSubclassVossNarrationCoverage = Array.from(new Set([
  ...wizardGeminiPack3Coverage,
  ...wizardGeminiPack1Coverage,
  ...baseWizardSubclassVossNarrationCoverage,
]))
