import type {
  CharacterSource,
  ResolvedAction,
  ResolvedCharacterContract,
  ResolvedResource,
  ResolvedSpell,
} from "../../character-engine/index.ts"
import type { ResolvedSourceRef } from "../../character-engine/types.ts"

export type ChatActionBucket = "attacks" | "class" | "unique"
export type ChatSourceCategory = "class" | "unique" | "item" | "other"

export type ChatActionSourceGroup = {
  id: string
  name: string
  sourceType?: string
  resources: ResolvedResource[]
  actions: ResolvedAction[]
  spells: ResolvedSpell[]
}

export type ChatActionModel = {
  attacks: ResolvedAction[]
  classGroups: ChatActionSourceGroup[]
  uniqueGroups: ChatActionSourceGroup[]
}

const CLASS_SOURCE_TYPES = new Set(["class_template", "subclass_template"])
const UNIQUE_SOURCE_TYPES = new Set([
  "character_feature",
  "legacy_feature",
  "race_template",
  "subrace_template",
  "gm_effect",
  "feat",
  "trait",
])

export function chatSourceCategory(source: CharacterSource): ChatSourceCategory {
  const type = source.sourceType || ""
  if (CLASS_SOURCE_TYPES.has(type) || source.id.startsWith("template:class:") || source.id.startsWith("template:subclass:")) return "class"
  if (type === "inventory_item" || source.id.startsWith("item:")) return "item"
  if (UNIQUE_SOURCE_TYPES.has(type) || source.id.startsWith("feature:") || source.id.startsWith("legacy-feature:") || source.id.startsWith("template:race:") || source.id.startsWith("template:subrace:")) return "unique"
  return "other"
}

export function chatSourceGroupId(source: CharacterSource): string {
  const templateRoot = source.id.match(/^(template:[^:]+:[^:]+:v\d+)/)?.[1]
  return templateRoot || source.id
}

function distinctSources(refs: ResolvedSourceRef[]): CharacterSource[] {
  const map = new Map<string, CharacterSource>()
  for (const ref of refs) map.set(chatSourceGroupId(ref.source), ref.source)
  return [...map.values()]
}

function sourceRefsForSpell(spell: ResolvedSpell): ResolvedSourceRef[] {
  return spell.accesses.flatMap((access) => access.sources)
}

function resourceGroups(contract: ResolvedCharacterContract, category: "class" | "unique") {
  const ids = new Set<string>()
  for (const resource of contract.resources) {
    for (const source of distinctSources(resource.sources)) {
      const sourceCategory = chatSourceCategory(source)
      if (category === "class" ? sourceCategory === "class" : sourceCategory === "unique" || sourceCategory === "item") ids.add(chatSourceGroupId(source))
    }
  }
  return ids
}

function actionHasMeaningfulAttack(action: ResolvedAction) {
  return Boolean(action.attack) || action.damage.some((entry) => Boolean(entry.dice))
}

export function classifyChatAction(action: ResolvedAction, uniqueResourceGroupIds: ReadonlySet<string>): ChatActionBucket {
  const sources = distinctSources(action.sources)
  const categories = new Set(sources.map(chatSourceCategory))
  if (categories.has("class")) return "class"
  if (categories.has("unique")) return "unique"

  const itemGroups = sources.filter((source) => chatSourceCategory(source) === "item").map(chatSourceGroupId)
  const itemIsPowered = itemGroups.some((id) => uniqueResourceGroupIds.has(id))
  const explicitlyUnique = action.tags.some((tag) => ["unique", "magic_item", "special", "feature"].includes(tag.toLocaleLowerCase("en-US")))
  if (itemIsPowered || action.resourceCosts.length > 0 || explicitlyUnique) return "unique"
  if (actionHasMeaningfulAttack(action)) return "attacks"
  return "unique"
}

