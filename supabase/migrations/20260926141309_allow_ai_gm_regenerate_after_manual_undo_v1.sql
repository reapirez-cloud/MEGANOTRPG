-- Repair replay after manual AI-GM undo on databases where the earlier replay migration was already applied.
do $$
declare
  v_def text;
  v_old text := $old$
      if v_latest_job.id is null
         or v_latest_job.status not in ('failed','cancelled')
      then
        raise exception 'ai_gm_active_revision_not_found';
      end if;

      if exists(
        select 1
        from public.ai_gm_post_turn_commits c
        where c.parent_job_id=v_latest_job.id
          and c.state in ('queued','running','completed')
      ) then
        raise exception 'ai_gm_regenerate_has_committed_post_turn_world_changes';
      end if;
$old$;
  v_new text := $new$
      if v_latest_job.id is null
         or (
           v_latest.state<>'rolled_back'
           and v_latest_job.status not in ('failed','cancelled')
         )
      then
        raise exception 'ai_gm_active_revision_not_found';
      end if;

      if v_latest.state<>'rolled_back'
         and exists(
           select 1
           from public.ai_gm_post_turn_commits c
           where c.parent_job_id=v_latest_job.id
             and c.state in ('queued','running','completed')
         )
      then
        raise exception 'ai_gm_regenerate_has_committed_post_turn_world_changes';
      end if;
$new$;
begin
  select pg_get_functiondef(
    'private.reserve_ai_gm_revision_job_v1(uuid,uuid,bigint,text,text)'::regprocedure
  ) into v_def;

  if position(v_old in v_def)=0 then
    if position('v_latest.state<>''rolled_back''' in v_def)>0 then
      return;
    end if;
    raise exception 'reserve_ai_gm_revision_job_v1 patch anchor not found';
  end if;

  execute replace(v_def,v_old,v_new);
end
$$;
