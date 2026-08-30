import { characterResolutionBus } from "../engine-runtime/characterResolutionBus.ts"
import { supabase } from "../lib/supabase.ts"
import { CheburashkaEngine } from "./engine.ts"
import { SupabaseCheburashkaStorage } from "./supabase.ts"
import { subscribeCheburashkaCharacterChanges } from "./realtime.ts"

export const cheburashka = new CheburashkaEngine(
  new SupabaseCheburashkaStorage(supabase),
  { resolutionRequester: characterResolutionBus },
)

export function watchCheburashkaCharacter(characterId: string): () => void {
  return subscribeCheburashkaCharacterChanges(supabase, characterResolutionBus, characterId)
}
