# Chats catalog contract

Status: **FROZEN / Stage 8 complete**

This document defines the finished landing catalog for the Chats tab. It does **not** define the inner gameplay dialog.

## Product hierarchy

The landing page stays one catalog with this order:

1. **Текущая история**
2. **Флуд**
3. **Личные истории**
4. **События**
5. **Завершённые**

User-facing terminology is **Событие**. The database/runtime term `scene` may remain internal.

There is no manual **Новая история** action. Personal histories belong to PC lifecycle.

## Read-model ownership

`useRooms()` loads the server-filtered room RPC and exposes `buildChatCatalogModel(rooms)`.

The page must not reimplement classification/sorting rules.

Activity ordering uses:

1. `last_message_at`
2. `updated_at`
3. `created_at`

`Текущая история` is the most recently active accessible non-Flood gameplay room. Flood is never eligible.

Completed ordering uses character `died_at` for personal histories and room `closed_at` for events, with activity only as a fallback.

## Authority

Campaign membership keeps role and ownership independent:

```text
isGm = member.role === "gm"
isOwner = member.is_owner === true
canManage = isGm || isOwner
```

Owner/admin is not an exclusive third role. A `role="player", is_owner=true` member retains player identity while receiving manager controls.

The Chats catalog exposes the event `+` only through `canManage`.

## Visibility and writes

Room visibility is server-owned. UI filtering is not authorization.

Relevant server rules remain behind:

- `private.can_read_chat_room(...)`
- `private.can_write_chat_room(...)`
- `private.can_manage_campaign(...)`

The catalog RPC is executable by `authenticated`, not `anon`, and returns only rooms visible to the current user.

Hidden character/location data must not leak through catalog metadata.

## Personal-history lifecycle

Every PC owns at most one character room.

- PC creation -> personal history exists automatically.
- alive -> history is active and writable by its assigned player.
- dead -> same history becomes read-only and projects into **Завершённые**.
- revived -> same history returns to active.
- character histories cannot be manually closed through ordinary room-state controls.
- personal-history completion is determined by character `life_state`, not stale room closure metadata.

## Realtime

Catalog refresh transport covers:

- `chat_rooms`
- `chat_messages`
- `characters`
- `scene_participants`
- `character_world_state`
- `locations`

Realtime is refresh transport, not an authority source.

## Catalog interactions

Search and filters operate only on already-visible catalog data.

`Все (N)` expands inline. It does not create nested catalog pages.

Room taps use the shared catalog placeholder. They must not invoke the existing `ChatRoom` route until the separate dialog roadmap explicitly replaces that boundary.

Manager `+` opens only the event-creation placeholder. It does not create a personal history.

## Resilience

The catalog must preserve:

- geometry-matched skeleton loading;
- retryable initial errors;
- stale-data preservation on refresh errors;
- one campaign-empty state;
- resettable zero-result search;
- fallback media;
- `99+` unread capping;
- long-title clamping/wrapping;
- large-list containment;
- layouts down to 320 px;
- reduced-motion loading behavior.

## Change rule

Any future change that breaks one of these invariants is a product/architecture change, not a cleanup. Update this contract and the Stage 8 regression test deliberately rather than silently weakening either.
