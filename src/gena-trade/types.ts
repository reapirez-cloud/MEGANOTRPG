import type { InventoryItem } from "../types/characterSheet.ts"

export type TradeState = "open" | "committed" | "cancelled"
export type TradeVisibilityKind = "item" | "container" | "assortment"

export type TradeSessionSnapshot = {
  id: string
  campaignId: string
  roomId: string
  sideACharacterId: string
  sideBCharacterId: string
  state: TradeState
  revision: number
  acceptedARevision: number | null
  acceptedBRevision: number | null
  lastFailureCode: string | null
  canActA: boolean
  canActB: boolean
  createdAt: string
  committedAt: string | null
  cancelledAt: string | null
}

export type TradeVisibleInventoryEntry = {
  item: InventoryItem
  inventoryProfile: unknown
  visibilityKind: TradeVisibilityKind
  visibilityGroup: string | null
  sourceItemId: string
}

export type TradeOfferEntry = {
  ownerCharacterId: string
  itemId: string
  quantity: number
  offeredItemVersion: number
  currentItem: InventoryItem | null
  inventoryProfile: unknown
  stale: boolean
}

export type TradeInterestMark = {
  interestedCharacterId: string
  itemId: string
  createdAt: string
}

export type TradeThreadMessage = {
  id: string
  actorCharacterId: string
  body: string
  createdAt: string
}

export type TradeHistoryEvent = {
  id: string
  eventType: string
  revision: number
  actorCharacterId: string | null
  payload: Record<string, unknown>
  createdAt: string
}

export type TradeMutationResult = {
  sessionId: string
  state?: TradeState
  revision?: number
  committed?: boolean
  invalidated?: boolean
  failureCode?: string | null
  [key: string]: unknown
}

export type TradeInvalidation =
  | { kind: "session"; sessionId: string }
  | { kind: "offer"; sessionId: string }
  | { kind: "visibility"; sessionId: string }
  | { kind: "interest"; sessionId: string }
  | { kind: "thread"; sessionId: string }

export interface TradeSessionClient {
  listForRoom(roomId: string): Promise<TradeSessionSnapshot[]>
  get(sessionId: string): Promise<TradeSessionSnapshot | null>
  listOwnInventory(sessionId: string, sideCharacterId: string): Promise<InventoryItem[]>
  listVisibleInventory(sessionId: string, viewerCharacterId: string): Promise<TradeVisibleInventoryEntry[]>
  listOffer(sessionId: string): Promise<TradeOfferEntry[]>
  listInterest(sessionId: string): Promise<TradeInterestMark[]>
  listThread(sessionId: string): Promise<TradeThreadMessage[]>
  listHistory(sessionId: string): Promise<TradeHistoryEvent[]>

  create(input: {
    roomId: string
    sideACharacterId: string
    sideBCharacterId: string
    commandId: string
  }): Promise<TradeMutationResult>

  setVisibility(input: {
    sessionId: string
    ownerCharacterId: string
    itemId: string
    visible: boolean
    visibilityKind?: TradeVisibilityKind
    visibilityGroup?: string | null
    commandId: string
  }): Promise<TradeMutationResult>

  setInterest(input: {
    sessionId: string
    interestedCharacterId: string
    itemId: string
    interested: boolean
    commandId: string
  }): Promise<TradeMutationResult>

  setOfferLine(input: {
    sessionId: string
    ownerCharacterId: string
    itemId: string
    quantity: number
    expectedSessionRevision: number
    expectedItemVersion: number
    commandId: string
  }): Promise<TradeMutationResult>

  postMessage(input: {
    sessionId: string
    actorCharacterId: string
    body: string
    commandId: string
  }): Promise<TradeMutationResult>

  accept(input: {
    sessionId: string
    actorCharacterId: string
    expectedRevision: number
    commandId: string
  }): Promise<TradeMutationResult>

  cancel(input: {
    sessionId: string
    actorCharacterId: string
    expectedRevision: number
    commandId: string
  }): Promise<TradeMutationResult>
}
