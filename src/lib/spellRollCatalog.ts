import { catalogSpellName, type CatalogSpell } from "./spellCatalog.ts"
import {
  validateRollRecipe,
  type RollRecipe,
  type RollSequenceDefinition,
} from "../roll-engine/index.ts"

export type CatalogSpellRollMode = "unclassified" | "link" | "roll"

export type CatalogSpellRollSource = Pick<
  CatalogSpell,
  "slug" | "name_en" | "name_ru" | "spell_level"
> & {
  roll_mode: CatalogSpellRollMode
  roll_recipe: unknown
}

export class CatalogSpellRollError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CatalogSpellRollError"
  }
}

function readSequences(value: unknown): RollSequenceDefinition[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CatalogSpellRollError("roll_recipe must be an object")
  }
  const sequences = (value as { sequences?: unknown }).sequences
  if (!Array.isArray(sequences) || sequences.length === 0) {
    throw new CatalogSpellRollError("roll_recipe.sequences must be a non-empty array")
  }
  return sequences as RollSequenceDefinition[]
}

/**
 * Converts hidden spell-catalog mechanics into the public Roll Engine contract.
 * Visible spell prose is never parsed and never contains this technical recipe.
 */
export function catalogSpellToRollRecipe(spell: CatalogSpellRollSource): RollRecipe | null {
  const common = {
    key: spell.slug,
    name: catalogSpellName(spell),
    sourceKind: "spell",
    spellLevel: spell.spell_level,
  } as const

  if (spell.roll_mode === "unclassified") {
    if (spell.roll_recipe !== null && spell.roll_recipe !== undefined) {
      throw new CatalogSpellRollError("unclassified spell must not carry roll_recipe")
    }
    return null
  }

  if (spell.roll_mode === "link") {
    if (spell.roll_recipe !== null && spell.roll_recipe !== undefined) {
      throw new CatalogSpellRollError("link-only spell must not carry roll_recipe")
    }
    const recipe: RollRecipe = { ...common, interaction: "link" }
    validateRollRecipe(recipe)
    return recipe
  }

  if (spell.roll_mode !== "roll") {
    throw new CatalogSpellRollError(`unsupported roll_mode: ${String(spell.roll_mode)}`)
  }

  const recipe: RollRecipe = {
    ...common,
    interaction: "roll",
    sequences: readSequences(spell.roll_recipe),
  }
  validateRollRecipe(recipe)
  return recipe
}

export function isCatalogSpellRollReady(spell: Pick<CatalogSpellRollSource, "roll_mode">): boolean {
  return spell.roll_mode !== "unclassified"
}
