import { supabase } from "../lib/supabase.ts"
import { ChasovoyEngine } from "./engine.ts"
import { SupabaseChasovoyStorage } from "./supabase.ts"

export const chasovoy = new ChasovoyEngine(new SupabaseChasovoyStorage(supabase))
