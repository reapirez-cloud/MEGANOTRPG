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

function normalizeWizardVoss(text: string | null | undefined) {
  return normalizeVossWorldToneDeep(text).replace(
    /Ему больше не нужны были ячейки, паузы и вздохи/giu,
    "Ему больше не нужны были передышки, новые расчёты и долгие приготовления",
  )
}

export const wizardClassVossNarration = normalizeWizardVoss(wizardJohannClassVossNarration)
export const wizardClassVossComment = normalizeWizardVoss(wizardJohannClassVossComment)

export function getWizardBaseVossNarration(level: number, sourceKey: string) {
  return normalizeWizardVoss(
    getWizardJohannBaseVossNarration(level, sourceKey)
      || getLegacyWizardBaseVossNarration(level, sourceKey),
  )
}

export function getWizardBaseVossComment(level: number, sourceKey: string) {
  return normalizeWizardVoss(
    getWizardJohannBaseVossComment(level, sourceKey)
      || getLegacyWizardBaseVossComment(level, sourceKey),
  )
}

export const wizardVossNarrationCoverage = Array.from(new Set([
  ...wizardJohannVossNarrationCoverage,
  ...legacyWizardVossNarrationCoverage,
]))