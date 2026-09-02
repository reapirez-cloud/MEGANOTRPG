import type { ClassReferenceSubclass } from "../classReference"
import { wizardLegacySchoolReferenceSubclasses } from "./wizardLegacySchoolsReference"
import { wizardWildemountReferenceSubclasses } from "./wizardWildemountReference"
import { wizardXanatharReferenceSubclasses } from "./wizardXanatharReference"

/**
 * Presentation-only aggregate for official Wizard subclasses outside the
 * PHB 2024 replacement set and Tasha pack. Runtime integration is separate.
 */
export const WIZARD_SUPPLEMENT_REFERENCE_REVISION = "wizard-supplements-grimdark-text@2"

export const wizardSupplementReferenceSubclasses: ClassReferenceSubclass[] = [
  ...wizardLegacySchoolReferenceSubclasses,
  ...wizardXanatharReferenceSubclasses,
  ...wizardWildemountReferenceSubclasses,
]

export const wizardSupplementReference = {
  source: "Player's Handbook 2014, Xanathar's Guide to Everything, Explorer's Guide to Wildemount",
  revision: WIZARD_SUPPLEMENT_REFERENCE_REVISION,
  subclasses: wizardSupplementReferenceSubclasses,
}
