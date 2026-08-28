import type {
  CharacterSource,
  ResolvedAction,
  ResolvedCharacterContract,
  ResolvedGrant,
  ResolvedResource,
  ResolvedSourceRef,
  ResolvedSpell,
  ResolvedSpellAccess,
} from "../character-engine/index.ts"
import type { CharacterClassPackage } from "./classPackages.ts"

export type TemplateSourceRef = {
  kind: "class" | "subclass"
  templateId: string
}

export type PresentedClassSpell = {
  spell: ResolvedSpell
  access: ResolvedSpellAccess
}

export type PresentedTemplateMechanics = {
  templateId: string
  kind: "class" | "subclass"
  name: string
  level: number
  features: ResolvedGrant[]
  resources: ResolvedResource[]
  actions: ResolvedAction[]
  spells: PresentedClassSpell[]
}

export type PresentedClassPackage = {
  classMechanics: PresentedTemplateMechanics
  subclassMechanics?: PresentedTemplateMechanics
}

/** Renderer/read-model parsing only. CE never branches on this provenance. */
export function templateRefFromSource(source: CharacterSource): TemplateSourceRef | null {
  const match = source.id.match(/^template:(class|subclass):([^:]+):v\d+/)
  if (!match) return null
  return { kind: match[1] as TemplateSourceRef["kind"], templateId: match[2]! }
}

function matchesTemplate(sources: ResolvedSourceRef[], kind: TemplateSourceRef["kind"], templateId: string): boolean {
  return sources.some((entry) => {
    const ref = templateRefFromSource(entry.source)
    return ref?.kind === kind && ref.templateId === templateId
  })
}

function templateMechanics(
  contract: ResolvedCharacterContract,
  templateId: string,
  kind: TemplateSourceRef["kind"],
  name: string,
  level: number,
): PresentedTemplateMechanics {
  const features = [...contract.capabilities.features, ...contract.capabilities.traits]
    .filter((entry) => matchesTemplate(entry.sources, kind, templateId))
  const resources = contract.resources.filter((entry) =>
    !/^spell_slot_\d+$/.test(entry.key) && matchesTemplate(entry.sources, kind, templateId),
  )
  const actions = contract.actions.filter((entry) => matchesTemplate(entry.sources, kind, templateId))
  const spells = contract.spells.flatMap((spell) =>
    spell.accesses
      .filter((access) => matchesTemplate(access.sources, kind, templateId))
      .map((access) => ({ spell, access })),
  )

  return { templateId, kind, name, level, features, resources, actions, spells }
}

export function presentClassPackages(
  contract: ResolvedCharacterContract,
  packages: CharacterClassPackage[],
): PresentedClassPackage[] {
  return packages.map((entry) => ({
    classMechanics: templateMechanics(
      contract,
      entry.classTemplateId,
      "class",
      entry.className,
      entry.level,
    ),
    ...(entry.subclassTemplateId && entry.subclassName && entry.subclassActive
      ? {
          subclassMechanics: templateMechanics(
            contract,
            entry.subclassTemplateId,
            "subclass",
            entry.subclassName,
            entry.level,
          ),
        }
      : {}),
  }))
}
