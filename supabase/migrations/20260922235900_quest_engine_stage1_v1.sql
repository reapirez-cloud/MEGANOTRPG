create or replace function private.can_manage_quest_campaign(
  p_campaign_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and (
      private.is_system_admin(p_user_id)
      or private.can_manage_campaign(p_campaign_id, p_user_id)
    );
$$;

create table public.quests (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  quest_key text not null,
  title text not null,
  player_brief text not null default '',
  status text not null default 'draft'
    check (status in ('draft','active','completed','failed','cancelled')),
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  activated_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(quest_key)) between 1 and 120),
  check (length(btrim(title)) between 1 and 240),
  check (length(player_brief) <= 6000),
  unique (campaign_id, quest_key)
);

create table public.quest_characters (
  quest_id uuid not null references public.quests(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  role text not null default 'participant'
    check (role in ('primary','participant')),
  created_at timestamptz not null default now(),
  primary key (quest_id, character_id)
);

create unique index quest_characters_one_primary_idx
  on public.quest_characters (quest_id)
  where role = 'primary';

create table public.quest_stages (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references public.quests(id) on delete cascade,
  stage_key text not null,
  position integer not null,
  status text not null default 'planned'
    check (status in ('planned','active','completed','failed','skipped')),
  player_title text not null default '',
  completion_text text not null default '',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(stage_key)) between 1 and 120),
  check (position >= 0),
  check (length(player_title) <= 240),
  check (length(completion_text) <= 6000),
  unique (quest_id, stage_key),
  unique (quest_id, position)
);

create table public.quest_secrets (
  quest_id uuid primary key references public.quests(id) on delete cascade,
  internal_summary text not null default '',
  gm_notes text not null default '',
  ai_directive text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(internal_summary) <= 12000),
  check (length(gm_notes) <= 24000),
  check (length(ai_directive) <= 12000)
);

create table public.quest_stage_secrets (
  stage_id uuid primary key references public.quest_stages(id) on delete cascade,
  internal_title text not null default '',
  objective text not null default '',
  gm_notes text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(internal_title) <= 240),
  check (length(objective) <= 12000),
  check (length(gm_notes) <= 24000)
);

create table public.quest_targets (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references public.quests(id) on delete cascade,
  stage_id uuid references public.quest_stages(id) on delete cascade,
  target_key text not null,
  target_kind text not null
    check (target_kind in ('location','npc','item')),
  placeholder_label text not null,
  internal_note text not null default '',
  binding_state text not null default 'placeholder'
    check (binding_state in ('placeholder','bound')),
  location_id uuid references public.locations(id) on delete set null,
  npc_character_id uuid references public.characters(id) on delete set null,
  item_definition_id uuid references public.reference_definitions(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(target_key)) between 1 and 120),
  check (length(btrim(placeholder_label)) between 1 and 240),
  check (length(internal_note) <= 12000),
  unique (quest_id, target_key)
);

create table public.quest_condition_groups (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.quest_stages(id) on delete cascade,
  group_key text not null,
  mode text not null default 'all'
    check (mode in ('all','any')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  check (length(btrim(group_key)) between 1 and 120),
  check (position >= 0),
  unique (stage_id, group_key)
);

create table public.quest_conditions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.quest_condition_groups(id) on delete cascade,
  condition_key text not null,
  condition_type text not null
    check (condition_type in (
      'visit_location',
      'discover_location',
      'meet_npc',
      'talk_to_npc',
      'discover_npc',
      'inventory_has',
      'deliver_item',
      'event_occurred',
      'character_state',
      'custom_narrative'
    )),
  target_id uuid references public.quest_targets(id) on delete restrict,
  required_quantity integer not null default 1
    check (required_quantity >= 1),
  negated boolean not null default false,
  params jsonb not null default '{}'::jsonb
    check (jsonb_typeof(params) = 'object'),
  position integer not null default 0
    check (position >= 0),
  created_at timestamptz not null default now(),
  check (length(btrim(condition_key)) between 1 and 120),
  unique (group_id, condition_key)
);

create index quests_campaign_status_idx
  on public.quests (campaign_id, status, sort_order, updated_at desc);

create index quest_characters_character_idx
  on public.quest_characters (character_id, quest_id);

create index quest_stages_quest_position_idx
  on public.quest_stages (quest_id, position);

create index quest_stages_completed_idx
  on public.quest_stages (quest_id, completed_at, position)
  where status = 'completed';

create index quest_targets_stage_idx
  on public.quest_targets (stage_id, target_kind)
  where stage_id is not null;

create index quest_targets_binding_idx
  on public.quest_targets (quest_id, binding_state, target_kind);

create index quest_condition_groups_stage_idx
  on public.quest_condition_groups (stage_id, position);