function ensureGroup(map: Map<string, ChatActionSourceGroup>, source: CharacterSource, fallbackType?: string) {
  const id = chatSourceGroupId(source)
  let group = map.get(id)
  if (!group) {
    group = { id, name: source.name || "Особая способность", sourceType: source.sourceType || fallbackType, resources: [], actions: [], spells: [] }
    map.set(id, group)
  }
  return group
}

function addUnique<T>(items: T[], item: T, identity: (value: T) => string) {
  const id = identity(item)
  if (!items.some((existing) => identity(existing) === id)) items.push(item)
}

function addResourceToGroups(map: Map<string, ChatActionSourceGroup>, resource: ResolvedResource, categories: ChatSourceCategory[]) {
  for (const source of distinctSources(resource.sources).filter((entry) => categories.includes(chatSourceCategory(entry)))) {
    addUnique(ensureGroup(map, source).resources, resource, (entry) => entry.stateKey)
  }
}

function addActionToGroups(map: Map<string, ChatActionSourceGroup>, action: ResolvedAction, categories: ChatSourceCategory[], fallback: ChatActionSourceGroup) {
  const sources = distinctSources(action.sources).filter((entry) => categories.includes(chatSourceCategory(entry)))
  if (!sources.length) {
    addUnique(fallback.actions, action, (entry) => entry.stateKey)
    return
  }
  for (const source of sources) addUnique(ensureGroup(map, source).actions, action, (entry) => entry.stateKey)
}

function addSpellToGroups(map: Map<string, ChatActionSourceGroup>, spell: ResolvedSpell, categories: ChatSourceCategory[]) {
  const sources = distinctSources(sourceRefsForSpell(spell)).filter((entry) => categories.includes(chatSourceCategory(entry)))
  for (const source of sources) addUnique(ensureGroup(map, source).spells, spell, (entry) => entry.key)
}

function sortedGroups(map: Map<string, ChatActionSourceGroup>) {
  return [...map.values()]
    .filter((group) => group.resources.length || group.actions.length || group.spells.length)
    .sort((left, right) => left.name.localeCompare(right.name, "ru"))
}

export function buildChatActionModel(contract: ResolvedCharacterContract | null): ChatActionModel {
  if (!contract) return { attacks: [], classGroups: [], uniqueGroups: [] }

  const classGroups = new Map<string, ChatActionSourceGroup>()
  const uniqueGroups = new Map<string, ChatActionSourceGroup>()
  const classFallback: ChatActionSourceGroup = { id: "class:other", name: "Классовые способности", sourceType: "class", resources: [], actions: [], spells: [] }
  const uniqueFallback: ChatActionSourceGroup = { id: "unique:other", name: "Особые способности", sourceType: "unique", resources: [], actions: [], spells: [] }
  classGroups.set(classFallback.id, classFallback)
  uniqueGroups.set(uniqueFallback.id, uniqueFallback)

  const uniqueResourceGroupIds = resourceGroups(contract, "unique")

  for (const resource of contract.resources) {
    addResourceToGroups(classGroups, resource, ["class"])
    addResourceToGroups(uniqueGroups, resource, ["unique", "item"])
  }

  const attacks: ResolvedAction[] = []
  for (const action of contract.actions) {
    const bucket = classifyChatAction(action, uniqueResourceGroupIds)
    if (bucket === "attacks") attacks.push(action)
    else if (bucket === "class") addActionToGroups(classGroups, action, ["class"], classFallback)
    else addActionToGroups(uniqueGroups, action, ["unique", "item"], uniqueFallback)
  }

  for (const spell of contract.spells) {
    addSpellToGroups(classGroups, spell, ["class"])
    addSpellToGroups(uniqueGroups, spell, ["unique", "item"])
  }

  return {
    attacks: attacks.slice().sort((a, b) => (a.label || a.key).localeCompare(b.label || b.key, "ru")),
    classGroups: sortedGroups(classGroups),
    uniqueGroups: sortedGroups(uniqueGroups),
  }
}
