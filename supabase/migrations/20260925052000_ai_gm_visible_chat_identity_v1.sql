-- AI GM visible identity bridge.
-- Keep manager user_id/client_id for authority/audit, while publishing the real
-- NPC presentation. Client presentation uses turn_component='ai_gm_output'
-- to keep every AI-authored line on the incoming side.

create or replace function public.publish_ai_gm_turn_message_v1(
  p_job_id uuid,
  p_sequence smallint,
  p_kind text,
  p_npc_character_id uuid,
  p_body text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.agent_jobs%rowtype;
  v_room public.chat_rooms%rowtype;
  v_manager_user_id uuid;
  v_source_character_id uuid;
  v_source_location_id uuid;
  v_npc_location_id uuid;
  v_kind text := lower(trim(coalesce(p_kind,'')));
  v_body text := btrim(coalesce(p_body,''));
  v_expected_character_id uuid;
  v_author_name text := 'Рассказчик';
  v_author_avatar_url text := null;
  v_existing public.chat_messages%rowtype;
  v_message_id bigint;
begin
  if p_job_id is null then raise exception 'ai_gm_job_required'; end if;
  if p_sequence is null or p_sequence < 1 or p_sequence > 12 then
    raise exception 'ai_gm_output_sequence_invalid';
  end if;
  if v_kind not in ('narration','npc_dialogue') then
    raise exception 'ai_gm_output_kind_invalid';
  end if;
  if length(v_body) < 1 or length(v_body) > 4000 then
    raise exception 'ai_gm_output_body_invalid';
  end if;
  if v_kind='narration' and p_npc_character_id is not null then
    raise exception 'ai_gm_narration_must_not_have_npc';
  end if;
  if v_kind='npc_dialogue' and p_npc_character_id is null then
    raise exception 'ai_gm_npc_dialogue_requires_npc';
  end if;

  select * into v_job
  from public.agent_jobs
  where id=p_job_id
    and job_type='conversation_turn'
    and input->>'surface'='game_chat_v1'
  for update;

  if v_job.id is null then raise exception 'ai_gm_turn_not_found'; end if;
  if v_job.status <> 'running' then raise exception 'ai_gm_turn_not_running'; end if;

  select * into v_room
  from public.chat_rooms
  where id=nullif(v_job.input->>'room_id','')::uuid
    and campaign_id=v_job.campaign_id;

  v_manager_user_id := nullif(v_job.input->>'manager_user_id','')::uuid;
  v_source_character_id := nullif(v_job.input->>'source_character_id','')::uuid;

  if v_room.id is null or v_manager_user_id is null or v_source_character_id is null then
    raise exception 'ai_gm_turn_identity_missing';
  end if;

  if v_room.category <> 'game'
     or v_room.room_state <> 'open'
     or v_room.is_read_only
     or v_room.scene_state <> 'active'
     or not exists (
       select 1
       from public.campaign_members cm
       where cm.campaign_id=v_job.campaign_id
         and cm.user_id=v_manager_user_id
         and (cm.is_owner=true or cm.role='gm')
     )
  then
    raise exception 'ai_gm_turn_manager_or_room_invalid';
  end if;

  v_expected_character_id := case
    when v_kind='npc_dialogue' then p_npc_character_id
    else null
  end;

  select * into v_existing
  from public.chat_messages m
  where m.turn_command_id=p_job_id
    and m.turn_component='ai_gm_output'
    and m.turn_order=p_sequence
  limit 1
  for update;

  if v_existing.id is not null then
    if v_existing.character_id is distinct from v_expected_character_id
       or v_existing.body is distinct from v_body
    then
      raise exception 'ai_gm_output_sequence_conflict';
    end if;
    return v_existing.id;
  end if;

  if v_kind='npc_dialogue' then
    select ws.location_id into v_source_location_id
    from public.character_world_state ws
    where ws.campaign_id=v_job.campaign_id
      and ws.character_id=v_source_character_id;

    v_source_location_id := coalesce(v_source_location_id, v_room.location_id);
    if v_source_location_id is null then
      raise exception 'ai_gm_source_location_unknown';
    end if;

    select ws.location_id,
           coalesce(nullif(btrim(c.name),''),'NPC'),
           c.avatar_url
      into v_npc_location_id,v_author_name,v_author_avatar_url
    from public.character_world_state ws
    join public.characters c
      on c.id=ws.character_id
     and c.campaign_id=ws.campaign_id
    where ws.campaign_id=v_job.campaign_id
      and ws.character_id=p_npc_character_id
      and c.character_type='npc'
      and c.life_state='alive'
      and c.publication_state='campaign';

    if v_npc_location_id is null or v_npc_location_id <> v_source_location_id then
      raise exception 'ai_gm_npc_not_present_with_source_character';
    end if;
  end if;

  perform set_config('meganot.ai_gm_runtime','on',true);

  insert into public.chat_messages(
    room_id,client_id,user_id,character_id,author_name,author_avatar_url,body,
    turn_command_id,turn_component,turn_order
  )
  values(
    v_room.id,v_manager_user_id,v_manager_user_id,v_expected_character_id,
    v_author_name,v_author_avatar_url,
    v_body,p_job_id,'ai_gm_output',p_sequence
  )
  returning id into v_message_id;

  return v_message_id;
end;
$function$;

revoke all on function public.publish_ai_gm_turn_message_v1(uuid,smallint,text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.publish_ai_gm_turn_message_v1(uuid,smallint,text,uuid,text)
  to service_role;

update public.chat_messages m
set author_name = coalesce(nullif(btrim(c.name),''),'NPC'),
    author_avatar_url = c.avatar_url
from public.characters c
where m.turn_component='ai_gm_output'
  and m.character_id is not null
  and c.id=m.character_id
  and (
    m.author_name is distinct from coalesce(nullif(btrim(c.name),''),'NPC')
    or m.author_avatar_url is distinct from c.avatar_url
  );
