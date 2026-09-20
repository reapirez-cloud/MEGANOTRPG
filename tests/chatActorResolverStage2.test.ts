import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  CHAT_NARRATOR_SPEAKER_ID,
  chatDefaultSpeakerId,
  normalizeChatViewerRole,
  resolveChatSpeakerId,
} from "../src/ui-v1-isolated/chat-room/chatActorResolver.ts"

const shellPath = new URL("../src/ui-v1-isolated/chat-room/useChatRoomShell.ts", import.meta.url)
const speakersPath = new URL("../src/ui-v1-isolated/chat-room/useChatSpeakerOptions.ts", import.meta.url)
const composerPath = new URL("../src/ui-v1-isolated/chat-room/ChatComposer.tsx", import.meta.url)
const contractsPath = new URL("../src/ui-v1-isolated/chat-room/chatRoomContracts.ts", import.meta.url)
const migrationPath = new URL("../supabase/migrations/20260920145723_chat_actor_identity_owner_player_fix_stage2.sql", import.meta.url)

test("stage 2 keeps owner authority separate from ordinary player identity", () => {
  const william = "f6647875-166c-42fc-a997-0f35f3dd7a4e"

  assert.equal(normalizeChatViewerRole("player"), "player")
  assert.equal(normalizeChatViewerRole("gm"), "gm")
  assert.equal(
    chatDefaultSpeakerId({
      canManage: true,
      viewerRole: "player",
      viewerCharacterId: william,
    }),
    william,
  )
  assert.equal(
    chatDefaultSpeakerId({
      canManage: true,
      viewerRole: "gm",
      viewerCharacterId: null,
    }),
    CHAT_NARRATOR_SPEAKER_ID,
  )
})

test("stage 2 preserves explicit valid manager selection but heals stale speaker state", () => {
  const william = "character:william"
  const npc = "character:npc"

  assert.equal(
    resolveChatSpeakerId({
      storedId: CHAT_NARRATOR_SPEAKER_ID,
      defaultId: william,
      availableIds: [william, CHAT_NARRATOR_SPEAKER_ID, npc],
    }),
    CHAT_NARRATOR_SPEAKER_ID,
  )

  assert.equal(
    resolveChatSpeakerId({
      storedId: "deleted-character",
      defaultId: william,
      availableIds: [william, CHAT_NARRATOR_SPEAKER_ID, npc],
    }),
    william,
  )
})

test("stage 2 shell resolves campaign role separately from canManage", async () => {
  const [shell, contracts] = await Promise.all([
    readFile(shellPath, "utf8"),
    readFile(contractsPath, "utf8"),
  ])

  assert.match(shell, /from\("campaign_members"\)/)
  assert.match(shell, /select\("role, is_owner"\)/)
  assert.match(shell, /normalizeChatViewerRole\(membership\.role\)/)
  assert.match(shell, /viewerCharacterId: viewerContext\.viewer_character_id/)
  assert.match(shell, /resolveManagerCharacterId/)
  assert.doesNotMatch(shell, /resolveGmCharacterId/)
  assert.match(contracts, /role: ChatViewerRole/)
  assert.match(contracts, /isOwner: boolean/)
  assert.match(contracts, /playerCharacterId: string \| null/)
  assert.match(contracts, /meganotrpg:chat-speaker-v2:/)
})

test("stage 2 manager selector includes the room-scoped owned PC instead of forcing narrator", async () => {
  const [speakers, composer] = await Promise.all([
    readFile(speakersPath, "utf8"),
    readFile(composerPath, "utf8"),
  ])

  assert.match(speakers, /viewerRole === "player" && playerCharacterId/)
  assert.match(speakers, /\.eq\("assigned_user_id", userId\)/)
  assert.match(speakers, /\.eq\("character_type", "pc"\)/)
  assert.match(speakers, /chatDefaultSpeakerId/)
  assert.match(speakers, /resolveChatSpeakerId/)
  assert.match(composer, /viewerRole: model\.viewer\.role/)
  assert.match(composer, /playerCharacterId: model\.viewer\.playerCharacterId/)
})

test("stage 2 database contract does not erase player identity merely because the member is owner", async () => {
  const sql = await readFile(migrationPath, "utf8")

  assert.match(sql, /when cm\.role = 'gm' then null/)
  assert.doesNotMatch(sql, /cm\.is_owner = true or cm\.role = 'gm'/)
  assert.match(sql, /room_character\.assigned_user_id = p_user_id/)
  assert.match(sql, /active_character\.assigned_user_id = p_user_id/)
})
