import type { SupabaseClient } from "@supabase/supabase-js"
import type { InventoryItem } from "../types/characterSheet.ts"
import type {
  TradeHistoryEvent,
  TradeInterestMark,
  TradeMutationResult,
  TradeOfferEntry,
  TradeSessionClient,
  TradeSessionSnapshot,
  TradeThreadMessage,
  TradeVisibleInventoryEntry,
  TradeVisibilityKind,
} from "./types.ts"

function fail(error: { message?: string } | null, fallback: string): never {
  throw new Error(error?.message || fallback)
}

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function sessionFromRow(row: Record<string, unknown>): TradeSessionSnapshot {
  return {
    id: String(row.id || ""),
    campaignId: String(row.campaignId ?? row.campaign_id ?? ""),
    roomId: String(row.roomId ?? row.room_id ?? ""),
    sideACharacterId: String(row.sideACharacterId ?? row.side_a_character_id ?? ""),
    sideBCharacterId: String(row.sideBCharacterId ?? row.side_b_character_id ?? ""),
    state: String(row.state || "open") as TradeSessionSnapshot["state"],
    revision: num(row.revision, 1),
    acceptedARevision: row.acceptedARevision == null && row.accepted_a_revision == null
      ? null
      : num(row.acceptedARevision ?? row.accepted_a_revision),
    acceptedBRevision: row.acceptedBRevision == null && row.accepted_b_revision == null
      ? null
      : num(row.acceptedBRevision ?? row.accepted_b_revision),
    lastFailureCode: (row.lastFailureCode ?? row.last_failure_code ?? null) as string | null,
    canActA: row.canActA === true,
    canActB: row.canActB === true,
    createdAt: String(row.createdAt ?? row.created_at ?? ""),
    committedAt: (row.committedAt ?? row.committed_at ?? null) as string | null,
    cancelledAt: (row.cancelledAt ?? row.cancelled_at ?? null) as string | null,
  }
}

export class SupabaseTradeSessionClient implements TradeSessionClient {
  constructor(private readonly client: SupabaseClient) {}

  async listForRoom(roomId: string): Promise<TradeSessionSnapshot[]> {
    const { data, error } = await this.client.rpc("list_trade_sessions_for_room_v1", {
      p_room_id: roomId,
    })
    if (error) fail(error, "Could not list trade sessions")
    return (data || []).map((row: { session: Record<string, unknown> }) =>
      sessionFromRow(row.session)
    )
  }

  async get(sessionId: string): Promise<TradeSessionSnapshot | null> {
    const { data, error } = await this.client.rpc("get_trade_session_v1", {
      p_session_id: sessionId,
    })
    if (error) fail(error, "Could not load trade session")
    if (!data) return null
    return sessionFromRow(data as Record<string, unknown>)
  }

  async listOwnInventory(sessionId: string, sideCharacterId: string): Promise<InventoryItem[]> {
    const { data, error } = await this.client.rpc("list_trade_own_inventory_v1", {
      p_session_id: sessionId,
      p_side_character_id: sideCharacterId,
    })
    if (error) fail(error, "Could not load own trade inventory")
    return (data || []).map((row: { item: InventoryItem }) => row.item)
  }

  async listVisibleInventory(
    sessionId: string,
    viewerCharacterId: string,
  ): Promise<TradeVisibleInventoryEntry[]> {
    const { data, error } = await this.client.rpc("list_trade_visible_inventory_v1", {
      p_session_id: sessionId,
      p_viewer_character_id: viewerCharacterId,
    })
    if (error) fail(error, "Could not load trade-visible inventory")
    return (data || []).map((row: Record<string, unknown>) => ({
      item: row.item as InventoryItem,
      inventoryProfile: row.inventory_profile ?? null,
      visibilityKind: String(row.visibility_kind) as TradeVisibilityKind,
      visibilityGroup: row.visibility_group == null ? null : String(row.visibility_group),
      sourceItemId: String(row.source_item_id || ""),
    }))
  }

  async listOffer(sessionId: string): Promise<TradeOfferEntry[]> {
    const { data, error } = await this.client.rpc("list_trade_offer_v1", {
      p_session_id: sessionId,
    })
    if (error) fail(error, "Could not load trade offer")
    return (data || []).map((row: Record<string, unknown>) => ({
      ownerCharacterId: String(row.owner_character_id || ""),
      itemId: String(row.item_id || ""),
      quantity: num(row.quantity),
      offeredItemVersion: num(row.offered_item_version),
      currentItem: (row.current_item as InventoryItem | null) ?? null,
      inventoryProfile: row.inventory_profile ?? null,
      stale: row.stale === true,
    }))
  }

  async listInterest(sessionId: string): Promise<TradeInterestMark[]> {
    const { data, error } = await this.client.rpc("list_trade_interest_v1", {
      p_session_id: sessionId,
    })
    if (error) fail(error, "Could not load trade interest markers")
    return (data || []).map((row: Record<string, unknown>) => ({
      interestedCharacterId: String(row.interested_character_id || ""),
      itemId: String(row.item_id || ""),
      createdAt: String(row.created_at || ""),
    }))
  }

