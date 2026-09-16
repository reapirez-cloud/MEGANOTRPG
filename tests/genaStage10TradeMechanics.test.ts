import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { SupabaseTradeSessionClient } from "../src/gena-trade/supabase.ts"

const foundation = fs.readFileSync(
  "supabase/migrations/20260916100000_gena_stage10_trade_sessions.sql",
  "utf8",
)
const commit = fs.readFileSync(
  "supabase/migrations/20260916101500_cheburashka_stage10_atomic_trade_commit.sql",
  "utf8",
)
const acceptanceClosure = fs.readFileSync(
  "supabase/migrations/20260916102500_gena_stage10_acceptance_closure.sql",
  "utf8",
)
const authorityClosure = fs.readFileSync(
  "supabase/migrations/20260916103500_gena_stage10_room_authority_closure.sql",
  "utf8",
)
const tradeTypes = fs.readFileSync("src/gena-trade/types.ts", "utf8")
const tradeRuntime = fs.readFileSync("src/gena-trade/runtime.ts", "utf8")
const tradeRealtime = fs.readFileSync("src/gena-trade/realtime.ts", "utf8")

test("Stage 10 trade is a GENA session, not a Surface or second inventory owner", () => {
  assert.match(foundation, /create table if not exists public\.trade_sessions/)
  assert.match(foundation, /side_a_character_id/)
  assert.match(foundation, /side_b_character_id/)
  assert.match(foundation, /Trade requires at least one PC side/)
  assert.doesNotMatch(foundation, /surface_id.*trade/i)
  assert.doesNotMatch(foundation, /create table[^;]*(trade_inventory|trade_items_inventory)/i)
  assert.match(foundation, /GENA-owned two-character trade session state/)
  assert.match(commit, /Cheburashka owns the atomic physical exchange/)
})

test("Stage 10 visibility is explicit and supports item, container and assortment exposure", () => {
  assert.match(foundation, /visibility_kind in \('item','container','assortment'\)/)
  assert.match(foundation, /list_trade_visible_inventory_v1/)
  assert.match(foundation, /visible\.visibility_kind='container'/)
  assert.match(foundation, /list_trade_own_inventory_v1/)
  assert.match(authorityClosure, /can_read_chat_room\(s\.room_id,p_user_id\)/)
  assert.match(authorityClosure, /Trade PC side A cannot read this room/)
  assert.match(authorityClosure, /Trade PC side B cannot read this room/)
})

test("Stage 10 interest and discussion do not mutate the offer revision", () => {
  const interestStart = foundation.indexOf("create or replace function public.set_trade_interest_v1")
  const interestEnd = foundation.indexOf("create or replace function public.set_trade_offer_line_v1")
  const interestFn = foundation.slice(interestStart, interestEnd)
  assert.doesNotMatch(interestFn, /trade_bump_revision_v1/)
  assert.match(interestFn, /trade_item_visible_to_side_v1/)

  const messageStart = foundation.indexOf("create or replace function public.post_trade_message_v1")
  const messageEnd = foundation.indexOf("create or replace function public.cancel_trade_v1")
  const messageFn = foundation.slice(messageStart, messageEnd)
  assert.doesNotMatch(messageFn, /trade_bump_revision_v1/)
  assert.match(messageFn, /trade_messages/)
})

test("Stage 10 material offer mutation advances revision and clears both acceptances", () => {
  const bumpStart = foundation.indexOf("create or replace function private.trade_bump_revision_v1")
  const bumpEnd = foundation.indexOf(
    "revoke execute on function private.trade_bump_revision_v1",
    bumpStart,
  )
  assert.notEqual(bumpStart, -1)
  assert.notEqual(bumpEnd, -1)
  const bumpFn = foundation.slice(bumpStart, bumpEnd)

  assert.match(bumpFn, /revision=s\.revision\+1/)
  assert.match(bumpFn, /accepted_a_revision=null/)
  assert.match(bumpFn, /accepted_b_revision=null/)
  assert.match(foundation, /trade\.revision_stale/)
  assert.match(foundation, /trade\.offer_subtree_overlap/)
  assert.match(foundation, /cheburashka_trade_item_fingerprint_v1/)
})

test("Stage 10 offer references do not reserve or own the physical item", () => {
  assert.match(commit, /drop constraint if exists trade_offer_lines_item_id_fkey/)
  assert.match(commit, /An offer references an item but must not reserve it/)
  assert.match(foundation, /Offer references canonical Cheburashka items\/quantities/)
})

