begin;

-- Superseded before formal deployment by
-- 20260905200000_fighter_runtime_closure_v2.sql.
--
-- This draft represented Psi Warrior's free Telekinesis use as a class spell
-- paid from a psi resource, which violates the class-spell contract. It was
-- never recorded in the production migration history. The closure migration
-- keeps Telekinesis as a feature/action/resource mechanic instead.

select 1;

commit;
