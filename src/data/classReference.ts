import { classReference as catalogClassReference } from "./classReferenceCatalog.ts"
import { WARLOCK_PHB2024_SUBCLASS_RUNTIME_CATALOG_KEYS } from "../rule-templates/warlockSubclasses.ts"
import { WARLOCK_SUPPLEMENTAL_RUNTIME_CATALOG_KEYS } from "../rule-templates/warlockSupplementalSubclasses.ts"

export type {
  ClassReferenceEntry,
  ClassReferenceSubclass,
  ClassReferenceSubclassFeature,
} from "./classReferenceCatalog.ts"

const WARLOCK_RUNTIME_CATALOG_KEYS = [
  ...WARLOCK_PHB2024_SUBCLASS_RUNTIME_CATALOG_KEYS,
  ...WARLOCK_SUPPLEMENTAL_RUNTIME_CATALOG_KEYS,
] as const

export const WARLOCK_RUNTIME_REFERENCE_SUBCLASS_IDS = WARLOCK_RUNTIME_CATALOG_KEYS.map((catalogKey) =>
  catalogKey.replace("subclass:warlock:", ""),
)

const warlockRuntimeSubclassIds = new Set<string>(WARLOCK_RUNTIME_REFERENCE_SUBCLASS_IDS)

/**
 * Public reference catalog.
 *
 * The raw literary catalog stays isolated in classReferenceCatalog.ts. Runtime
 * readiness is normalized here from the same catalog-key constants used by the
 * Character Engine packages, so player-facing cards cannot silently drift back
 * to a stale four-patron allow-list.
 */
export const classReference = catalogClassReference.map((entry) => {
  if (entry.id !== "warlock") return entry

  return {
    ...entry,
    description:
      "Базовый Warlock по Player's Handbook 2024 подключён к Character Engine. Runtime поддерживает девять сертифицированных покровителей: Архифею, Небожителя, Исчадие, Великого Древнего, Клинок-проклятие, Бездонного, Джинна, Нежить и Бессмертного. Raven Queen, Seeker и Great Wyrm остаются только литературными справочными материалами.",
    mechanics:
      "Базовый класс использует действующий PHB 2024 runtime, включая Pact Magic, Eldritch Invocations и Mystic Arcanum. Девять заявленных игровых покровителей имеют Character Engine runtime; только явно помеченные expanded/UA карточки остаются reference-only.",
    referenceOnly: false,
    subclasses: entry.subclasses.map((subclass) => {
      const runtimeReady = warlockRuntimeSubclassIds.has(subclass.id)
      return {
        ...subclass,
        referenceOnly: !runtimeReady,
        summary: runtimeReady
          ? "Справочное описание и runtime-механики этого покровителя подключены к Character Engine и входят в поддерживаемый Warlock runtime."
          : "Литературный перевод и справочное описание правил готовы; этот expanded/UA покровитель не входит в поддерживаемый Warlock runtime.",
      }
    }),
  }
})
