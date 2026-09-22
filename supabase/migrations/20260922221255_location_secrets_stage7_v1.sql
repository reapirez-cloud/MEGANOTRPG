create table public.location_secrets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  secret_key text not null,
  secret_type text not null default 'truth',
  title text not null,
  secret_text text not null,
  ai_directive text not null default '',
  reveal_text text not null default '',
  status text not null default 'active',
  importance smallint not null default 2,
  tags text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  resolution_note text not null default '',
  resolved_at timestamptz,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint location_secrets_key_not_blank check (length(btrim(secret_key)) > 0),
  constraint location_secrets_title_not_blank check (length(btrim(title)) > 0),
  constraint location_secrets_text_not_blank check (length(btrim(secret_text)) > 0),
  constraint location_secrets_type_not_blank check (length(btrim(secret_type)) > 0),
  constraint location_secrets_status_check check (status in ('active','resolved','retired')),
  constraint location_secrets_importance_check check (importance between 1 and 5),
  constraint location_secrets_metadata_object check (jsonb_typeof(metadata)='object')
);

create unique index location_secrets_location_key_unique
  on public.location_secrets(location_id, lower(btrim(secret_key)));
create index location_secrets_location_status_idx
  on public.location_secrets(location_id,status,importance desc,updated_at desc);
create index location_secrets_campaign_status_idx
  on public.location_secrets(campaign_id,status,updated_at desc);

create table public.location_secret_revisions (
  id uuid primary key default gen_random_uuid(),
  secret_id uuid not null references public.location_secrets(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  revision bigint not null,
  change_kind text not null,
  snapshot jsonb not null,
  changed_by uuid,
  created_at timestamptz not null default now(),
  constraint location_secret_revisions_revision_positive check (revision > 0),
  constraint location_secret_revisions_kind_not_blank check (length(btrim(change_kind)) > 0),
  constraint location_secret_revisions_snapshot_object check (jsonb_typeof(snapshot)='object'),
  constraint location_secret_revisions_unique unique(secret_id,revision)
);

create index location_secret_revisions_secret_idx
  on public.location_secret_revisions(secret_id,revision desc);
create index location_secret_revisions_location_idx
  on public.location_secret_revisions(location_id,created_at desc);

CREATE OR REPLACE FUNCTION private.location_secret_touch_updated_at_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(),new.updated_by);
  return new;
end;
$function$;
revoke all on function private.location_secret_touch_updated_at_v1()
from public,anon,authenticated;

CREATE OR REPLACE FUNCTION private.validate_location_secret_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_campaign_id uuid;
begin
  select l.campaign_id into v_campaign_id
  from public.locations l
  where l.id=new.location_id;

  if v_campaign_id is null then
    raise exception 'location_secret_location_not_found';
  end if;

  if new.campaign_id<>v_campaign_id then
    raise exception 'location_secret_campaign_mismatch';
  end if;

  new.secret_key := left(btrim(new.secret_key),160);
  new.secret_type := left(lower(btrim(new.secret_type)),80);
  new.title := left(btrim(new.title),240);
  new.secret_text := left(btrim(new.secret_text),24000);
  new.ai_directive := left(btrim(coalesce(new.ai_directive,'')),12000);
  new.reveal_text := left(btrim(coalesce(new.reveal_text,'')),12000);
  new.resolution_note := left(btrim(coalesce(new.resolution_note,'')),12000);

  if new.status='resolved' then
    new.resolved_at := coalesce(new.resolved_at,now());
  elsif new.status='active' then
    new.resolved_at := null;
    new.resolution_note := '';
  end if;

  return new;
end;
$function$;
revoke all on function private.validate_location_secret_v1()
from public,anon,authenticated;

CREATE OR REPLACE FUNCTION private.record_location_secret_revision_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_revision bigint;
  v_change_kind text;
begin
  select coalesce(max(r.revision),0)+1
    into v_revision
  from public.location_secret_revisions r
  where r.secret_id=new.id;

  v_change_kind := case
    when tg_op='INSERT' then 'created'
    when new.status is distinct from old.status then 'status_changed'
    else 'updated'
  end;

  insert into public.location_secret_revisions(
    secret_id,campaign_id,location_id,revision,change_kind,snapshot,changed_by
  ) values (
    new.id,
    new.campaign_id,
    new.location_id,
    v_revision,
    v_change_kind,
    jsonb_build_object(
      'secret_key',new.secret_key,
      'secret_type',new.secret_type,
      'title',new.title,
      'secret_text',new.secret_text,
      'ai_directive',new.ai_directive,
      'reveal_text',new.reveal_text,
      'status',new.status,
      'importance',new.importance,
      'tags',to_jsonb(new.tags),
      'metadata',new.metadata,
      'resolution_note',new.resolution_note,
      'resolved_at',new.resolved_at,
      'updated_at',new.updated_at
    ),
    coalesce(auth.uid(),new.updated_by,new.created_by)
  );

  return new;
