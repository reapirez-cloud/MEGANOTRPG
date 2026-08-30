import { characterResolutionBus } from "../engine-runtime/characterResolutionBus.ts"
import { supabase } from "../lib/supabase.ts"
import { ShapoklyakEngine } from "./engine.ts"
import { SupabaseShapoklyakStorage } from "./supabase.ts"

export const shapoklyak = new ShapoklyakEngine(
  new SupabaseShapoklyakStorage(supabase),
  { resolutionRequester: characterResolutionBus },
)

