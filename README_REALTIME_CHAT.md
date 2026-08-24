# MEGANOTRPG — Realtime Chat v1

This package connects the existing chat UI to the real Supabase project.

What is real now:
- rooms are loaded from Supabase;
- messages are loaded from Supabase;
- sending creates a real database row;
- Supabase Realtime pushes new messages into an open room;
- refresh keeps messages;
- different browsers/devices connected to the same hosted app will see the same data.

Development-only identity:
- until Telegram authentication is connected, the author name is stored in localStorage;
- change it from the "Вы: ..." chip on the Chats screen;
- this is intentionally temporary.

Security:
- RLS is enabled.
- For this development vertical slice, public users may read campaigns/rooms/messages and INSERT messages.
- They cannot update or delete messages.
- Before public Telegram rollout, replace these dev policies with membership + Telegram-authenticated policies.

Copy this package over the existing project. Do not delete unrelated files.