test("Stage 10 commit is one atomic Cheburashka batch after same-revision A and B acceptance", () => {
  assert.match(commit, /cheburashka_commit_trade_exchange_v1/)
  assert.match(commit, /'inventory:'\|\|p_side_a_character_id::text/)
  assert.match(commit, /'inventory:'\|\|p_side_b_character_id::text/)
  assert.match(commit, /pg_advisory_xact_lock/)
  assert.match(commit, /for update/)
  assert.match(commit, /cheburashka_validate_trade_exchange_v1/)
  assert.match(commit, /trade\.offer_item_moved/)
  assert.match(commit, /trade\.offer_item_stale/)
  assert.match(commit, /trade\.offer_item_changed/)
  assert.match(commit, /state='committed'/)
  assert.match(
    acceptanceClosure,
    /v_both_accepted := coalesce\([\s\S]*accepted_a_revision=v_session\.revision[\s\S]*accepted_b_revision=v_session\.revision[\s\S]*false/,
  )
})

test("Stage 10 stale external item change invalidates the revision instead of partially committing", () => {
  assert.match(commit, /offer\.invalidated/)
  assert.match(commit, /trade_bump_revision_v1\(p_session_id,v_error\)/)
  assert.match(foundation, /accepted_a_revision=null/)
  assert.match(foundation, /accepted_b_revision=null/)
  assert.match(foundation, /last_failure_code=p_failure_code/)
})

test("Stage 10 whole containers preserve subtree identity and partial stacks split quantity", () => {
  assert.match(commit, /with recursive subtree as/)
  assert.match(commit, /where i\.id=any\(v_subtree_ids\)/)
  assert.match(commit, /'wholeInstance',true/)
  assert.match(commit, /set quantity=i\.quantity-v_quantity/)
  assert.match(commit, /'wholeInstance',false/)
})

test("Stage 10 keeps physical currency in ordinary inventory transfer semantics", () => {
  assert.doesNotMatch(foundation + commit, /wallet|balance|currency_ledger|gold_balance/i)
  assert.match(commit, /character_inventory_items/)
})

test("Stage 10 history remains inspectable after close", () => {
  assert.match(foundation, /create table if not exists public\.trade_events/)
  assert.match(foundation, /create table if not exists public\.trade_messages/)
  assert.match(foundation, /list_trade_history_v1/)
  assert.match(foundation, /list_trade_thread_v1/)
  assert.match(foundation, /state in \('open','committed','cancelled'\)/)
})

test("Stage 10 exposes a UI-agnostic typed connection seam", () => {
  for (const method of [
    "listForRoom",
    "get",
    "listOwnInventory",
    "listVisibleInventory",
    "listOffer",
    "listInterest",
    "listThread",
    "listHistory",
    "create",
    "setVisibility",
    "setInterest",
    "setOfferLine",
    "postMessage",
    "accept",
    "cancel",
  ]) {
    assert.match(tradeTypes, new RegExp(`\\b${method}\\b`))
  }
  assert.match(tradeRuntime, /export const tradeSession = new SupabaseTradeSessionClient/)
  assert.doesNotMatch(tradeRuntime + tradeTypes, /React|tsx|SnakeTrigger|chat component/i)
})

test("Stage 10 realtime is invalidation only", () => {
  assert.match(tradeRealtime, /Realtime never accepts an offer and never decides settlement/)
  for (const table of [
    "trade_sessions",
    "trade_offer_lines",
    "trade_visible_items",
    "trade_interest_marks",
    "trade_messages",
  ]) {
    assert.match(tradeRealtime, new RegExp(table))
  }
})

test("Stage 10 Supabase adapter maps future UI operations to stable RPCs", async () => {
  const calls: Array<{ rpc: string; args: Record<string, unknown> }> = []
  const fake = {
    rpc: async (rpc: string, args: Record<string, unknown>) => {
      calls.push({ rpc, args })
      if (rpc === "list_trade_sessions_for_room_v1") {
        return {
          data: [{
            session: {
              id: "trade-1",
              roomId: "room-1",
              sideACharacterId: "a",
              sideBCharacterId: "b",
              state: "open",
              revision: 3,
              acceptedARevision: null,
              acceptedBRevision: null,
              lastFailureCode: null,
              createdAt: "now",
              committedAt: null,
              cancelledAt: null,
            },
          }],
          error: null,
        }
      }
      return { data: { sessionId: "trade-1", revision: 3 }, error: null }
    },
  }

  const client = new SupabaseTradeSessionClient(fake as never)
  const sessions = await client.listForRoom("room-1")
  assert.equal(sessions[0]?.id, "trade-1")
  assert.equal(sessions[0]?.revision, 3)

  await client.setOfferLine({
    sessionId: "trade-1",
    ownerCharacterId: "a",
    itemId: "item-1",
    quantity: 2,
    expectedSessionRevision: 3,
    expectedItemVersion: 9,
    commandId: "cmd-1",
  })
  await client.accept({
    sessionId: "trade-1",
    actorCharacterId: "a",
    expectedRevision: 3,
    commandId: "cmd-2",
  })

  assert.equal(calls[1]?.rpc, "set_trade_offer_line_v1")
  assert.equal(calls[1]?.args.p_expected_session_revision, 3)
  assert.equal(calls[2]?.rpc, "accept_trade_v1")
  assert.equal(calls[2]?.args.p_expected_revision, 3)
})
