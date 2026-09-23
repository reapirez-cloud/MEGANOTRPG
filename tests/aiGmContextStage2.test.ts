import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

test("AI GM Stage 2 reads the last 50 canonical chat messages from every author", () => {
  const context = read(
    "supabase/functions/voss-agent/game-chat-context.ts",
  )

  assert.match(context, /const CHAT_CONTEXT_LIMIT = 50/)
  assert.match(context, /from\("chat_messages"\)/)
  assert.match(context, /\.lte\("id", sourceMessageId\)/)
  assert.match(context, /\.limit\(CHAT_CONTEXT_LIMIT\)/)
  assert.doesNotMatch(
    context,
    /from\("chat_messages"\)[\s\S]{0,500}\.eq\("user_id"/,
  )
  assert.match(context, /recent_chat_messages_all_authors/)
  assert.match(context, /campaign_day/)
  assert.match(context, /day_period/)
  assert.match(context, /game_age_days/)
})

test("AI GM Stage 2 keeps split-party location state explicit", () => {
  const context = read(
    "supabase/functions/voss-agent/game-chat-context.ts",
  )
  const runtime = read(
    "supabase/functions/voss-agent/game-chat-runtime.ts",
  )

  assert.match(context, /from\("character_world_state"\)/)
  assert.match(context, /same_location_as_source/)
  assert.match(context, /characters_physically_present_with_source/)
  assert.match(context, /player_locations_are_independent: true/)
  assert.match(context, /do_not_merge_split_party_scenes: true/)
  assert.match(runtime, /Если PC находятся в разных location_id/)
  assert.match(runtime, /Не склеивай разделившуюся группу в одну сцену/)
})

test("AI GM Stage 2 context contains canonical campaign state instead of chat-only memory", () => {
  const context = read(
    "supabase/functions/voss-agent/game-chat-context.ts",
  )

  assert.match(context, /from\("character_sheets"\)/)
  assert.match(context, /from\("npc_profiles"\)/)
  assert.match(context, /from\("character_relationships"\)/)
  assert.match(context, /from\("character_assets"\)/)
  assert.match(context, /from\("faction_memberships"\)/)
  assert.match(context, /from\("character_faction_reputations"\)/)
  assert.match(context, /loadActiveQuestContext/)
  assert.match(context, /from\("campaign_memory_facts"\)/)
  assert.match(context, /from\("campaign_memory_summaries"\)/)
  assert.match(context, /relevant_long_term_memory/)
  assert.match(context, /active_quest_context/)
})

test("PC to PC conversation cannot make AI speak or decide for another PC", () => {
  const runtime = read(
    "supabase/functions/voss-agent/game-chat-runtime.ts",
  )

  for (const mode of [
    "gm_response",
    "environment",
    "npc_interjection",
    "none",
  ]) {
    assert.match(runtime, new RegExp('"' + mode + '"'))
  }

  assert.match(runtime, /Никогда не говори, не действуй, не решай и не выбирай за player character/)
  assert.match(runtime, /Если сообщение в основном обращено к другому PC/)
  assert.match(runtime, /mode: "none"/)
  assert.match(runtime, /completeWithoutChatMessage/)
  assert.match(runtime, /completedOutputs = 0/)
  assert.match(runtime, /completed_outputs: completedOutputs/)
})

test("NPC interjection is canonical, service-only and physically co-located", () => {
  const migration = read(
    "supabase/migrations/20260923084500_ai_gm_coop_context_stage2_v1.sql",
  )
  const runtime = read(
    "supabase/functions/voss-agent/game-chat-runtime.ts",
  )

  assert.match(migration, /publish_ai_gm_npc_message_v2/)
  assert.match(migration, /character_type = 'npc'/)
  assert.match(migration, /life_state = 'alive'/)
  assert.match(migration, /publication_state = 'campaign'/)
  assert.match(migration, /v_npc_location_id <> v_source_location_id/)
  assert.match(migration, /new\.author_name := v_character\.name/)
  assert.match(migration, /new\.author_avatar_url := v_character\.avatar_url/)
  assert.match(
    migration,
    /revoke all[\s\S]*publish_ai_gm_npc_message_v2[\s\S]*from public, anon, authenticated/i,
  )
  assert.match(
    migration,
    /grant execute[\s\S]*publish_ai_gm_npc_message_v2[\s\S]*to service_role/i,
  )
  assert.match(runtime, /publish_ai_gm_npc_message_v2/)
  assert.match(runtime, /invalid_or_absent_npc_downgraded_to_environment/)
})

test("remaining cooperative routing debt stays explicit and removable", () => {
  const debt = read("src/ai/aiGmReadinessDebt.ts")

  assert.match(debt, /id: "coop-split-party-sequencing"/)
  assert.match(debt, /id: "coop-pc-dialogue-routing"/)
  assert.match(debt, /УДАЛИТЬ ПРИ РЕЙДИ/)
  assert.match(debt, /recipient_character_ids/)
})