create index quest_conditions_group_idx
  on public.quest_conditions (group_id, position);

create or replace function private.can_manage_quest(
  p_quest_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.quests q
    where q.id = p_quest_id
      and private.can_manage_quest_campaign(q.campaign_id, p_user_id)
  );
$$;

create or replace function private.can_manage_quest_stage(
  p_stage_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.quest_stages qs
    where qs.id = p_stage_id
      and private.can_manage_quest(qs.quest_id, p_user_id)
  );
$$;

create or replace function private.can_manage_quest_condition_group(
  p_group_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.quest_condition_groups qcg
    where qcg.id = p_group_id
      and private.can_manage_quest_stage(qcg.stage_id, p_user_id)
  );
$$;

create or replace function private.quest_touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger quests_touch_updated_at
before update on public.quests
for each row execute function private.quest_touch_updated_at();

create trigger quest_secrets_touch_updated_at
before update on public.quest_secrets
for each row execute function private.quest_touch_updated_at();

create trigger quest_stages_touch_updated_at
before update on public.quest_stages
for each row execute function private.quest_touch_updated_at();

create trigger quest_stage_secrets_touch_updated_at
before update on public.quest_stage_secrets
for each row execute function private.quest_touch_updated_at();

create trigger quest_targets_touch_updated_at
before update on public.quest_targets
for each row execute function private.quest_touch_updated_at();

create or replace function private.quest_validate_character_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quest_campaign uuid;
  v_character_campaign uuid;
begin
  select q.campaign_id into v_quest_campaign
  from public.quests q
  where q.id = new.quest_id;

  select c.campaign_id into v_character_campaign
  from public.characters c
  where c.id = new.character_id;

  if v_quest_campaign is null or v_character_campaign is null then
    raise exception 'quest_or_character_not_found';
  end if;

  if v_quest_campaign <> v_character_campaign then
    raise exception 'quest_character_campaign_mismatch';
  end if;

  return new;
end;
$$;

create trigger quest_characters_validate_campaign
before insert or update on public.quest_characters
for each row execute function private.quest_validate_character_assignment();

create or replace function private.quest_validate_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid;
  v_stage_quest_id uuid;
  v_entity_campaign uuid;
begin
  select q.campaign_id into v_campaign_id
  from public.quests q
  where q.id = new.quest_id;

  if v_campaign_id is null then
    raise exception 'quest_not_found';
  end if;

  if new.stage_id is not null then
    select s.quest_id into v_stage_quest_id
    from public.quest_stages s
    where s.id = new.stage_id;

    if v_stage_quest_id is null or v_stage_quest_id <> new.quest_id then
      raise exception 'quest_target_stage_mismatch';
    end if;
  end if;

  if new.target_kind = 'location' then
    if new.npc_character_id is not null or new.item_definition_id is not null then
      raise exception 'quest_target_location_binding_shape_invalid';
    end if;

    if new.location_id is not null then
      select l.campaign_id into v_entity_campaign
      from public.locations l
      where l.id = new.location_id;

      if v_entity_campaign is null or v_entity_campaign <> v_campaign_id then
        raise exception 'quest_target_location_campaign_mismatch';
      end if;
      new.binding_state := 'bound';
    else
      new.binding_state := 'placeholder';
    end if;

  elsif new.target_kind = 'npc' then
    if new.location_id is not null or new.item_definition_id is not null then
      raise exception 'quest_target_npc_binding_shape_invalid';
    end if;

    if new.npc_character_id is not null then
      select c.campaign_id into v_entity_campaign
      from public.characters c
      where c.id = new.npc_character_id;

      if v_entity_campaign is null or v_entity_campaign <> v_campaign_id then
        raise exception 'quest_target_npc_campaign_mismatch';
      end if;
      new.binding_state := 'bound';
    else
      new.binding_state := 'placeholder';
    end if;

  elsif new.target_kind = 'item' then
    if new.location_id is not null or new.npc_character_id is not null then
      raise exception 'quest_target_item_binding_shape_invalid';
    end if;

    if new.item_definition_id is not null then
      select rd.campaign_id into v_entity_campaign
      from public.reference_definitions rd
      where rd.id = new.item_definition_id;

      if not found then
        raise exception 'quest_target_item_definition_not_found';
      end if;

      if v_entity_campaign is not null and v_entity_campaign <> v_campaign_id then
        raise exception 'quest_target_item_campaign_mismatch';
      end if;
      new.binding_state := 'bound';
    else
      new.binding_state := 'placeholder';
    end if;
  end if;

  return new;
end;
$$;

create trigger quest_targets_validate
before insert or update on public.quest_targets
for each row execute function private.quest_validate_target();

create or replace function private.quest_validate_condition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage_id uuid;
  v_quest_id uuid;
  v_target_quest_id uuid;
  v_target_kind text;
