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
import { normalizeVossWorldTone } from "./vossWorldTone"

export const wizardClassVossNarration = normalizeVossWorldTone(wizardJohannClassVossNarration)
export const wizardClassVossComment = normalizeVossWorldTone(wizardJohannClassVossComment)

export function getWizardBaseVossNarration(level: number, sourceKey: string) {
  return normalizeVossWorldTone(
    getWizardJohannBaseVossNarration(level, sourceKey)
      || getLegacyWizardBaseVossNarration(level, sourceKey),
  )
}

export function getWizardBaseVossComment(level: number, sourceKey: string) {
  return normalizeVossWorldTone(
    getWizardJohannBaseVossComment(level, sourceKey)
      || getLegacyWizardBaseVossComment(level, sourceKey),
  )
}

export const wizardVossNarrationCoverage = Array.from(new Set([
  ...wizardJohannVossNarrationCoverage,
  ...legacyWizardVossNarrationCoverage,
]))