end;
$function$;
revoke all on function private.record_location_secret_revision_v1()
from public,anon,authenticated;

create trigger location_secrets_validate
before insert or update on public.location_secrets
for each row execute function private.validate_location_secret_v1();

create trigger location_secrets_touch_updated_at
before update on public.location_secrets
for each row execute function private.location_secret_touch_updated_at_v1();

create trigger location_secrets_revision
after insert or update on public.location_secrets
for each row execute function private.record_location_secret_revision_v1();

alter table public.location_secrets enable row level security;
alter table public.location_secret_revisions enable row level security;

revoke all on table public.location_secrets from anon;
revoke all on table public.location_secret_revisions from anon;
grant select,insert,update on table public.location_secrets to authenticated;
grant select on table public.location_secret_revisions to authenticated;

create policy location_secrets_manager_read
on public.location_secrets
for select to authenticated
using ((select private.can_manage_location(location_id)));

create policy location_secrets_manager_insert
on public.location_secrets
for insert to authenticated
with check (
  (select private.can_manage_campaign(campaign_id))
  and (select private.can_manage_location(location_id))
);

create policy location_secrets_manager_update
on public.location_secrets
for update to authenticated
using ((select private.can_manage_location(location_id)))
with check (
  (select private.can_manage_campaign(campaign_id))
  and (select private.can_manage_location(location_id))
);

create policy location_secret_revisions_manager_read
on public.location_secret_revisions
for select to authenticated
using ((select private.can_manage_location(location_id)));

