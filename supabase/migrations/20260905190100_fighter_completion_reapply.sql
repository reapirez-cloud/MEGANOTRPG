begin;

-- Superseded before formal deployment by
-- 20260905200000_fighter_runtime_closure_v2.sql.
--
-- This draft contained malformed Battle Master option JSON. It was never
-- recorded in the production migration history. The closure migration fetches
-- the immutable original payload, verifies it, fixes the single malformed JSON
-- boundary in memory, and applies it atomically while preserving current cards.

select 1;

commit;
