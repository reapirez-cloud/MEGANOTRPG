-- AI GM Stage 12 correction: sequencing exists only inside an explicit shared chat scene.
-- Physical co-location alone MUST NOT serialize independent players.

create or replace function private.assign_ai_gm_scene_sequence_stage12_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_room_id uuid;
  v_source_character_id uuid;
  v_participant_count integer := 0;
  v_scene_key text;
  v_sequence bigint;
begin
  if new.job_type<>'conversation_turn'
     or new.input->>'surface'<>'game_chat_v1'
  then
    return new;
  end if;

  begin
    v_room_id := (new.input->>'room_id')::uuid;
    v_source_character_id := (new.input->>'source_character_id')::uuid;
  exception when others then
    return new;
  end;

  if not exists(
    select 1
    from public.chat_rooms r
    join public.scene_participants sp
      on sp.room_id=r.id
     and sp.character_id=v_source_character_id
    where r.id=v_room_id
      and r.campaign_id=new.campaign_id
      and r.room_type='scene'
      and r.scene_state='active'
      and r.room_state='open'
  ) then
    -- Independent/free-play path: no queue metadata at all.
    new.input := coalesce(new.input,'{}'::jsonb)
      - 'scene_key'
      - 'scene_sequence';
    return new;
  end if;

  select count(*)
    into v_participant_count
  from public.scene_participants sp
  join public.characters c
    on c.id=sp.character_id
   and c.campaign_id=new.campaign_id
  where sp.room_id=v_room_id
    and c.character_type='pc'
    and c.life_state='alive'
    and c.publication_state='campaign';

  if v_participant_count<2 then
    -- A scene with one PC is still free-play; nothing to serialize against.
    new.input := coalesce(new.input,'{}'::jsonb)
      - 'scene_key'
      - 'scene_sequence';
    return new;
  end if;

  v_scene_key := 'room:'||v_room_id::text;

  insert into private.ai_gm_scene_sequence_state(
    campaign_id,scene_key,next_sequence,updated_at
  )
  values(new.campaign_id,v_scene_key,2,now())
  on conflict(campaign_id,scene_key) do update set
    next_sequence=private.ai_gm_scene_sequence_state.next_sequence+1,
    updated_at=now()
  returning next_sequence-1 into v_sequence;

  new.input := coalesce(new.input,'{}'::jsonb)||jsonb_build_object(
    'scene_key',v_scene_key,
    'scene_sequence',v_sequence,
    'shared_scene_room_id',v_room_id,
    'shared_scene_participant_count',v_participant_count
  );

  return new;
end;
$$;

comment on function private.assign_ai_gm_scene_sequence_stage12_v1() is
  'Assigns ordered AI GM scene sequences only for explicit shared chat scenes with 2+ live PC scene_participants. Same physical location without shared scene membership remains concurrent free-play.';
