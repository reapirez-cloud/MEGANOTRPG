begin;

-- Superseded before formal deployment by
-- 20260905200000_fighter_runtime_closure_v2.sql.
--
-- The original draft bootstrapped an older Fighter pack over HTTP before its
-- malformed Battle Master choice JSON and Psi Warrior spell contract had been
-- diagnosed. It was never recorded in the production migration history.
-- Keeping this version as a no-op prevents a fresh migration chain from
-- executing the unsafe draft while preserving the migration filename/order.

select 1;

commit;
