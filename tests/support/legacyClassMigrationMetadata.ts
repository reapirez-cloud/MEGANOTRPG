export type LegacyClassMigrationScope = "mechanics" | "presentation" | "infrastructure"

export type LegacyClassMigrationMetadata = {
  scope: LegacyClassMigrationScope
  packageTest?: string
  resourcePolicy?: "short-long-rest-v1"
  workStatus?: string
  statusLedger?: string
}

const paladinMechanics = (workStatus: string): LegacyClassMigrationMetadata => ({
  scope: "mechanics",
  packageTest: "tests/paladinRuntimePackage.test.ts",
  resourcePolicy: "short-long-rest-v1",
  workStatus,
  statusLedger: "src/rule-templates/CLASS_WORK_STATUS.md",
})

/**
 * Metadata for already-applied class migrations created before the strict
 * migration-header contract was enforced. Keeping it here avoids rewriting
 * production migration history solely to add developer-only comments.
 *
 * New migrations MUST carry CLASS_MIGRATION_SCOPE / CLASS_PACKAGE_TEST /
 * CLASS_RESOURCE_POLICY / CLASS_WORK_STATUS / CLASS_STATUS_LEDGER in SQL.
 */
export const LEGACY_CLASS_MIGRATION_METADATA: Record<string, LegacyClassMigrationMetadata> = {
  "20260907171053_paladin_base_runtime_stage2.sql": paladinMechanics("paladin:base-runtime=READY_STAGE2;spells=PENDING_STAGE3"),
  "20260907183823_paladin_spell_runtime_stage3.sql": paladinMechanics("paladin:spells=READY_STAGE3;subclasses=PENDING_STAGE4"),
  "20260908060543_paladin_stage4_subclass_foundation_v2.sql": paladinMechanics("paladin:subclasses=IN_PROGRESS_STAGE4"),
  "20260908060701_paladin_stage4_phb_subclass_mechanics_v2.sql": paladinMechanics("paladin:subclasses=READY_STAGE4;final-certification=PENDING"),
  "20260908061030_paladin_stage4_resource_effect_identity_fix_v1.sql": paladinMechanics("paladin:subclasses=READY_STAGE4_RESOURCE_IDENTITY_FIX"),
  "20260908061142_paladin_runtime_final_certification_v1.sql": paladinMechanics("paladin:runtime=READY"),
  "20260908071850_paladin_assignment_resource_sync_v1.sql": paladinMechanics("paladin:runtime=READY_RESOURCE_SYNC"),
  "20260908072346_paladin_glory_resource_max_bridge_v1.sql": paladinMechanics("paladin:runtime=READY_GLORY_RESOURCE_BRIDGE"),
  "20260908072642_paladin_runtime_final_certification_v2.sql": paladinMechanics("paladin:runtime=READY"),
  "20260908081053_paladin_complete_15_oaths_v3.sql": paladinMechanics("paladin:complete-roster=READY_V3"),
  "20260908081539_paladin_complete_15_oaths_certification_v3.sql": paladinMechanics("paladin:runtime=READY_15_OATHS"),
  "20260908115433_paladin_final_source_reconciliation_v4.sql": {
    scope: "presentation",
    workStatus: "paladin:sources=RECONCILED_V4",
    statusLedger: "src/rule-templates/CLASS_WORK_STATUS.md",
  },
  "20260908131500_paladin_final_closeout_v1.sql": paladinMechanics("paladin:CLOSED"),
}

export function legacyClassMigrationMetadata(name: string): LegacyClassMigrationMetadata | undefined {
  return LEGACY_CLASS_MIGRATION_METADATA[name]
}