begin
  select qcg.stage_id, qs.quest_id
    into v_stage_id, v_quest_id
  from public.quest_condition_groups qcg
  join public.quest_stages qs on qs.id = qcg.stage_id
  where qcg.id = new.group_id;

  if v_stage_id is null or v_quest_id is null then
    raise exception 'quest_condition_group_not_found';
  end if;

  if new.target_id is not null then
    select qt.quest_id, qt.target_kind
      into v_target_quest_id, v_target_kind
    from public.quest_targets qt
    where qt.id = new.target_id;

    if v_target_quest_id is null or v_target_quest_id <> v_quest_id then
      raise exception 'quest_condition_target_mismatch';
    end if;
  end if;

  if new.condition_type in ('visit_location','discover_location') then
    if new.target_id is null or v_target_kind <> 'location' then
      raise exception 'quest_condition_location_target_required';
    end if;
  elsif new.condition_type in ('meet_npc','talk_to_npc','discover_npc') then
    if new.target_id is null or v_target_kind <> 'npc' then
      raise exception 'quest_condition_npc_target_required';
    end if;
  elsif new.condition_type in ('inventory_has','deliver_item') then
    if new.target_id is null or v_target_kind <> 'item' then
      raise exception 'quest_condition_item_target_required';
    end if;
  end if;

  return new;
end;
$$;

create trigger quest_conditions_validate
before insert or update on public.quest_conditions
for each row execute function private.quest_validate_condition();

alter table public.quests enable row level security;
alter table public.quest_characters enable row level security;
alter table public.quest_stages enable row level security;
alter table public.quest_secrets enable row level security;
alter table public.quest_stage_secrets enable row level security;
alter table public.quest_targets enable row level security;
alter table public.quest_condition_groups enable row level security;
alter table public.quest_conditions enable row level security;

create policy quests_manager_access
on public.quests
for all
to authenticated
using (private.can_manage_quest_campaign(campaign_id, (select auth.uid())))
with check (private.can_manage_quest_campaign(campaign_id, (select auth.uid())));

create policy quest_characters_manager_access
on public.quest_characters
for all
to authenticated
using (private.can_manage_quest(quest_id, (select auth.uid())))
with check (private.can_manage_quest(quest_id, (select auth.uid())));

create policy quest_stages_manager_access
on public.quest_stages
for all
to authenticated
using (private.can_manage_quest(quest_id, (select auth.uid())))
with check (private.can_manage_quest(quest_id, (select auth.uid())));

create policy quest_secrets_manager_access
on public.quest_secrets
for all
to authenticated
using (private.can_manage_quest(quest_id, (select auth.uid())))
with check (private.can_manage_quest(quest_id, (select auth.uid())));

create policy quest_stage_secrets_manager_access
on public.quest_stage_secrets
for all
to authenticated
using (private.can_manage_quest_stage(stage_id, (select auth.uid())))
with check (private.can_manage_quest_stage(stage_id, (select auth.uid())));

create policy quest_targets_manager_access
on public.quest_targets
for all
to authenticated
using (private.can_manage_quest(quest_id, (select auth.uid())))
with check (private.can_manage_quest(quest_id, (select auth.uid())));

create policy quest_condition_groups_manager_access
on public.quest_condition_groups
for all
to authenticated
using (private.can_manage_quest_stage(stage_id, (select auth.uid())))
with check (private.can_manage_quest_stage(stage_id, (select auth.uid())));

create policy quest_conditions_manager_access
on public.quest_conditions
for all
to authenticated
using (private.can_manage_quest_condition_group(group_id, (select auth.uid())))
with check (private.can_manage_quest_condition_group(group_id, (select auth.uid())));

revoke all on
  public.quests,
  public.quest_characters,
  public.quest_stages,
  public.quest_secrets,
  public.quest_stage_secrets,
  public.quest_targets,
  public.quest_condition_groups,
  public.quest_conditions
from public, anon, authenticated;

grant select, insert, update, delete on
  public.quests,
  public.quest_characters,
  public.quest_stages,
  public.quest_secrets,
  public.quest_stage_secrets,
  public.quest_targets,
  public.quest_condition_groups,
  public.quest_conditions
to authenticated;

grant select, insert, update, delete on
  public.quests,
  public.quest_characters,
  public.quest_stages,
  public.quest_secrets,
  public.quest_stage_secrets,
  public.quest_targets,
  public.quest_condition_groups,
  public.quest_conditions
to service_role;

