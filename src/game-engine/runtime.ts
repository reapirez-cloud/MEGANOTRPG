import { shapoklyak } from "../entity-engine/runtime.ts"
import { cheburashka } from "../inventory-engine/runtime.ts"
import { larisa } from "../location-engine/runtime.ts"
import { supabase } from "../lib/supabase.ts"
import { tobik } from "../roll-engine/index.ts"
import { GenaEngine } from "./engine.ts"
import { SupabaseGenaSessionGateway } from "./supabase.ts"

/** In-process command router for explicit domain-engine contracts. */
export const gena = new GenaEngine({ cheburashka, shapoklyak, larisa, tobik })

/** Server-transaction gateway for chat/history commands. */
export const genaSession = new SupabaseGenaSessionGateway(supabase)
