import { useMemo, useState } from "react"

import type {
  AbilityKey,
  ResolvedCharacterContract,
} from "../../character-engine/index.ts"
import type {
  CharacterSheet,
  CharacterSpell,
  CharacterSpellOption,
} from "../../types/characterSheet.ts"
import CharacterDetailSheet from "./CharacterDetailSheet.tsx"
import CharacterSectionState from "./CharacterSectionState.tsx"
import { SpellMiniIconRow } from "./SpellMiniIcon.tsx"
import { buildSpellMiniIcons } from "./spellMiniIcons.ts"
import { buildSpellbookRenderModel, type SpellbookMode } from "./spellbookRender.ts"
import "./CharacterSpellbookStage2.css"
import "./CharacterSpellbookStage3.css"
import "./CharacterSpellbookStage4.css"
import "./CharacterSpellbookStage5.css"
import "./CharacterSpellbookStage7.css"