CREATE OR REPLACE FUNCTION public.upsert_location_secret_v1(p_location_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_input jsonb := coalesce(p_input,'{}'::jsonb);
  v_campaign_id uuid;
  v_secret_id uuid;
  v_requested_id uuid;
  v_secret_key text;
  v_title text;
  v_secret_text text;
  v_status text;
  v_importance integer;
  v_tags text[] := '{}'::text[];
  v_metadata jsonb := '{}'::jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if jsonb_typeof(v_input)<>'object' then
    raise exception 'location_secret_input_invalid';
  end if;

  select l.campaign_id into v_campaign_id
  from public.locations l
  where l.id=p_location_id
    and l.lifecycle_state='active';

  if v_campaign_id is null then
    raise exception 'location_secret_location_unavailable';
  end if;

  if not private.can_manage_location(p_location_id,v_user_id) then
    raise exception 'location_secret_manage_denied';
  end if;

  if nullif(v_input->>'secret_id','') is not null then
    begin
      v_requested_id := (v_input->>'secret_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'location_secret_id_invalid';
    end;

    select s.id into v_secret_id
    from public.location_secrets s
    where s.id=v_requested_id
      and s.location_id=p_location_id
    for update;

    if v_secret_id is null then
      raise exception 'location_secret_not_found';
    end if;
  else
    v_secret_key := nullif(left(btrim(coalesce(v_input->>'secret_key','')),160),'');
    if v_secret_key is null then
      raise exception 'location_secret_key_required';
    end if;

    select s.id into v_secret_id
    from public.location_secrets s
    where s.location_id=p_location_id
      and lower(btrim(s.secret_key))=lower(v_secret_key)
    for update;
  end if;

  if jsonb_typeof(v_input->'tags')='array' then
    select coalesce(array_agg(distinct left(btrim(value),80))
      filter(where btrim(value)<>''),'{}'::text[])
      into v_tags
    from jsonb_array_elements_text(v_input->'tags');
  end if;

  if jsonb_typeof(v_input->'metadata')='object' then
    v_metadata := v_input->'metadata';
  end if;

  v_status := case
    when lower(btrim(coalesce(v_input->>'status',''))) in ('active','resolved','retired')
      then lower(btrim(v_input->>'status'))
    else null
  end;

  v_importance := case
    when coalesce(v_input->>'importance','') ~ '^[0-9]+$'
      then greatest(1,least((v_input->>'importance')::integer,5))
    else null
  end;

  if v_secret_id is null then
    v_title := nullif(left(btrim(coalesce(v_input->>'title','')),240),'');
    v_secret_text := nullif(left(btrim(coalesce(v_input->>'secret_text','')),24000),'');
    if v_title is null then raise exception 'location_secret_title_required'; end if;
    if v_secret_text is null then raise exception 'location_secret_text_required'; end if;

    insert into public.location_secrets(
      campaign_id,location_id,secret_key,secret_type,title,secret_text,
      ai_directive,reveal_text,status,importance,tags,metadata,
      resolution_note,resolved_at,created_by,updated_by
    ) values (
      v_campaign_id,
      p_location_id,
      v_secret_key,
      coalesce(nullif(left(lower(btrim(coalesce(v_input->>'secret_type','truth'))),80),''),'truth'),
      v_title,
      v_secret_text,
      left(btrim(coalesce(v_input->>'ai_directive','')),12000),
      left(btrim(coalesce(v_input->>'reveal_text','')),12000),
      coalesce(v_status,'active'),
      coalesce(v_importance,2),
      v_tags,
      v_metadata,
      left(btrim(coalesce(v_input->>'resolution_note','')),12000),
      case when coalesce(v_status,'active')='resolved' then now() else null end,
      v_user_id,
      v_user_id
    )
    returning id into v_secret_id;
  else
    update public.location_secrets s
    set
      secret_key = case when v_input ? 'secret_key'
        then coalesce(nullif(left(btrim(coalesce(v_input->>'secret_key','')),160),''),s.secret_key)
        else s.secret_key end,
      secret_type = case when v_input ? 'secret_type'
        then coalesce(nullif(left(lower(btrim(coalesce(v_input->>'secret_type',''))),80),''),s.secret_type)
        else s.secret_type end,
      title = case when v_input ? 'title'
        then coalesce(nullif(left(btrim(coalesce(v_input->>'title','')),240),''),s.title)
        else s.title end,
      secret_text = case when v_input ? 'secret_text'
        then coalesce(nullif(left(btrim(coalesce(v_input->>'secret_text','')),24000),''),s.secret_text)
        else s.secret_text end,
      ai_directive = case when v_input ? 'ai_directive'
        then left(btrim(coalesce(v_input->>'ai_directive','')),12000)
        else s.ai_directive end,
      reveal_text = case when v_input ? 'reveal_text'
        then left(btrim(coalesce(v_input->>'reveal_text','')),12000)
        else s.reveal_text end,
      status = coalesce(v_status,s.status),
      importance = coalesce(v_importance,s.importance),
      tags = case when v_input ? 'tags' then v_tags else s.tags end,
      metadata = case when v_input ? 'metadata' then v_metadata else s.metadata end,
      resolution_note = case when v_input ? 'resolution_note'
        then left(btrim(coalesce(v_input->>'resolution_note','')),12000)
        else s.resolution_note end
    where s.id=v_secret_id;
  end if;

  return (
    select jsonb_build_object(
      'id',s.id,
      'location_id',s.location_id,
      'secret_key',s.secret_key,
      'secret_type',s.secret_type,
      'title',s.title,
      'secret_text',s.secret_text,
      'ai_directive',s.ai_directive,
      'reveal_text',s.reveal_text,
      'status',s.status,
      'importance',s.importance,
      'tags',to_jsonb(s.tags),
      'metadata',s.metadata,
      'resolution_note',s.resolution_note,
      'resolved_at',s.resolved_at,
      'updated_at',s.updated_at,
      'canonical_state_changed',true
    )
    from public.location_secrets s
    where s.id=v_secret_id
  );
end;
$function$;
revoke all on function public.upsert_location_secret_v1(uuid,jsonb)
from public,anon;
grant execute on function public.upsert_location_secret_v1(uuid,jsonb)
to authenticated;

CREATE OR REPLACE FUNCTION public.set_location_secret_state_v1(p_secret_id uuid, p_status text, p_resolution_note text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_location_id uuid;
  v_status text := lower(btrim(coalesce(p_status,'')));
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if v_status not in ('active','resolved','retired') then
    raise exception 'location_secret_status_invalid';
  end if;

  select s.location_id into v_location_id
  from public.location_secrets s
  where s.id=p_secret_id
  for update;

  if v_location_id is null then
    raise exception 'location_secret_not_found';
  end if;

  if not private.can_manage_location(v_location_id,v_user_id) then
    raise exception 'location_secret_manage_denied';
  end if;

  update public.location_secrets s
  set
    status=v_status,
    resolution_note=case
      when v_status='active' then ''
      else left(btrim(coalesce(p_resolution_note,'')),12000)
    end,
    resolved_at=case
      when v_status='resolved' then coalesce(s.resolved_at,now())
      when v_status='active' then null
      else s.resolved_at
    end
  where s.id=p_secret_id;

  return (
    select jsonb_build_object(
      'id',s.id,
      'location_id',s.location_id,
      'secret_key',s.secret_key,
      'status',s.status,
      'resolution_note',s.resolution_note,
      'resolved_at',s.resolved_at,
      'updated_at',s.updated_at,
      'canonical_state_changed',true
    )
    from public.location_secrets s
    where s.id=p_secret_id
  );
end;
$function$;
revoke all on function public.set_location_secret_state_v1(uuid,text,text)
from public,anon;
grant execute on function public.set_location_secret_state_v1(uuid,text,text)
to authenticated;
