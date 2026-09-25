-- Location media delivery v2.
-- Reuses existing location art on entry/request, publishes into the player's
-- character chat, and queues max-tier 150k-target renders for unseen locations.

alter table private.ai_gm_media_lifecycle
  add column if not exists source_room_id uuid null
    references public.chat_rooms(id) on delete set null,
  add column if not exists publication_key text null;

alter table private.ai_gm_media_lifecycle
  drop constraint if exists ai_gm_media_lifecycle_trigger_kind_check;
alter table private.ai_gm_media_lifecycle
  add constraint ai_gm_media_lifecycle_trigger_kind_check
  check (trigger_kind in (
    'npc_create','location_first_visit','location_entry','explicit_environment_request'
  ));

alter table private.ai_gm_media_publications
  add column if not exists publication_key text;

update private.ai_gm_media_publications
set publication_key='legacy'
where publication_key is null;

alter table private.ai_gm_media_publications
  alter column publication_key set default 'legacy',
  alter column publication_key set not null;

alter table private.ai_gm_media_publications
  drop constraint if exists ai_gm_media_publications_pkey;
alter table private.ai_gm_media_publications
  add constraint ai_gm_media_publications_pkey
  primary key(asset_id,room_id,publication_key);

create index if not exists ai_gm_media_publications_target_event_idx
  on private.ai_gm_media_publications(target_type,target_id,publication_key);
create index if not exists ai_gm_media_lifecycle_source_room_idx
  on private.ai_gm_media_lifecycle(source_room_id)
  where source_room_id is not null;

