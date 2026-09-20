drop trigger if exists campaign_members_validate_active_character
  on public.campaign_members;

drop function if exists public.validate_active_character();