  async listThread(sessionId: string): Promise<TradeThreadMessage[]> {
    const { data, error } = await this.client.rpc("list_trade_thread_v1", {
      p_session_id: sessionId,
    })
    if (error) fail(error, "Could not load trade discussion")
    return (data || []).map((row: Record<string, unknown>) => ({
      id: String(row.id || ""),
      actorCharacterId: String(row.actor_character_id || ""),
      body: String(row.body || ""),
      createdAt: String(row.created_at || ""),
    }))
  }

  async listHistory(sessionId: string): Promise<TradeHistoryEvent[]> {
    const { data, error } = await this.client.rpc("list_trade_history_v1", {
      p_session_id: sessionId,
    })
    if (error) fail(error, "Could not load trade history")
    return (data || []).map((row: Record<string, unknown>) => ({
      id: String(row.id || ""),
      eventType: String(row.event_type || ""),
      revision: num(row.revision),
      actorCharacterId: row.actor_character_id == null ? null : String(row.actor_character_id),
      payload: (row.payload as Record<string, unknown>) || {},
      createdAt: String(row.created_at || ""),
    }))
  }

  private async mutate(
    rpc: string,
    args: Record<string, unknown>,
    fallback: string,
  ): Promise<TradeMutationResult> {
    const { data, error } = await this.client.rpc(rpc, args)
    if (error) fail(error, fallback)
    return (data || {}) as TradeMutationResult
  }

  create(input: {
    roomId: string
    sideACharacterId: string
    sideBCharacterId: string
    commandId: string
  }) {
    return this.mutate("create_trade_session_v1", {
      p_room_id: input.roomId,
      p_side_a_character_id: input.sideACharacterId,
      p_side_b_character_id: input.sideBCharacterId,
      p_command_id: input.commandId,
    }, "Could not create trade session")
  }

  setVisibility(input: {
    sessionId: string
    ownerCharacterId: string
    itemId: string
    visible: boolean
    visibilityKind?: TradeVisibilityKind
    visibilityGroup?: string | null
    commandId: string
  }) {
    return this.mutate("set_trade_visibility_v1", {
      p_session_id: input.sessionId,
      p_owner_character_id: input.ownerCharacterId,
      p_item_id: input.itemId,
      p_visible: input.visible,
      p_visibility_kind: input.visibilityKind || "item",
      p_visibility_group: input.visibilityGroup ?? null,
      p_command_id: input.commandId,
    }, "Could not change trade visibility")
  }

  setInterest(input: {
    sessionId: string
    interestedCharacterId: string
    itemId: string
    interested: boolean
    commandId: string
  }) {
    return this.mutate("set_trade_interest_v1", {
      p_session_id: input.sessionId,
      p_interested_character_id: input.interestedCharacterId,
      p_item_id: input.itemId,
      p_interested: input.interested,
      p_command_id: input.commandId,
    }, "Could not change trade interest")
  }

  setOfferLine(input: {
    sessionId: string
    ownerCharacterId: string
    itemId: string
    quantity: number
    expectedSessionRevision: number
    expectedItemVersion: number
    commandId: string
  }) {
    return this.mutate("set_trade_offer_line_v1", {
      p_session_id: input.sessionId,
      p_owner_character_id: input.ownerCharacterId,
      p_item_id: input.itemId,
      p_quantity: input.quantity,
      p_expected_session_revision: input.expectedSessionRevision,
      p_expected_item_version: input.expectedItemVersion,
      p_command_id: input.commandId,
    }, "Could not change trade offer")
  }

  postMessage(input: {
    sessionId: string
    actorCharacterId: string
    body: string
    commandId: string
  }) {
    return this.mutate("post_trade_message_v1", {
      p_session_id: input.sessionId,
      p_actor_character_id: input.actorCharacterId,
      p_body: input.body,
      p_command_id: input.commandId,
    }, "Could not post trade message")
  }

  accept(input: {
    sessionId: string
    actorCharacterId: string
    expectedRevision: number
    commandId: string
  }) {
    return this.mutate("accept_trade_v1", {
      p_session_id: input.sessionId,
      p_actor_character_id: input.actorCharacterId,
      p_expected_revision: input.expectedRevision,
      p_command_id: input.commandId,
    }, "Could not accept trade")
  }

  cancel(input: {
    sessionId: string
    actorCharacterId: string
    expectedRevision: number
    commandId: string
  }) {
    return this.mutate("cancel_trade_v1", {
      p_session_id: input.sessionId,
      p_actor_character_id: input.actorCharacterId,
      p_expected_revision: input.expectedRevision,
      p_command_id: input.commandId,
    }, "Could not cancel trade")
  }
}