CREATE OR REPLACE FUNCTION private.publish_ai_gm_target_media_v1(p_target_type text, p_target_id uuid, p_asset_id uuid, p_source_character_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.publish_ai_gm_target_media_v2(
    p_target_type,p_target_id,p_asset_id,p_source_character_id,null,null
  );
$function$;

CREATE OR REPLACE FUNCTION private.publish_ai_gm_target_media_v2(p_target_type text, p_target_id uuid, p_asset_id uuid, p_source_character_id uuid DEFAULT NULL::uuid, p_source_room_id uuid DEFAULT NULL::uuid, p_publication_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_asset public.media_assets%rowtype;
  v_location_id uuid;
  v_campaign_id uuid;
  v_target_name text;
  v_visibility_mode text;
  v_manager_user_id uuid;
  v_room public.chat_rooms%rowtype;
  v_existing private.ai_gm_media_publications%rowtype;
  v_message_id bigint;
  v_messages jsonb := '[]'::jsonb;
  v_can_reveal boolean := false;
  v_room_ids uuid[] := '{}'::uuid[];
  v_room_id uuid;
  v_publication_key text;
begin
  select * into v_asset
  from public.media_assets a
  where a.id=p_asset_id
    and a.status='attached';

  if v_asset.id is null then return v_messages; end if;

  if p_target_type='location' then
    select l.campaign_id,l.id,l.name
      into v_campaign_id,v_location_id,v_target_name
    from public.locations l
    where l.id=p_target_id
      and l.campaign_id=v_asset.campaign_id
      and l.lifecycle_state='active';

    if v_location_id is null then return v_messages; end if;

    select exists(
      select 1
      from public.characters c
      join public.character_world_state ws
        on ws.character_id=c.id
       and ws.campaign_id=c.campaign_id
      where c.campaign_id=v_campaign_id
        and c.character_type='pc'
        and c.life_state='alive'
        and c.publication_state='campaign'
        and ws.location_id=v_location_id
        and (
          p_source_character_id is null
          or c.id=p_source_character_id
          or exists(
            select 1
            from public.character_location_discoveries d
            where d.character_id=c.id
              and d.location_id=v_location_id
          )
        )
    ) into v_can_reveal;
  elsif p_target_type='character' then
    select c.campaign_id,ws.location_id,c.name,c.visibility_mode
      into v_campaign_id,v_location_id,v_target_name,v_visibility_mode
    from public.characters c
    left join public.character_world_state ws
      on ws.character_id=c.id
     and ws.campaign_id=c.campaign_id
    where c.id=p_target_id
      and c.campaign_id=v_asset.campaign_id
      and c.character_type='npc'
      and c.publication_state='campaign'
      and c.life_state='alive';

    if v_location_id is null then return v_messages; end if;

    if v_visibility_mode='always' then
      select exists(
        select 1
        from public.characters pc
        join public.character_world_state pws
          on pws.character_id=pc.id
         and pws.campaign_id=pc.campaign_id
        where pc.campaign_id=v_campaign_id
          and pc.character_type='pc'
          and pc.life_state='alive'
          and pc.publication_state='campaign'
          and pws.location_id=v_location_id
      ) into v_can_reveal;
    else
      select exists(
        select 1
        from public.character_npc_discoveries d
        join public.characters pc
          on pc.id=d.character_id
         and pc.campaign_id=v_campaign_id
         and pc.character_type='pc'
         and pc.life_state='alive'
        join public.character_world_state pws
          on pws.character_id=pc.id
         and pws.campaign_id=pc.campaign_id
        where d.npc_character_id=p_target_id
          and pws.location_id=v_location_id
      ) into v_can_reveal;
    end if;
  else
    return v_messages;
  end if;

  if not v_can_reveal then return v_messages; end if;

  v_manager_user_id:=private.ai_gm_media_manager_v1(
    v_campaign_id,
    v_asset.created_by
  );
  if v_manager_user_id is null then return v_messages; end if;

  v_publication_key:=left(
    coalesce(
      nullif(trim(p_publication_key),''),
      'asset:'||p_asset_id::text
    ),
    220
  );

  if p_source_room_id is not null then
    select coalesce(array_agg(r.id order by r.created_at),'{}'::uuid[])
      into v_room_ids
    from public.chat_rooms r
    where r.id=p_source_room_id
      and r.campaign_id=v_campaign_id
      and r.category='game'
      and r.room_state='open'
      and r.is_read_only=false
      and (
        (
          r.room_type='character'
          and p_source_character_id is not null
          and r.character_id=p_source_character_id
        )
        or
        (
          r.room_type='scene'
          and r.scene_state='active'
          and r.location_id=v_location_id
        )
      );
  elsif p_target_type='location' and p_source_character_id is not null then
    select coalesce(array_agg(r.id order by r.created_at),'{}'::uuid[])
      into v_room_ids
    from public.chat_rooms r
    where r.campaign_id=v_campaign_id
      and r.category='game'
      and r.room_type='character'
      and r.character_id=p_source_character_id
      and r.room_state='open'
      and r.is_read_only=false;

    if coalesce(cardinality(v_room_ids),0)=0 then
      select coalesce(array_agg(r.id order by r.created_at),'{}'::uuid[])
        into v_room_ids
      from public.chat_rooms r
      where r.campaign_id=v_campaign_id
        and r.category='game'
        and r.room_type='scene'
        and r.scene_state='active'
        and r.room_state='open'
        and r.is_read_only=false
        and r.location_id=v_location_id;
    end if;
  else
    select coalesce(array_agg(r.id order by r.created_at),'{}'::uuid[])
      into v_room_ids
    from public.chat_rooms r
    where r.campaign_id=v_campaign_id
      and r.category='game'
      and r.room_type='scene'
      and r.scene_state='active'
      and r.room_state='open'
      and r.is_read_only=false
      and r.location_id=v_location_id;
  end if;

  foreach v_room_id in array v_room_ids
  loop
    select * into v_room
    from public.chat_rooms r
    where r.id=v_room_id;

    if v_room.id is null then continue; end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'ai-gm-media-publication:'||
        p_asset_id::text||':'||
        v_room.id::text||':'||
        v_publication_key,
        0
      )
    );

    select * into v_existing
    from private.ai_gm_media_publications p
    where p.asset_id=p_asset_id
      and p.room_id=v_room.id
      and p.publication_key=v_publication_key
    for update;

    if v_existing.message_id is not null then
      v_messages:=v_messages||jsonb_build_array(v_existing.message_id);
      continue;
    end if;

    perform set_config('meganot.ai_gm_runtime','on',true);

    insert into public.chat_messages(
      room_id,client_id,user_id,character_id,author_name,body,
      attachment_url,attachment_kind,event_payload
    )
    values(
      v_room.id,
      v_manager_user_id,
      v_manager_user_id,
      null,
      'Рассказчик',
      case
        when p_target_type='character' then 'Портрет: '||v_target_name
        else v_target_name
      end,
      v_asset.storage_path,
      'image',
      jsonb_build_object(
        'systemEvent','ai_gm_media',
        'runtimeStage',9,
        'assetId',p_asset_id,
        'targetType',p_target_type,
        'targetId',p_target_id,
        'publicationKey',v_publication_key
      )
    )
    returning id into v_message_id;

    insert into private.ai_gm_media_publications(
      asset_id,room_id,publication_key,target_type,target_id,message_id
    )
    values(
      p_asset_id,v_room.id,v_publication_key,
      p_target_type,p_target_id,v_message_id
    )
    on conflict(asset_id,room_id,publication_key) do update set
      message_id=coalesce(
        private.ai_gm_media_publications.message_id,
        excluded.message_id
      );

    v_messages:=v_messages||jsonb_build_array(v_message_id);
  end loop;

  return v_messages;
