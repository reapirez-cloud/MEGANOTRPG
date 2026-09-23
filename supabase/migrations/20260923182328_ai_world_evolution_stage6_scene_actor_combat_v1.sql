-- CLASS_MIGRATION_SCOPE: infrastructure
-- AI World Evolution Stage 6: authoritative combat/runtime for ephemeral scene actors.
-- Numeric mechanics come only from Stage-4 compiled snapshots; AI supplies actor/mechanic intent.

create table public.ai_scene_actor_command_receipts (
  command_id uuid primary key references public.agent_jobs(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  actor_id uuid not null,
  command_kind text not null check (command_kind in ('action','roll')),
  input_fingerprint text not null check (input_fingerprint ~ '^[0-9a-f]{64}$'),
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result)='object'),
  created_at timestamptz not null default now(),
  foreign key (actor_id,campaign_id)
    references public.ai_scene_actors(id,campaign_id) on delete cascade
);

create table public.ai_scene_actor_damage_receipts (
  actor_id uuid not null,
  campaign_id uuid not null,
  source_message_id bigint not null references public.chat_messages(id) on delete cascade,
  applied_damage integer not null check (applied_damage >= 0),
  resulting_hp integer not null check (resulting_hp >= 0),
  resulting_revision bigint not null check (resulting_revision >= 0),
  created_at timestamptz not null default now(),
  primary key(actor_id,source_message_id),
  foreign key (actor_id,campaign_id)
    references public.ai_scene_actors(id,campaign_id) on delete cascade
);

create index ai_scene_actor_command_receipts_campaign_actor_idx
  on public.ai_scene_actor_command_receipts(campaign_id,actor_id);
create index ai_scene_actor_damage_receipts_message_fk_idx
  on public.ai_scene_actor_damage_receipts(source_message_id);
create index ai_scene_actor_damage_receipts_campaign_actor_idx
  on public.ai_scene_actor_damage_receipts(campaign_id,actor_id);

alter table public.ai_scene_actor_command_receipts enable row level security;
alter table public.ai_scene_actor_damage_receipts enable row level security;

revoke all on table public.ai_scene_actor_command_receipts
  from public,anon,authenticated,service_role;
revoke all on table public.ai_scene_actor_damage_receipts
  from public,anon,authenticated,service_role;
grant select on table public.ai_scene_actor_command_receipts to service_role;
grant select on table public.ai_scene_actor_damage_receipts to service_role;

create trigger ai_scene_actor_command_receipts_ai_world_guard
before insert or update on public.ai_scene_actor_command_receipts
for each row execute function private.guard_ai_scene_actor_ai_world_v1();

create trigger ai_scene_actor_damage_receipts_ai_world_guard
before insert or update on public.ai_scene_actor_damage_receipts
for each row execute function private.guard_ai_scene_actor_ai_world_v1();

