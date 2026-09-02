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

applyWizardGeminiPack1FeatureStories()

export function getWizardSubclassVossNarration(subclassId: string) {
  return getWizardGeminiPack1SubclassVossNarration(subclassId)
    || getBaseWizardSubclassVossNarration(subclassId)
}

export function getWizardSubclassVossComment(subclassId: string) {
  return getWizardGeminiPack1SubclassVossComment(subclassId)
    || getBaseWizardSubclassVossComment(subclassId)
}

export const wizardSubclassVossNarrationCoverage = Array.from(new Set([
  ...wizardGeminiPack1Coverage,
  ...baseWizardSubclassVossNarrationCoverage,
]))