create or replace function public.list_character_quests_v1(
  p_character_id uuid
)
returns table (
  id uuid,
  title text,
  player_brief text,
  status text,
  sort_order integer,
  activated_at timestamptz,
  closed_at timestamptz,
  completed_stages jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_can_manage boolean;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if not (
    private.is_system_admin(v_user_id)
    or private.can_read_character_knowledge(p_character_id, v_user_id)
  ) then
    raise exception 'quest_character_read_denied';
  end if;

  select private.can_manage_quest_campaign(c.campaign_id, v_user_id)
    into v_can_manage
  from public.characters c
  where c.id = p_character_id;

  if not found then
    raise exception 'character_not_found';
  end if;

  return query
  select
    q.id,
    q.title,
    q.player_brief,
    q.status,
    q.sort_order,
    q.activated_at,
    q.closed_at,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', qs.id,
          'player_title', qs.player_title,
          'completion_text', qs.completion_text,
          'completed_at', qs.completed_at,
          'position', qs.position
        )
        order by qs.position
      )
      from public.quest_stages qs
      where qs.quest_id = q.id
        and qs.status = 'completed'
    ), '[]'::jsonb) as completed_stages
  from public.quest_characters qc
  join public.quests q on q.id = qc.quest_id
  where qc.character_id = p_character_id
    and (v_can_manage or q.status <> 'draft')
  order by
    case q.status
      when 'active' then 0
      when 'completed' then 1
      when 'failed' then 2
      when 'cancelled' then 3
      else 4
    end,
    q.sort_order,
    q.updated_at desc;
end;
$$;

create or replace function public.read_quest_plan_v1(
  p_quest_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if not private.can_manage_quest(p_quest_id, v_user_id) then
    raise exception 'quest_plan_read_denied';
  end if;

  select jsonb_build_object(
    'quest', to_jsonb(q),
    'characters', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'character_id', qc.character_id,
          'role', qc.role,
          'created_at', qc.created_at
        )
        order by case qc.role when 'primary' then 0 else 1 end, qc.created_at
      )
      from public.quest_characters qc
      where qc.quest_id = q.id
    ), '[]'::jsonb),
    'secret', coalesce((
      select to_jsonb(qsec)
      from public.quest_secrets qsec
      where qsec.quest_id = q.id
    ), '{}'::jsonb),
    'stages', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', qs.id,
          'stage_key', qs.stage_key,
          'position', qs.position,
          'status', qs.status,
          'player_title', qs.player_title,
          'completion_text', qs.completion_text,
          'completed_at', qs.completed_at,
          'created_at', qs.created_at,
          'updated_at', qs.updated_at,
          'secret', coalesce((
            select to_jsonb(qss)
            from public.quest_stage_secrets qss
            where qss.stage_id = qs.id
          ), '{}'::jsonb)
        )
        order by qs.position
      )
      from public.quest_stages qs
      where qs.quest_id = q.id
    ), '[]'::jsonb),
    'targets', coalesce((
      select jsonb_agg(to_jsonb(qt) order by qt.created_at, qt.target_key)
      from public.quest_targets qt
      where qt.quest_id = q.id
    ), '[]'::jsonb),
    'condition_groups', coalesce((
      select jsonb_agg(to_jsonb(qcg) order by qs.position, qcg.position, qcg.group_key)
      from public.quest_condition_groups qcg
      join public.quest_stages qs on qs.id = qcg.stage_id
      where qs.quest_id = q.id
    ), '[]'::jsonb),
    'conditions', coalesce((
      select jsonb_agg(to_jsonb(qcnd) order by qs.position, qcg.position, qcnd.position, qcnd.condition_key)
      from public.quest_conditions qcnd
      join public.quest_condition_groups qcg on qcg.id = qcnd.group_id
      join public.quest_stages qs on qs.id = qcg.stage_id
      where qs.quest_id = q.id
    ), '[]'::jsonb)
  )
  into v_result
  from public.quests q
  where q.id = p_quest_id;

  if v_result is null then
    raise exception 'quest_not_found';
  end if;

  return v_result;
end;
$$;

revoke all on function public.list_character_quests_v1(uuid)
from public, anon, authenticated;
grant execute on function public.list_character_quests_v1(uuid)
to authenticated, service_role;

revoke all on function public.read_quest_plan_v1(uuid)
from public, anon, authenticated;
grant execute on function public.read_quest_plan_v1(uuid)
to authenticated, service_role;

comment on table public.quests is
  'Canonical player-safe quest header. Secret quest planning lives in quest_secrets and other manager-only quest tables.';

comment on table public.quest_stages is
  'Canonical quest stages. Players never read this table directly; list_character_quests_v1 exposes completed stages only.';

comment on table public.quest_targets is
  'GM/AI quest targets. A target may remain an unbound placeholder such as "Где-то в лесу" until a canonical entity exists.';

comment on table public.quest_conditions is
  'Structured Quest Engine conditions. Evaluation/resolution is implemented in a later Quest Engine stage.';
