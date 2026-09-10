import { classReference as catalogClassReference } from "./classReferenceCatalog.ts"
import { rogueReferenceCurrent } from "./classes/rogueReferenceCurrent.ts"
import { rogueSubclassReferenceWave1 } from "./classes/rogueSubclassReferenceWave1.ts"
import { rogueSubclassReferenceWave2 } from "./classes/rogueSubclassReferenceWave2.ts"
import { WARLOCK_PHB2024_SUBCLASS_RUNTIME_CATALOG_KEYS } from "../rule-templates/warlockSubclasses.ts"
import { WARLOCK_SUPPLEMENTAL_RUNTIME_CATALOG_KEYS } from "../rule-templates/warlockSupplementalSubclasses.ts"
import { SORCERER_STAGE7_RUNTIME_CATALOG_KEYS } from "../rule-templates/sorcererSubclassMechanics.ts"

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

export const SORCERER_RUNTIME_REFERENCE_SUBCLASS_IDS = SORCERER_STAGE7_RUNTIME_CATALOG_KEYS.map((catalogKey) =>
  catalogKey.replace("subclass:sorcerer:", ""),
)

const warlockRuntimeSubclassIds = new Set<string>(WARLOCK_RUNTIME_REFERENCE_SUBCLASS_IDS)
const sorcererRuntimeSubclassIds = new Set<string>(SORCERER_RUNTIME_REFERENCE_SUBCLASS_IDS)
const rogueTranslatedSubclassById = new Map(
  [...rogueSubclassReferenceWave1, ...rogueSubclassReferenceWave2].map((subclass) => [subclass.id, subclass]),
)
const publicClassReferenceCatalog = [...catalogClassReference, rogueReferenceCurrent]

/**
 * Public reference catalog.
 *
 * The raw literary catalog stays isolated in classReferenceCatalog.ts. Runtime
 * readiness is normalized here from the same catalog-key constants used by the
 * Character Engine packages, so player-facing cards cannot silently drift back
 * to a stale four-patron allow-list.
 */
export const classReference = publicClassReferenceCatalog.map((entry) => {
  if (entry.id === "rogue") {
    return {
      ...entry,
      subclasses: entry.subclasses.map((subclass) => rogueTranslatedSubclassById.get(subclass.id) ?? subclass),
    }
  }

  if (entry.id === "sorcerer") {
    return {
      ...entry,
      description:
        "Базовый Чародей подключён к Character Engine по правилам 2024: Врождённое чародейство, Очки чародейства, Источник магии, Метамагия, Чародейское восстановление, Воплощение чародейства, Магический апофеоз и полный заклинательный runtime работают через общий CE/GENA контур.",
      mechanics:
        "Runtime поддерживает базовый класс и девять сертифицированных подклассов. Выборы заклинаний и Метамагии сохраняются между уровнями, ресурсы и ячейки расходуются через общий ledger, а три расширенных кандидата Runechild, Phoenix Sorcery и Stone Sorcery остаются только справочными.",
      referenceOnly: false,
      subclasses: entry.subclasses.map((subclass) => {
        const runtimeReady = sorcererRuntimeSubclassIds.has(subclass.id)
        return {
          ...subclass,
          referenceOnly: !runtimeReady,
          summary: runtimeReady
            ? "Справочное описание и runtime-механики этого происхождения подключены к Character Engine и входят в сертифицированный Sorcerer runtime."
            : "Литературный перевод и справочное описание правил готовы; этот расширенный кандидат не входит в сертифицированный Sorcerer runtime.",
        }
      }),
    }
  }

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