CREATE OR REPLACE FUNCTION private.ai_scene_actor_skill_ability_v1(p_skill text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case lower(trim(coalesce(p_skill,'')))
    when 'acrobatics' then 'dexterity' when 'animal_handling' then 'wisdom'
    when 'arcana' then 'intelligence' when 'athletics' then 'strength'
    when 'deception' then 'charisma' when 'history' then 'intelligence'
    when 'insight' then 'wisdom' when 'intimidation' then 'charisma'
    when 'investigation' then 'intelligence' when 'medicine' then 'wisdom'
    when 'nature' then 'intelligence' when 'perception' then 'wisdom'
    when 'performance' then 'charisma' when 'persuasion' then 'charisma'
    when 'religion' then 'intelligence' when 'sleight_of_hand' then 'dexterity'
    when 'stealth' then 'dexterity' when 'survival' then 'wisdom' else null end;
$function$
;

CREATE OR REPLACE FUNCTION private.normalize_ai_combat_actor_ref_v1(p_actor_ref jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare v_kind text:=lower(trim(coalesce(p_actor_ref->>'kind',''))); v_id_text text; v_id uuid;
begin
  if jsonb_typeof(p_actor_ref)<>'object' then raise exception 'ai_combat_actor_ref_invalid'; end if;
  if v_kind='npc' then v_id_text:=nullif(trim(coalesce(p_actor_ref->>'characterId','')),'');
  elsif v_kind='scene_actor' then v_id_text:=nullif(trim(coalesce(p_actor_ref->>'actorId','')),'');
  else raise exception 'ai_combat_actor_ref_kind_invalid'; end if;
  begin v_id:=v_id_text::uuid; exception when others then raise exception 'ai_combat_actor_ref_id_invalid'; end;
  return jsonb_build_object('kind',v_kind,'id',v_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION private.ai_scene_actor_roll_dice_v1(p_roll_d20 boolean, p_modifier integer, p_dice_count integer, p_dice_sides integer, p_dice_modifier integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_d20 integer; v_roll integer; v_rolls integer[]:='{}'; v_effect_total integer:=0; i integer; v_result jsonb:='{}'::jsonb;
begin
  if coalesce(p_modifier,0) not between -500 and 500 or coalesce(p_dice_modifier,0) not between -500 and 500 or coalesce(p_dice_count,0) not between 0 and 40 or (coalesce(p_dice_count,0)>0 and coalesce(p_dice_sides,0) not between 2 and 1000) then raise exception 'ai_scene_actor_dice_contract_invalid'; end if;
  if coalesce(p_roll_d20,false) then
    v_d20:=floor(random()*20+1)::integer;
    v_result:=v_result||jsonb_build_object('d20Raw',v_d20,'d20',v_d20,'total',v_d20+coalesce(p_modifier,0),'modifier',coalesce(p_modifier,0),'rollD20',true);
  else v_result:=v_result||jsonb_build_object('modifier',coalesce(p_modifier,0),'rollD20',false); end if;
  if coalesce(p_dice_count,0)>0 then
    for i in 1..p_dice_count loop v_roll:=floor(random()*p_dice_sides+1)::integer; v_rolls:=array_append(v_rolls,v_roll); v_effect_total:=v_effect_total+v_roll; end loop;
    v_effect_total:=v_effect_total+coalesce(p_dice_modifier,0);
    v_result:=v_result||jsonb_build_object('effect',jsonb_build_object('count',p_dice_count,'sides',p_dice_sides,'rolls',to_jsonb(v_rolls),'modifier',coalesce(p_dice_modifier,0),'total',v_effect_total));
  end if;
  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.ai_scene_actor_assert_turn_scope_v1(p_job public.agent_jobs, p_actor public.ai_scene_actors)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_room_id uuid:=nullif(p_job.input->>'room_id','')::uuid; v_source_character_id uuid:=nullif(p_job.input->>'source_character_id','')::uuid; v_source_location_id uuid;
begin
  if p_actor.campaign_id<>p_job.campaign_id or p_actor.room_id<>v_room_id or p_actor.runtime_state<>'active' or p_actor.life_state<>'alive' then raise exception 'scene_actor_not_available_for_turn'; end if;
  select ws.location_id into v_source_location_id from public.character_world_state ws where ws.character_id=v_source_character_id and ws.campaign_id=p_job.campaign_id;
  if v_source_location_id is null then select r.location_id into v_source_location_id from public.chat_rooms r where r.id=v_room_id and r.campaign_id=p_job.campaign_id; end if;
  if v_source_location_id is null or p_actor.location_id is null or p_actor.location_id<>v_source_location_id then raise exception 'scene_actor_requires_same_location'; end if;
  return v_source_location_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.execute_ai_gm_scene_actor_action_turn_v1(p_job_id uuid, p_actor_id uuid, p_mechanic_key text, p_target_character_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_job public.agent_jobs%rowtype; v_actor public.ai_scene_actors%rowtype; v_receipt public.ai_scene_actor_command_receipts%rowtype;
  v_mechanic jsonb; v_runtime jsonb; v_resource jsonb; v_resource_row public.ai_scene_actor_resources%rowtype;
  v_source_location_id uuid; v_target_type text; v_target_location_id uuid; v_manager_user_id uuid; v_fingerprint text;
  v_roll jsonb; v_payload jsonb; v_result jsonb; v_message_id bigint; v_roll_request jsonb; v_save_dc integer; v_save_ability text;
  v_key text:=trim(coalesce(p_mechanic_key,''));
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  select * into v_job from public.agent_jobs where id=p_job_id and job_type='conversation_turn' and input->>'surface'='game_chat_v1' for update;
  if v_job.id is null then raise exception 'ai_gm_turn_not_found'; end if;
  select * into v_actor from public.ai_scene_actors where id=p_actor_id for update;
  if v_actor.id is null then raise exception 'scene_actor_not_found'; end if;
  if not private.is_ai_world_campaign_v1(v_actor.campaign_id) then raise exception 'scene_actor_ai_world_only'; end if;
  v_fingerprint:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object('kind','action','actor_id',p_actor_id,'mechanic_key',v_key,'target_character_id',p_target_character_id)::text,'UTF8'),'sha256'),'hex');
  select * into v_receipt from public.ai_scene_actor_command_receipts where command_id=p_job_id;
  if v_receipt.command_id is not null then
    if v_receipt.actor_id<>p_actor_id or v_receipt.command_kind<>'action' or v_receipt.input_fingerprint<>v_fingerprint then raise exception 'scene_actor_command_conflict'; end if;
    return v_receipt.result;
  end if;
  if v_job.status<>'running' then raise exception 'ai_gm_turn_not_running'; end if;
  v_source_location_id:=private.ai_scene_actor_assert_turn_scope_v1(v_job,v_actor);
  select value into v_mechanic from jsonb_array_elements(coalesce(v_actor.mechanics_snapshot,'[]'::jsonb)) where value->>'stable_key'=v_key limit 1;
  if v_mechanic is null or jsonb_typeof(v_mechanic->'runtime')<>'object' then raise exception 'scene_actor_mechanic_not_found'; end if;
  v_runtime:=v_mechanic->'runtime'; v_resource:=v_mechanic->'resource';
  if p_target_character_id is not null then
    select c.character_type,ws.location_id into v_target_type,v_target_location_id
    from public.characters c left join public.character_world_state ws on ws.character_id=c.id and ws.campaign_id=c.campaign_id
    where c.id=p_target_character_id and c.campaign_id=v_job.campaign_id and c.life_state='alive' and c.publication_state='campaign';
    if v_target_type is null or v_target_location_id is null or v_target_location_id<>v_source_location_id then raise exception 'scene_actor_action_target_not_present'; end if;
  end if;
  if v_runtime->>'kind'='save_action' then
    if p_target_character_id is null or v_target_type<>'pc' then raise exception 'scene_actor_save_action_requires_pc_target'; end if;
    v_save_ability:=nullif(trim(coalesce(v_runtime->>'saveAbility','')),'');
    if v_save_ability is null or coalesce(v_runtime->>'saveDc','') !~ '^[0-9]+$' then raise exception 'scene_actor_save_action_runtime_invalid'; end if;
    v_save_dc:=(v_runtime->>'saveDc')::integer;
  end if;
  if v_resource is not null then
    select * into v_resource_row from public.ai_scene_actor_resources where actor_id=v_actor.id and state_key=v_resource->>'key' for update;
    if v_resource_row.actor_id is null or v_resource_row.current<1 then raise exception 'scene_actor_resource_exhausted'; end if;
    update public.ai_scene_actor_resources set current=current-1,updated_at=now() where actor_id=v_actor.id and state_key=v_resource_row.state_key;
  end if;
  v_roll:=private.ai_scene_actor_roll_dice_v1(coalesce((v_runtime->>'rollD20')::boolean,false),coalesce((v_runtime->>'attackBonus')::integer,0),coalesce((v_runtime->>'diceCount')::integer,0),coalesce((v_runtime->>'diceSides')::integer,0),coalesce((v_runtime->>'diceModifier')::integer,0));
  v_payload:=jsonb_strip_nulls(jsonb_build_object('kind','scene_actor_action','sceneActorId',v_actor.id,'sceneActorLabel',v_actor.display_label,'runtimeOrdinal',v_actor.runtime_ordinal,'sourceBestiarySlug',v_actor.source_bestiary_slug,'mechanicKey',v_key,'label',v_mechanic->>'label','runtime',v_runtime,'targetCharacterId',p_target_character_id,'resourceKey',case when v_resource is null then null else v_resource->>'key' end,'resourceRemaining',case when v_resource is null then null else greatest(v_resource_row.current-1,0) end,'gmJobId',p_job_id))||v_roll;
  v_manager_user_id:=nullif(v_job.input->>'manager_user_id','')::uuid; perform private.npc_runtime_manager_claims_v1(v_manager_user_id);
  insert into public.chat_messages(room_id,client_id,user_id,character_id,author_name,body,event_kind,event_payload)
  values(v_actor.room_id,v_manager_user_id,v_manager_user_id,null,'Рассказчик','',case when coalesce((v_runtime->>'rollD20')::boolean,false) or coalesce((v_runtime->>'diceCount')::integer,0)>0 then 'roll' else 'action' end,v_payload) returning id into v_message_id;
  v_result:=jsonb_build_object('message_id',v_message_id,'actor_kind','scene_actor','actor_id',v_actor.id,'mechanic_key',v_key,'label',v_mechanic->>'label','runtime',v_runtime,'roll',v_roll,'target_character_id',p_target_character_id,'waiting_for_user',false,'runtime_stage',6);
  insert into public.ai_scene_actor_command_receipts(command_id,campaign_id,actor_id,command_kind,input_fingerprint,result) values(p_job_id,v_job.campaign_id,v_actor.id,'action',v_fingerprint,v_result);
  if v_runtime->>'kind'='save_action' then
    v_roll_request:=public.create_ai_gm_player_roll_request_v1(p_job_id,p_target_character_id,'save',v_save_ability,null,null,left(coalesce(v_mechanic->>'label','Scene actor')||': спасбросок',160),left(v_actor.display_label||' использует '||coalesce(v_mechanic->>'label','способность')||'.',1200),v_save_dc,'hidden');
    v_result:=v_result||jsonb_build_object('waiting_for_user',true,'roll_request',v_roll_request);
    update public.ai_scene_actor_command_receipts set result=v_result where command_id=p_job_id;
    update public.agent_jobs set result=coalesce(result,'{}'::jsonb)||jsonb_build_object('last_scene_actor_action',v_result,'last_scene_actor_id',v_actor.id,'last_scene_actor_mechanic_key',v_key,'runtime_stage',6),updated_at=now() where id=p_job_id and status='waiting_for_user';
  end if;
  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.execute_ai_gm_scene_actor_roll_v1(p_job_id uuid, p_actor_id uuid, p_request_type text, p_ability_key text, p_skill_key text, p_label text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_job public.agent_jobs%rowtype; v_actor public.ai_scene_actors%rowtype; v_receipt public.ai_scene_actor_command_receipts%rowtype; v_sheet jsonb;
  v_type text:=lower(trim(coalesce(p_request_type,''))); v_ability text:=lower(trim(coalesce(p_ability_key,''))); v_skill text:=nullif(lower(trim(coalesce(p_skill_key,''))),'');
  v_score integer; v_modifier integer; v_rank integer:=0; v_prof integer; v_fingerprint text; v_roll jsonb; v_payload jsonb; v_result jsonb; v_message_id bigint; v_manager_user_id uuid;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  select * into v_job from public.agent_jobs where id=p_job_id and job_type='conversation_turn' and input->>'surface'='game_chat_v1' for update;
  if v_job.id is null then raise exception 'ai_gm_turn_not_found'; end if;
  select * into v_actor from public.ai_scene_actors where id=p_actor_id for update;
  if v_actor.id is null then raise exception 'scene_actor_not_found'; end if;
  v_fingerprint:=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(jsonb_build_object('kind','roll','actor_id',p_actor_id,'request_type',v_type,'ability_key',v_ability,'skill_key',v_skill,'label',coalesce(p_label,''))::text,'UTF8'),'sha256'),'hex');
  select * into v_receipt from public.ai_scene_actor_command_receipts where command_id=p_job_id;
  if v_receipt.command_id is not null then
    if v_receipt.actor_id<>p_actor_id or v_receipt.command_kind<>'roll' or v_receipt.input_fingerprint<>v_fingerprint then raise exception 'scene_actor_command_conflict'; end if;
    return v_receipt.result;
  end if;
  if v_job.status<>'running' then raise exception 'ai_gm_turn_not_running'; end if;
  perform private.ai_scene_actor_assert_turn_scope_v1(v_job,v_actor);
  if v_type not in ('ability','save','skill') then raise exception 'unsupported_scene_actor_roll_type'; end if;
  if v_type='skill' then v_ability:=private.ai_scene_actor_skill_ability_v1(v_skill); end if;
  if v_ability not in ('strength','dexterity','constitution','intelligence','wisdom','charisma') then raise exception 'unsupported_scene_actor_roll_ability'; end if;
  v_sheet:=v_actor.sheet_snapshot; v_score:=coalesce((v_sheet->>v_ability)::integer,10); v_prof:=coalesce((v_sheet->>'proficiency_bonus')::integer,0); v_modifier:=floor((v_score-10)::numeric/2)::integer;
  if v_type='save' and coalesce(v_sheet->'saving_throw_proficiencies','[]'::jsonb) ? v_ability then v_modifier:=v_modifier+v_prof;
  elsif v_type='skill' then v_rank:=greatest(0,least(2,coalesce((v_sheet#>>array['skill_proficiencies',v_skill])::integer,0))); v_modifier:=v_modifier+(v_prof*v_rank); end if;
  v_roll:=private.ai_scene_actor_roll_dice_v1(true,v_modifier,0,0,0);
  v_payload:=jsonb_build_object('kind','scene_actor_roll','sceneActorId',v_actor.id,'sceneActorLabel',v_actor.display_label,'runtimeOrdinal',v_actor.runtime_ordinal,'sourceBestiarySlug',v_actor.source_bestiary_slug,'requestType',v_type,'abilityKey',v_ability,'skillKey',v_skill,'label',left(coalesce(nullif(trim(p_label),''),'Scene actor roll'),160),'gmJobId',p_job_id)||v_roll;
  v_manager_user_id:=nullif(v_job.input->>'manager_user_id','')::uuid; perform private.npc_runtime_manager_claims_v1(v_manager_user_id);
  insert into public.chat_messages(room_id,client_id,user_id,character_id,author_name,body,event_kind,event_payload) values(v_actor.room_id,v_manager_user_id,v_manager_user_id,null,'Рассказчик','','roll',v_payload) returning id into v_message_id;
  v_result:=jsonb_build_object('message_id',v_message_id,'actor_kind','scene_actor','actor_id',v_actor.id,'request_type',v_type,'ability_key',v_ability,'skill_key',v_skill,'modifier',v_modifier,'roll',v_roll,'runtime_stage',6);
  insert into public.ai_scene_actor_command_receipts(command_id,campaign_id,actor_id,command_kind,input_fingerprint,result) values(p_job_id,v_job.campaign_id,v_actor.id,'roll',v_fingerprint,v_result);
  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.execute_ai_gm_actor_action_turn_v1(p_job_id uuid, p_actor_ref jsonb, p_mechanic_key text, p_target_character_id uuid DEFAULT NULL::uuid, p_option_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_ref jsonb;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  v_ref:=private.normalize_ai_combat_actor_ref_v1(p_actor_ref);
  if v_ref->>'kind'='npc' then return public.execute_ai_gm_npc_action_turn_v1(p_job_id,(v_ref->>'id')::uuid,p_mechanic_key,p_target_character_id,p_option_key)||jsonb_build_object('actor_kind','npc'); end if;
  if nullif(trim(coalesce(p_option_key,'')),'') is not null then raise exception 'scene_actor_action_option_not_supported'; end if;
  return public.execute_ai_gm_scene_actor_action_turn_v1(p_job_id,(v_ref->>'id')::uuid,p_mechanic_key,p_target_character_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.execute_ai_gm_actor_roll_v1(p_job_id uuid, p_actor_ref jsonb, p_request_type text, p_ability_key text, p_skill_key text, p_label text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_ref jsonb;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  v_ref:=private.normalize_ai_combat_actor_ref_v1(p_actor_ref);
  if v_ref->>'kind'='npc' then return public.execute_ai_gm_npc_roll_v2(p_job_id,(v_ref->>'id')::uuid,p_request_type,p_ability_key,p_skill_key,p_label)||jsonb_build_object('actor_kind','npc'); end if;
  return public.execute_ai_gm_scene_actor_roll_v1(p_job_id,(v_ref->>'id')::uuid,p_request_type,p_ability_key,p_skill_key,p_label);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_ai_scene_actor_damage_from_roll_v1(p_actor_id uuid, p_expected_revision bigint, p_source_message_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor public.ai_scene_actors%rowtype; v_existing public.ai_scene_actor_damage_receipts%rowtype; v_message public.chat_messages%rowtype; v_damage integer; v_hp integer;
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  select * into v_actor from public.ai_scene_actors where id=p_actor_id for update;
  if v_actor.id is null then raise exception 'scene_actor_not_found'; end if;
  if v_actor.runtime_state<>'active' then raise exception 'scene_actor_archived'; end if;
  select * into v_existing from public.ai_scene_actor_damage_receipts where actor_id=p_actor_id and source_message_id=p_source_message_id;
  if v_existing.actor_id is not null then return jsonb_build_object('actor',private.ai_scene_actor_json_v1(v_actor),'damage',v_existing.applied_damage,'replayed',true); end if;
  if v_actor.revision<>p_expected_revision then raise exception 'scene_actor_revision_conflict'; end if;
  select * into v_message from public.chat_messages where id=p_source_message_id and room_id=v_actor.room_id;
  if v_message.id is null or v_message.event_kind<>'roll' or coalesce(v_message.event_payload#>>'{effect,total}','') !~ '^-?[0-9]+$' then raise exception 'scene_actor_damage_source_roll_invalid'; end if;
  v_damage:=(v_message.event_payload#>>'{effect,total}')::integer; if v_damage<0 then raise exception 'scene_actor_damage_source_roll_invalid'; end if;
  v_hp:=greatest(0,v_actor.current_hp-v_damage);
  update public.ai_scene_actors set current_hp=v_hp,life_state=case when v_hp=0 then 'dead' else life_state end,revision=revision+1,updated_at=now() where id=v_actor.id returning * into v_actor;
  insert into public.ai_scene_actor_damage_receipts(actor_id,campaign_id,source_message_id,applied_damage,resulting_hp,resulting_revision) values(v_actor.id,v_actor.campaign_id,p_source_message_id,v_damage,v_actor.current_hp,v_actor.revision);
  return jsonb_build_object('actor',private.ai_scene_actor_json_v1(v_actor),'damage',v_damage,'replayed',false);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.transition_ai_scene_actor_v1(p_actor_id uuid, p_expected_revision bigint, p_transition text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor public.ai_scene_actors%rowtype; v_transition text:=lower(trim(coalesce(p_transition,'')));
begin
  if auth.role()<>'service_role' then raise exception 'service_role_required'; end if;
  if v_transition not in ('flee','remove') then raise exception 'scene_actor_transition_invalid'; end if;
  select * into v_actor from public.ai_scene_actors where id=p_actor_id for update;
  if v_actor.id is null then raise exception 'scene_actor_not_found'; end if;
  if v_actor.runtime_state<>'active' then return jsonb_build_object('actor',private.ai_scene_actor_json_v1(v_actor),'replayed',true); end if;
  if v_actor.revision<>p_expected_revision then raise exception 'scene_actor_revision_conflict'; end if;
  if v_transition='flee' then update public.ai_scene_actors set life_state='fled',revision=revision+1,updated_at=now() where id=v_actor.id returning * into v_actor;
  else update public.ai_scene_actors set runtime_state='archived',archive_reason=nullif(left(trim(coalesce(p_reason,'')),500),''),archived_at=now(),revision=revision+1,updated_at=now() where id=v_actor.id returning * into v_actor; end if;
  return jsonb_build_object('actor',private.ai_scene_actor_json_v1(v_actor),'replayed',false);
end;
$function$
;

revoke all on function private.ai_scene_actor_skill_ability_v1(text)
  from public,anon,authenticated;
revoke all on function private.normalize_ai_combat_actor_ref_v1(jsonb)
  from public,anon,authenticated;
revoke all on function private.ai_scene_actor_roll_dice_v1(boolean,integer,integer,integer,integer)
  from public,anon,authenticated;
revoke all on function private.ai_scene_actor_assert_turn_scope_v1(public.agent_jobs,public.ai_scene_actors)
  from public,anon,authenticated;

revoke all on function public.execute_ai_gm_scene_actor_action_turn_v1(uuid,uuid,text,uuid)
  from public,anon,authenticated;
revoke all on function public.execute_ai_gm_scene_actor_roll_v1(uuid,uuid,text,text,text,text)
  from public,anon,authenticated;
revoke all on function public.execute_ai_gm_actor_action_turn_v1(uuid,jsonb,text,uuid,text)
  from public,anon,authenticated;
revoke all on function public.execute_ai_gm_actor_roll_v1(uuid,jsonb,text,text,text,text)
  from public,anon,authenticated;
revoke all on function public.apply_ai_scene_actor_damage_from_roll_v1(uuid,bigint,bigint)
  from public,anon,authenticated;
revoke all on function public.transition_ai_scene_actor_v1(uuid,bigint,text,text)
  from public,anon,authenticated;

grant execute on function public.execute_ai_gm_scene_actor_action_turn_v1(uuid,uuid,text,uuid)
  to service_role;
grant execute on function public.execute_ai_gm_scene_actor_roll_v1(uuid,uuid,text,text,text,text)
  to service_role;
grant execute on function public.execute_ai_gm_actor_action_turn_v1(uuid,jsonb,text,uuid,text)
  to service_role;
grant execute on function public.execute_ai_gm_actor_roll_v1(uuid,jsonb,text,text,text,text)
  to service_role;
grant execute on function public.apply_ai_scene_actor_damage_from_roll_v1(uuid,bigint,bigint)
  to service_role;
grant execute on function public.transition_ai_scene_actor_v1(uuid,bigint,text,text)
  to service_role;