end;
$function$;

CREATE OR REPLACE FUNCTION private.publish_existing_ai_gm_target_media_v1(p_target_type text, p_target_id uuid, p_source_character_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.publish_existing_ai_gm_target_media_v2(
    p_target_type,p_target_id,p_source_character_id,null,null
  );
$function$;

CREATE OR REPLACE FUNCTION private.publish_existing_ai_gm_target_media_v2(p_target_type text, p_target_id uuid, p_source_character_id uuid DEFAULT NULL::uuid, p_source_room_id uuid DEFAULT NULL::uuid, p_publication_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_asset_id uuid;
begin
  select b.asset_id into v_asset_id
  from public.media_bindings b
  join public.media_assets a on a.id=b.asset_id
  where b.target_type=p_target_type
    and b.target_id=p_target_id
    and b.is_active=true
    and (
      (p_target_type='character' and b.target_field in ('avatar','avatar_url'))
      or
      (p_target_type='location' and b.target_field in ('image','image_url','hero','cover','panel'))
    )
    and a.status='attached'
  order by b.created_at desc
  limit 1;

  if v_asset_id is null then return '[]'::jsonb; end if;

  return private.publish_ai_gm_target_media_v2(
    p_target_type,
    p_target_id,
    v_asset_id,
    p_source_character_id,
    p_source_room_id,
    p_publication_key
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.queue_ai_gm_location_media_after_entry_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_type text;
  v_publication text;
  v_npc_id uuid;
  v_publication_key text;
begin
  if new.location_id is null then return new; end if;
  if tg_op='UPDATE' and old.location_id is not distinct from new.location_id then
    return new;
  end if;

  select c.character_type,c.publication_state
    into v_type,v_publication
  from public.characters c
  where c.id=new.character_id;

  if v_publication<>'campaign' then return new; end if;

  if v_type='npc' then
    perform private.publish_existing_ai_gm_target_media_v1(
      'character',new.character_id,null
    );
    return new;
  end if;

  if v_type<>'pc' then return new; end if;

  v_publication_key:=left(
    'location_entry:'||
    new.character_id::text||':'||
    new.location_id::text||':'||
    to_char(new.updated_at at time zone 'UTC','YYYYMMDDHH24MISSUS'),
    220
  );

  perform private.request_ai_gm_location_media_v2(
    new.location_id,
    new.character_id,
    null,
    'location_entry',
    v_publication_key
  );

  for v_npc_id in
    select c.id
    from public.characters c
    join public.character_world_state ws
      on ws.character_id=c.id
     and ws.campaign_id=c.campaign_id
    where c.campaign_id=new.campaign_id
      and c.character_type='npc'
      and c.publication_state='campaign'
      and c.life_state='alive'
      and ws.location_id=new.location_id
    order by c.id
  loop
    perform private.publish_existing_ai_gm_target_media_v1(
      'character',v_npc_id,new.character_id
    );
  end loop;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.queue_ai_gm_media_target_v1(p_target_type text, p_target_id uuid, p_trigger_kind text, p_source_character_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.queue_ai_gm_media_target_v2(
    p_target_type,p_target_id,p_trigger_kind,p_source_character_id,null,null
  );
$function$;

CREATE OR REPLACE FUNCTION private.queue_ai_gm_media_target_v2(p_target_type text, p_target_id uuid, p_trigger_kind text, p_source_character_id uuid DEFAULT NULL::uuid, p_source_room_id uuid DEFAULT NULL::uuid, p_publication_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_campaign_id uuid;
  v_preferred_user_id uuid;
  v_manager_user_id uuid;
  v_target_field text;
  v_purpose text;
  v_prompt text;
  v_existing_url text;
  v_job_id uuid;
  v_lifecycle private.ai_gm_media_lifecycle%rowtype;
  v_character public.characters%rowtype;
  v_profile public.npc_profiles%rowtype;
  v_location public.locations%rowtype;
begin
  if p_target_type not in ('character','location') then
    return null;
  end if;

  if p_trigger_kind not in (
    'npc_create',
    'location_first_visit',
    'location_entry',
    'explicit_environment_request'
  ) then
    return null;
  end if;

  if p_target_type='character' then
    select * into v_character
    from public.characters c
    where c.id=p_target_id
      and c.character_type='npc'
      and c.publication_state='campaign';

    if v_character.id is null then return null; end if;

    select * into v_profile
    from public.npc_profiles p
    where p.character_id=p_target_id;

    if v_profile.character_id is null then return null; end if;

    v_campaign_id:=v_character.campaign_id;
    v_preferred_user_id:=v_character.created_by;
    v_target_field:='avatar_url';
    v_purpose:='portrait';
    v_existing_url:=nullif(trim(coalesce(v_character.avatar_url,'')),'');
    v_prompt:=left(concat_ws(E'
',
      'MEGANOT grimdark fantasy character portrait. Preserve canonical appearance exactly and do not invent contradictory lore.',
      'NPC name: '||v_character.name,
      nullif('Species: '||coalesce(v_profile.species,''),'Species: '),
      nullif('Role: '||coalesce(v_profile.role,''),'Role: '),
      nullif('Occupation: '||coalesce(v_profile.occupation,''),'Occupation: '),
      nullif('Faction: '||coalesce(v_profile.faction,''),'Faction: '),
      nullif('Appearance: '||coalesce(v_profile.appearance,''),'Appearance: '),
      nullif('Demeanor: '||coalesce(v_profile.demeanor,''),'Demeanor: '),
      nullif('Biography: '||coalesce(v_character.bio,''),'Biography: '),
      'Composition: single-character portrait, grounded dark fantasy, readable face and silhouette, graphite atmosphere, no text, no UI, no watermark.'
    ),6000);
  else
    select * into v_location
    from public.locations l
    where l.id=p_target_id
      and l.lifecycle_state='active';

    if v_location.id is null then return null; end if;

    v_campaign_id:=v_location.campaign_id;
    v_preferred_user_id:=v_location.created_by;
    v_target_field:='image_url';
    v_purpose:='master_art';
    v_existing_url:=nullif(trim(coalesce(v_location.image_url,'')),'');
    v_prompt:=left(concat_ws(E'
',
      'MEGANOT premium environmental concept art. Preserve the canonical location description exactly and do not invent contradictory landmarks, architecture, NPCs or lore.',
      'Location: '||v_location.name,
      nullif('Summary: '||coalesce(v_location.summary,''),'Summary: '),
      nullif('Description: '||coalesce(v_location.description,''),'Description: '),
      'Composition: wide cinematic establishing scene, polished semi-realistic vector dark-fantasy art, deep readable environment, coherent architecture and terrain, atmospheric depth, no text, no UI, no watermark.'
    ),6000);
  end if;

  if v_existing_url is not null then
    return null;
  end if;

  v_manager_user_id:=private.ai_gm_media_manager_v1(
    v_campaign_id,
    v_preferred_user_id
  );
  if v_manager_user_id is null then return null; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ai-gm-media:'||p_target_type||':'||p_target_id::text||':'||v_target_field,
      0
    )
  );

  select * into v_lifecycle
  from private.ai_gm_media_lifecycle l
  where l.target_type=p_target_type
    and l.target_id=p_target_id
    and l.target_field=v_target_field
  for update;

  if v_lifecycle.status in ('queued','running','completed') then
    update private.ai_gm_media_lifecycle
    set source_character_id=coalesce(
          p_source_character_id,
          private.ai_gm_media_lifecycle.source_character_id
        ),
        source_room_id=coalesce(
          p_source_room_id,
          private.ai_gm_media_lifecycle.source_room_id
        ),
        publication_key=coalesce(
          nullif(trim(p_publication_key),''),
          private.ai_gm_media_lifecycle.publication_key
        ),
        trigger_kind=case
          when p_trigger_kind='explicit_environment_request'
            then p_trigger_kind
          else private.ai_gm_media_lifecycle.trigger_kind
        end,
        updated_at=now()
    where target_type=p_target_type
      and target_id=p_target_id
      and target_field=v_target_field;

    return v_lifecycle.image_job_id;
  end if;

  insert into public.agent_jobs(
    campaign_id,thread_id,requested_by,agent_key,job_type,status,input,result,
    requested_outputs,completed_outputs
  )
  values(
    v_campaign_id,p_source_room_id,v_manager_user_id,
    'ai-gm-media-worker','image_generate','queued',
    jsonb_build_object(
      'surface','ai_gm_media_stage9_v1',
      'runtime_stage',9,
      'prompt',v_prompt,
      'purpose',v_purpose,
      'profile',case when v_purpose='portrait' then 'portrait' else 'master_art' end,
      'variants',1,
      'target',jsonb_build_object(
        'type',p_target_type,
        'id',p_target_id::text,
        'field',v_target_field
      ),
      'attach_when_ready',true,
      'auto_publish_chat',true,
      'trigger_kind',p_trigger_kind,
      'source_character_id',p_source_character_id,
      'source_room_id',p_source_room_id,
      'publication_key',nullif(trim(p_publication_key),''),
      'generation_tier',case when p_target_type='location' then 'max' else 'economy' end,
      'target_token_budget',case when p_target_type='location' then 150000 else 50000 end,
      'presentation_rule','show_all_requested_outputs'
    ),
    '{}'::jsonb,1,0
  )
  returning id into v_job_id;

  insert into private.ai_gm_media_lifecycle(
    target_type,target_id,target_field,campaign_id,trigger_kind,
    source_character_id,source_room_id,publication_key,
    requested_by,image_job_id,status,generation,
    last_error,updated_at,completed_at
  )
  values(
    p_target_type,p_target_id,v_target_field,v_campaign_id,p_trigger_kind,
    p_source_character_id,p_source_room_id,nullif(trim(p_publication_key),''),
    v_manager_user_id,v_job_id,'queued',1,
    null,now(),null
  )
  on conflict(target_type,target_id,target_field) do update set
    trigger_kind=excluded.trigger_kind,
    source_character_id=coalesce(
      excluded.source_character_id,
      private.ai_gm_media_lifecycle.source_character_id
    ),
    source_room_id=coalesce(
      excluded.source_room_id,
      private.ai_gm_media_lifecycle.source_room_id
    ),
    publication_key=coalesce(
      excluded.publication_key,
      private.ai_gm_media_lifecycle.publication_key
    ),
    requested_by=excluded.requested_by,
    image_job_id=excluded.image_job_id,
    status='queued',
    generation=private.ai_gm_media_lifecycle.generation+1,
    last_error=null,
    updated_at=now(),
    completed_at=null;

  perform private.dispatch_ai_gm_media_job_v1(v_job_id);
  return v_job_id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.request_ai_gm_location_media_v2(p_location_id uuid, p_source_character_id uuid, p_source_room_id uuid DEFAULT NULL::uuid, p_trigger_kind text DEFAULT 'explicit_environment_request'::text, p_publication_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_campaign_id uuid;
  v_publications jsonb := '[]'::jsonb;
  v_job_id uuid;
begin
  select l.campaign_id into v_campaign_id
  from public.locations l
  where l.id=p_location_id
    and l.lifecycle_state='active';

  if v_campaign_id is null then
    return jsonb_build_object('status','location_not_found');
  end if;

  if not exists(
    select 1
    from public.characters c
    join public.character_world_state ws
      on ws.character_id=c.id
     and ws.campaign_id=c.campaign_id
    where c.id=p_source_character_id
      and c.campaign_id=v_campaign_id
      and c.character_type='pc'
      and c.life_state='alive'
      and c.publication_state='campaign'
      and ws.location_id=p_location_id
  ) then
    return jsonb_build_object('status','character_not_at_location');
  end if;

  if p_source_room_id is not null and not exists(
    select 1
    from public.chat_rooms r
    where r.id=p_source_room_id
      and r.campaign_id=v_campaign_id
      and r.category='game'
      and r.room_state='open'
      and r.is_read_only=false
      and (
        (r.room_type='character' and r.character_id=p_source_character_id)
        or
        (r.room_type='scene' and r.scene_state='active' and r.location_id=p_location_id)
      )
  ) then
    return jsonb_build_object('status','source_room_invalid');
  end if;

  v_publications:=private.publish_existing_ai_gm_target_media_v2(
    'location',
    p_location_id,
    p_source_character_id,
    p_source_room_id,
    p_publication_key
  );

  if jsonb_array_length(v_publications)>0 then
    return jsonb_build_object(
      'status','published_existing',
      'location_id',p_location_id,
      'publications',v_publications,
      'generation_queued',false
    );
  end if;

  if not private.ai_gm_runtime_feature_enabled_v1(
    v_campaign_id,'media_pipeline'
  ) then
    return jsonb_build_object(
      'status','media_pipeline_disabled',
      'location_id',p_location_id,
      'publications',v_publications,
      'generation_queued',false
    );
  end if;

  v_job_id:=private.queue_ai_gm_media_target_v2(
    'location',
    p_location_id,
    p_trigger_kind,
    p_source_character_id,
    p_source_room_id,
    p_publication_key
  );

  return jsonb_build_object(
    'status',case when v_job_id is null then 'not_queued' else 'queued' end,
    'location_id',p_location_id,
    'job_id',v_job_id,
    'publications',v_publications,
    'generation_queued',v_job_id is not null,
    'generation_tier','max',
    'target_token_budget',150000
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_ai_gm_media_lifecycle_v1(p_job_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_job public.agent_jobs%rowtype;
  v_lifecycle private.ai_gm_media_lifecycle%rowtype;
  v_asset_id uuid;
  v_publications jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  select * into v_job
  from public.agent_jobs j
  where j.id=p_job_id
    and j.agent_key='ai-gm-media-worker'
    and j.job_type='image_generate'
    and j.input->>'surface'='ai_gm_media_stage9_v1'
  for update;

  if v_job.id is null then
    raise exception 'ai_gm_media_job_not_found';
  end if;

  select * into v_lifecycle
  from private.ai_gm_media_lifecycle l
  where l.image_job_id=p_job_id
  for update;

  if v_lifecycle.target_id is null then
    raise exception 'ai_gm_media_lifecycle_not_found';
  end if;

  if v_job.status in ('queued','running') then
    update private.ai_gm_media_lifecycle
    set status=v_job.status,updated_at=now()
    where image_job_id=p_job_id;

    return jsonb_build_object(
      'job_id',p_job_id,
      'status',v_job.status,
      'runtime_stage',9
    );
  end if;

  if v_job.status<>'completed' then
    update private.ai_gm_media_lifecycle
    set status=case
          when v_job.status='cancelled' then 'cancelled'
          else 'failed'
        end,
        last_error=left(
          coalesce(v_job.error_message,v_job.error_code,'image_job_failed'),
          1200
        ),
        updated_at=now()
    where image_job_id=p_job_id;

    return jsonb_build_object(
      'job_id',p_job_id,
      'status',v_job.status,
      'runtime_stage',9
    );
  end if;

  select a.id into v_asset_id
  from public.media_assets a
  join public.media_bindings b
    on b.asset_id=a.id
   and b.is_active=true
  where a.source_job_id=p_job_id
    and a.variant_index=1
    and a.status='attached'
    and b.target_type=v_lifecycle.target_type
    and b.target_id=v_lifecycle.target_id
    and b.target_field=v_lifecycle.target_field
  order by a.created_at desc
  limit 1;

  if v_asset_id is null then
    update private.ai_gm_media_lifecycle
    set status='failed',
        last_error='generated_asset_not_attached',
        updated_at=now()
    where image_job_id=p_job_id;

    return jsonb_build_object(
      'job_id',p_job_id,
      'status','failed',
      'error','generated_asset_not_attached',
      'runtime_stage',9
    );
  end if;

  v_publications:=private.publish_ai_gm_target_media_v2(
    v_lifecycle.target_type,
    v_lifecycle.target_id,
    v_asset_id,
    v_lifecycle.source_character_id,
    v_lifecycle.source_room_id,
    v_lifecycle.publication_key
  );

  update private.ai_gm_media_lifecycle
  set status='completed',
      last_error=null,
      updated_at=now(),
      completed_at=coalesce(completed_at,now())
  where image_job_id=p_job_id;

  v_result:=jsonb_build_object(
    'job_id',p_job_id,
    'status','completed',
    'asset_id',v_asset_id,
    'target_type',v_lifecycle.target_type,
    'target_id',v_lifecycle.target_id,
    'publications',v_publications,
    'runtime_stage',9
  );

  update public.agent_jobs
  set result=coalesce(result,'{}'::jsonb)||jsonb_build_object(
        'ai_gm_media_lifecycle',v_result
      ),
      updated_at=now()
  where id=p_job_id;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.request_ai_gm_location_media_v2(p_location_id uuid, p_source_character_id uuid, p_source_room_id uuid DEFAULT NULL::uuid, p_publication_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.request_ai_gm_location_media_v2(
    p_location_id,
    p_source_character_id,
    p_source_room_id,
    'explicit_environment_request',
    p_publication_key
  );
$function$;

CREATE OR REPLACE FUNCTION public.retry_ai_gm_media_target_v1(p_target_type text, p_target_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_lifecycle private.ai_gm_media_lifecycle%rowtype;
begin
  select * into v_lifecycle
  from private.ai_gm_media_lifecycle l
  where l.target_type=p_target_type
    and l.target_id=p_target_id
  order by l.updated_at desc
  limit 1
  for update;

  if v_lifecycle.target_id is null then
    return null;
  end if;

  if v_lifecycle.status not in ('failed','cancelled') then
    return v_lifecycle.image_job_id;
  end if;

  return private.queue_ai_gm_media_target_v2(
    v_lifecycle.target_type,
    v_lifecycle.target_id,
    v_lifecycle.trigger_kind,
    v_lifecycle.source_character_id,
    v_lifecycle.source_room_id,
    v_lifecycle.publication_key
  );
end;
$function$;

revoke all on function private.publish_ai_gm_target_media_v2(text,uuid,uuid,uuid,uuid,text)
  from public,anon,authenticated;
revoke all on function private.publish_ai_gm_target_media_v1(text,uuid,uuid,uuid)
  from public,anon,authenticated;
revoke all on function private.publish_existing_ai_gm_target_media_v2(text,uuid,uuid,uuid,text)
  from public,anon,authenticated;
revoke all on function private.publish_existing_ai_gm_target_media_v1(text,uuid,uuid)
  from public,anon,authenticated;
revoke all on function private.queue_ai_gm_media_target_v2(text,uuid,text,uuid,uuid,text)
  from public,anon,authenticated;
revoke all on function private.queue_ai_gm_media_target_v1(text,uuid,text,uuid)
  from public,anon,authenticated;
revoke all on function private.request_ai_gm_location_media_v2(uuid,uuid,uuid,text,text)
  from public,anon,authenticated;
revoke all on function public.request_ai_gm_location_media_v2(uuid,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.request_ai_gm_location_media_v2(uuid,uuid,uuid,text)
  to service_role;
revoke all on function public.finalize_ai_gm_media_lifecycle_v1(uuid)
  from public,anon,authenticated;
grant execute on function public.finalize_ai_gm_media_lifecycle_v1(uuid)
  to service_role;
revoke all on function public.retry_ai_gm_media_target_v1(text,uuid)
  from public,anon,authenticated;
grant execute on function public.retry_ai_gm_media_target_v1(text,uuid)
  to service_role;

drop trigger if exists queue_ai_gm_location_media_after_entry_v1
  on public.character_world_state;
create trigger queue_ai_gm_location_media_after_entry_v1
after insert or update of location_id
on public.character_world_state
for each row
execute function private.queue_ai_gm_location_media_after_entry_v1();

comment on function private.publish_ai_gm_target_media_v2(text,uuid,uuid,uuid,uuid,text) is
  'Stage 9 event-aware media publication. Location media prefers the player character room, may target an explicit game room, and deduplicates only the same publication event.';
comment on function private.request_ai_gm_location_media_v2(uuid,uuid,uuid,text,text) is
  'Reuse an attached location asset immediately or queue one max-tier 150k-target environment render and publish it to the requesting player room when ready.';
comment on function public.request_ai_gm_location_media_v2(uuid,uuid,uuid,text) is
  'Service-only game-chat bridge for explicit environment/location visual requests.';
