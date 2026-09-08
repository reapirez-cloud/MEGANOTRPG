-- CLASS_MIGRATION_SCOPE: infrastructure
-- CLASS_INTEGRATION_STRICT: class:sorcerer
-- CLASS_WORK_STATUS: sorcerer:stage5=READY

begin;

drop trigger if exists aaaaaaaah_campaigns_ensure_sorcerer_metamagic_stage4_v1 on public.campaigns;

commit;
