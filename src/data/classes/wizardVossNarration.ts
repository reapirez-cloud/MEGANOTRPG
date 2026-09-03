import "./wizardSubclassVossNarration.ts"
import "./wizardLegacySubclassFeatureVossNarration.ts"

import {
  getWizardBaseVossComment as getLegacyWizardBaseVossComment,
  getWizardBaseVossNarration as getLegacyWizardBaseVossNarration,
  wizardVossNarrationCoverage as legacyWizardVossNarrationCoverage,
} from "./wizardVossNarrationLegacy.ts"
import {
  getWizardJohannBaseVossComment,
  getWizardJohannBaseVossNarration,
  wizardJohannClassVossComment,
  wizardJohannClassVossNarration,
  wizardJohannVossNarrationCoverage,
} from "./wizardVossNarrationJohann.ts"
import { normalizeVossWorldToneDeep } from "./vossWorldToneDeep.ts"

export const wizardClassVossNarration = normalizeVossWorldToneDeep(wizardJohannClassVossNarration)
export const wizardClassVossComment = normalizeVossWorldToneDeep(wizardJohannClassVossComment)

export function getWizardBaseVossNarration(level: number, sourceKey: string) {
  return normalizeVossWorldToneDeep(
    getWizardJohannBaseVossNarration(level, sourceKey)
      || getLegacyWizardBaseVossNarration(level, sourceKey),
  )
}

export function getWizardBaseVossComment(level: number, sourceKey: string) {
  return normalizeVossWorldToneDeep(
    getWizardJohannBaseVossComment(level, sourceKey)
      || getLegacyWizardBaseVossComment(level, sourceKey),
  )
}

export const wizardVossNarrationCoverage = Array.from(new Set([
  ...wizardJohannVossNarrationCoverage,
  ...legacyWizardVossNarrationCoverage,
]))