create table public.character_relationships (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  subject_character_id uuid not null references public.characters(id) on delete cascade,
  target_character_id uuid not null references public.characters(id) on delete cascade,
  relationship_kind text not null default 'acquaintance',
  public_label text not null default '',
  attitude_score smallint not null default 0,
  player_note text not null default '',
  gm_note text not null default '',
  player_visible boolean not null default true,
  state text not null default 'active',
  started_at timestamptz,
  ended_at timestamptz,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint character_relationships_no_self check (subject_character_id <> target_character_id),
  constraint character_relationships_kind_not_blank check (length(btrim(relationship_kind)) > 0),
  constraint character_relationships_attitude_range check (attitude_score between -100 and 100),
  constraint character_relationships_state_check check (state in ('active','ended')),
  constraint character_relationships_end_consistency check (
    (state = 'active' and ended_at is null)
    or state = 'ended'
  ),
  constraint character_relationships_pair_unique unique (
    campaign_id,
    subject_character_id,
    target_character_id
  )
);

comment on table public.character_relationships is
  'Canonical directional character relationship state. subject_character_id is the character whose relationship/attitude is described toward target_character_id.';
comment on column public.character_relationships.relationship_kind is
  'Semantic relationship kind such as acquaintance, ally, rival, spouse, family, enemy. Intentionally open text for AI/GM extensibility.';
comment on column public.character_relationships.attitude_score is
  'Current emotional disposition from subject toward target on a -100..100 scale. Relationship kind and attitude are deliberately separate.';
comment on column public.character_relationships.player_visible is
  'When false, the relationship remains GM/AI-only and is excluded from player-safe biography reads.';
comment on column public.character_relationships.gm_note is
  'GM/AI-only note. Never returned by read_character_biography_v1.';

create index character_relationships_campaign_idx
  on public.character_relationships(campaign_id);
create index character_relationships_subject_idx
  on public.character_relationships(subject_character_id);
create index character_relationships_target_idx
  on public.character_relationships(target_character_id);
create index character_relationships_player_active_subject_idx
  on public.character_relationships(subject_character_id, updated_at desc)
  where player_visible and state = 'active';
create index character_relationships_player_active_target_idx
  on public.character_relationships(target_character_id, updated_at desc)
  where player_visible and state = 'active';

create table public.character_assets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  owner_character_id uuid not null references public.characters(id) on delete cascade,
  asset_kind text not null default 'other',
  ownership_kind text not null default 'owner',
  display_name text not null,
  description text not null default '',
  location_id uuid references public.locations(id) on delete set null,
  npc_character_id uuid references public.characters(id) on delete set null,
  inventory_item_id uuid references public.character_inventory_items(id) on delete set null,
  world_storage_id uuid references public.world_storages(id) on delete set null,
  custom_data jsonb not null default '{}'::jsonb,
  player_visible boolean not null default true,
  state text not null default 'active',
  acquired_at timestamptz,
  ended_at timestamptz,
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint character_assets_kind_not_blank check (length(btrim(asset_kind)) > 0),
  constraint character_assets_ownership_not_blank check (length(btrim(ownership_kind)) > 0),
  constraint character_assets_name_not_blank check (length(btrim(display_name)) > 0),
  constraint character_assets_single_canonical_entity check (
    num_nonnulls(location_id, npc_character_id, inventory_item_id, world_storage_id) <= 1
  ),
  constraint character_assets_state_check check (
    state in ('active','lost','sold','destroyed','ended')
  ),
  constraint character_assets_end_consistency check (
    (state = 'active' and ended_at is null)
    or state <> 'active'
  )
);

comment on table public.character_assets is
  'Canonical biography ownership/possession layer for durable assets such as homes, mounts, land, businesses, vehicles and companions. Physical item/location/NPC/storage state remains owned by its native domain table.';
comment on column public.character_assets.asset_kind is
  'Semantic asset kind such as home, mount, land, business, vehicle, companion or other. Intentionally open text.';
comment on column public.character_assets.ownership_kind is
  'Relationship to the asset such as owner, co_owner, rented, borrowed or custodian. Intentionally open text.';
comment on column public.character_assets.custom_data is
  'GM/AI extension metadata. Omitted from player-safe biography reads.';
comment on column public.character_assets.player_visible is
  'When false, the asset remains GM/AI-only and is excluded from player-safe biography reads.';

create index character_assets_campaign_idx
  on public.character_assets(campaign_id);
create index character_assets_owner_idx
  on public.character_assets(owner_character_id);
create index character_assets_location_idx
  on public.character_assets(location_id)
  where location_id is not null;
create index character_assets_npc_idx
  on public.character_assets(npc_character_id)
  where npc_character_id is not null;
create index character_assets_inventory_item_idx
  on public.character_assets(inventory_item_id)
  where inventory_item_id is not null;
create index character_assets_world_storage_idx
  on public.character_assets(world_storage_id)
  where world_storage_id is not null;
create index character_assets_player_active_owner_idx
  on public.character_assets(owner_character_id, updated_at desc)
  where player_visible and state = 'active';

create or replace function private.biography_touch_updated_at_v1()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$function$;

revoke all on function private.biography_touch_updated_at_v1() from public, anon, authenticated;

create trigger character_relationships_touch_updated_at
before update on public.character_relationships
for each row execute function private.biography_touch_updated_at_v1();

create trigger character_assets_touch_updated_at
before update on public.character_assets
for each row execute function private.biography_touch_updated_at_v1();

create or replace function private.validate_character_relationship_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_subject_campaign uuid;
  v_target_campaign uuid;
begin
  select c.campaign_id
    into v_subject_campaign
  from public.characters c
  where c.id = new.subject_character_id;

  select c.campaign_id
    into v_target_campaign
  from public.characters c
  where c.id = new.target_character_id;

  if v_subject_campaign is null or v_target_campaign is null then
    raise exception 'Relationship character not found';
  end if;

  if v_subject_campaign <> v_target_campaign
     or new.campaign_id <> v_subject_campaign then
    raise exception 'Relationship characters must belong to the relationship campaign';
  end if;

  if new.state = 'ended' and new.ended_at is null then
    new.ended_at := now();
  elsif new.state = 'active' then
    new.ended_at := null;
  end if;

  return new;
end;
$function$;

revoke all on function private.validate_character_relationship_v1() from public, anon, authenticated;

create trigger character_relationships_validate
before insert or update on public.character_relationships
for each row execute function private.validate_character_relationship_v1();

create or replace function private.validate_character_asset_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_owner_campaign uuid;
  v_entity_campaign uuid;
  v_item_character_id uuid;
  v_item_world_storage_id uuid;
begin
  select c.campaign_id
    into v_owner_campaign
  from public.characters c
  where c.id = new.owner_character_id;

  if v_owner_campaign is null then
    raise exception 'Asset owner character not found';
  end if;

  if new.campaign_id <> v_owner_campaign then
    raise exception 'Asset owner must belong to the asset campaign';
  end if;

  if new.location_id is not null then
    select l.campaign_id
      into v_entity_campaign
    from public.locations l
    where l.id = new.location_id;

    if v_entity_campaign is null or v_entity_campaign <> new.campaign_id then
      raise exception 'Asset location must belong to the asset campaign';
    end if;
  elsif new.npc_character_id is not null then
    select c.campaign_id
      into v_entity_campaign
    from public.characters c
    where c.id = new.npc_character_id;

    if v_entity_campaign is null or v_entity_campaign <> new.campaign_id then
      raise exception 'Asset NPC must belong to the asset campaign';
    end if;
  elsif new.world_storage_id is not null then
    select s.campaign_id
      into v_entity_campaign
    from public.world_storages s
    where s.id = new.world_storage_id;

    if v_entity_campaign is null or v_entity_campaign <> new.campaign_id then
      raise exception 'Asset storage must belong to the asset campaign';
    end if;
  elsif new.inventory_item_id is not null then
    select i.character_id, i.world_storage_id
      into v_item_character_id, v_item_world_storage_id
    from public.character_inventory_items i
    where i.id = new.inventory_item_id;

    if not found then
      raise exception 'Asset inventory item not found';
    end if;

    if v_item_character_id is not null then
      select c.campaign_id
        into v_entity_campaign
      from public.characters c
      where c.id = v_item_character_id;
    elsif v_item_world_storage_id is not null then
      select s.campaign_id
        into v_entity_campaign
      from public.world_storages s
      where s.id = v_item_world_storage_id;
    else
      raise exception 'Asset inventory item has no campaign-resolvable holder';
    end if;

    if v_entity_campaign is null or v_entity_campaign <> new.campaign_id then
      raise exception 'Asset inventory item must belong to the asset campaign';
    end if;
  end if;

  if new.state <> 'active' and new.ended_at is null then
    new.ended_at := now();
  elsif new.state = 'active' then
    new.ended_at := null;
  end if;

  return new;
end;
$function$;

revoke all on function private.validate_character_asset_v1() from public, anon, authenticated;

create trigger character_assets_validate
before insert or update on public.character_assets
for each row execute function private.validate_character_asset_v1();

alter table public.character_relationships enable row level security;
alter table public.character_assets enable row level security;

revoke all on table public.character_relationships from anon;
revoke all on table public.character_assets from anon;
grant select, insert, update, delete on table public.character_relationships to authenticated;
grant select, insert, update, delete on table public.character_assets to authenticated;

create policy character_relationships_manager_read
on public.character_relationships
for select
to authenticated
using (
  (select private.can_manage_character(subject_character_id))
  and (select private.can_manage_character(target_character_id))
);

create policy character_relationships_manager_insert
on public.character_relationships
for insert
to authenticated
with check (
  (select private.can_manage_character(subject_character_id))
  and (select private.can_manage_character(target_character_id))
);

create policy character_relationships_manager_update
on public.character_relationships
for update
to authenticated
using (
  (select private.can_manage_character(subject_character_id))
  and (select private.can_manage_character(target_character_id))
)
with check (
  (select private.can_manage_character(subject_character_id))
  and (select private.can_manage_character(target_character_id))
);

create policy character_relationships_manager_delete
on public.character_relationships
for delete
to authenticated
using (
  (select private.can_manage_character(subject_character_id))
  and (select private.can_manage_character(target_character_id))
);

create policy character_assets_manager_read
on public.character_assets
for select
to authenticated
using (
  (select private.can_manage_character(owner_character_id))
);

create policy character_assets_manager_insert
on public.character_assets
for insert
to authenticated
with check (
  (select private.can_manage_character(owner_character_id))
  and (location_id is null or (select private.can_view_location(location_id)))
  and (npc_character_id is null or (select private.can_view_character(npc_character_id)))
  and (world_storage_id is null or (select private.rls_can_view_world_storage_v1(world_storage_id)))
);

create policy character_assets_manager_update
on public.character_assets
for update
to authenticated
using (
  (select private.can_manage_character(owner_character_id))
)
with check (
  (select private.can_manage_character(owner_character_id))
  and (location_id is null or (select private.can_view_location(location_id)))
  and (npc_character_id is null or (select private.can_view_character(npc_character_id)))
  and (world_storage_id is null or (select private.rls_can_view_world_storage_v1(world_storage_id)))
);

create policy character_assets_manager_delete
on public.character_assets
for delete
to authenticated
using (
  (select private.can_manage_character(owner_character_id))
);

create or replace function public.read_character_biography_v1(p_character_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_character record;
  v_backstory text := '';
  v_relationships jsonb := '[]'::jsonb;
  v_assets jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not private.can_read_character_knowledge(p_character_id, v_user_id) then
    raise exception 'Not allowed';
  end if;

  select c.id, c.campaign_id, c.name, c.bio, c.avatar_url, c.character_class,
         c.level, c.character_type, c.life_state
    into v_character
  from public.characters c
  where c.id = p_character_id;

  if v_character.id is null then
    raise exception 'Character not found';
  end if;

  select coalesce(cs.backstory, '')
    into v_backstory
  from public.character_sheets cs
  where cs.character_id = p_character_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'direction',
          case when r.subject_character_id = p_character_id
            then 'from_character'
            else 'toward_character'
          end,
        'counterpart_character_id',
          case when r.subject_character_id = p_character_id
            then r.target_character_id
            else r.subject_character_id
          end,
        'counterpart_name', counterpart.name,
        'counterpart_avatar_url', counterpart.avatar_url,
        'counterpart_character_type', counterpart.character_type,
        'counterpart_life_state', counterpart.life_state,
        'relationship_kind', r.relationship_kind,
        'public_label', r.public_label,
        'attitude_score', r.attitude_score,
        'player_note', r.player_note,
        'state', r.state,
        'started_at', r.started_at,
        'ended_at', r.ended_at,
        'updated_at', r.updated_at
      )
      order by r.updated_at desc, r.created_at desc
    ),
    '[]'::jsonb
  )
  into v_relationships
  from public.character_relationships r
  join public.characters counterpart
    on counterpart.id = case
      when r.subject_character_id = p_character_id then r.target_character_id
      else r.subject_character_id
    end
  where (r.subject_character_id = p_character_id or r.target_character_id = p_character_id)
    and r.player_visible
    and private.can_view_character(counterpart.id, v_user_id);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'asset_kind', a.asset_kind,
        'ownership_kind', a.ownership_kind,
        'display_name', a.display_name,
        'description', a.description,
        'state', a.state,
        'location_id', a.location_id,
        'location_name', l.name,
        'npc_character_id', a.npc_character_id,
        'npc_name', npc.name,
        'inventory_item_id', a.inventory_item_id,
        'inventory_item_name', item.name,
        'world_storage_id', a.world_storage_id,
        'world_storage_name', storage.name,
        'acquired_at', a.acquired_at,
        'ended_at', a.ended_at,
        'updated_at', a.updated_at
      )
      order by
        case when a.state = 'active' then 0 else 1 end,
        a.updated_at desc,
        a.created_at desc
    ),
    '[]'::jsonb
  )
  into v_assets
  from public.character_assets a
  left join public.locations l on l.id = a.location_id
  left join public.characters npc on npc.id = a.npc_character_id
  left join public.character_inventory_items item on item.id = a.inventory_item_id
  left join public.world_storages storage on storage.id = a.world_storage_id
  where a.owner_character_id = p_character_id
    and a.player_visible
    and (a.location_id is null or private.can_view_location(a.location_id, v_user_id))
    and (a.npc_character_id is null or private.can_view_character(a.npc_character_id, v_user_id))
    and (
      a.world_storage_id is null
      or private.can_view_world_storage_v1(a.world_storage_id, v_user_id)
    )
    and (
      a.inventory_item_id is null
      or item.character_id = p_character_id
      or (
        item.world_storage_id is not null
        and private.can_view_world_storage_v1(item.world_storage_id, v_user_id)
      )
    );

  return jsonb_build_object(
    'character',
      jsonb_build_object(
        'id', v_character.id,
        'name', v_character.name,
        'avatar_url', v_character.avatar_url,
        'character_class', v_character.character_class,
        'level', v_character.level,
        'character_type', v_character.character_type,
        'life_state', v_character.life_state
      ),
    'history',
      jsonb_build_object(
        'bio', coalesce(v_character.bio, ''),
        'backstory', coalesce(v_backstory, '')
      ),
    'relationships', v_relationships,
    'assets', v_assets
  );
end;
$function$;

revoke all on function public.read_character_biography_v1(uuid) from public, anon;
grant execute on function public.read_character_biography_v1(uuid) to authenticated;

comment on function public.read_character_biography_v1(uuid) is
  'Player-safe biography read for the assigned character (or GM/Admin). Omits GM notes, hidden relationships/assets and custom GM metadata.';

create or replace function public.read_character_biography_manager_v1(p_character_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_character record;
  v_sheet jsonb := '{}'::jsonb;
  v_relationships jsonb := '[]'::jsonb;
  v_assets jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not private.can_manage_character(p_character_id, v_user_id) then
    raise exception 'Not allowed';
  end if;

  select c.id, c.campaign_id, c.name, c.bio, c.avatar_url, c.character_class,
         c.level, c.character_type, c.life_state, c.visibility_mode,
         c.publication_state
    into v_character
  from public.characters c
  where c.id = p_character_id;

  if v_character.id is null then
    raise exception 'Character not found';
  end if;

  select coalesce(
    jsonb_build_object(
      'race', cs.race,
      'background', cs.background,
      'alignment', cs.alignment,
      'personality_traits', cs.personality_traits,
      'ideals', cs.ideals,
      'bonds', cs.bonds,
      'flaws', cs.flaws,
      'backstory', cs.backstory,
      'notes', cs.notes
    ),
    '{}'::jsonb
  )
  into v_sheet
  from public.character_sheets cs
  where cs.character_id = p_character_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'subject_character_id', r.subject_character_id,
        'target_character_id', r.target_character_id,
        'direction',
          case when r.subject_character_id = p_character_id
            then 'from_character'
            else 'toward_character'
          end,
        'counterpart_character_id',
          case when r.subject_character_id = p_character_id
            then r.target_character_id
            else r.subject_character_id
          end,
        'counterpart_name', counterpart.name,
        'relationship_kind', r.relationship_kind,
        'public_label', r.public_label,
        'attitude_score', r.attitude_score,
        'player_note', r.player_note,
        'gm_note', r.gm_note,
        'player_visible', r.player_visible,
        'state', r.state,
        'started_at', r.started_at,
        'ended_at', r.ended_at,
        'created_by', r.created_by,
        'updated_by', r.updated_by,
        'created_at', r.created_at,
        'updated_at', r.updated_at
      )
      order by r.updated_at desc, r.created_at desc
    ),
    '[]'::jsonb
  )
  into v_relationships
  from public.character_relationships r
  join public.characters counterpart
    on counterpart.id = case
      when r.subject_character_id = p_character_id then r.target_character_id
      else r.subject_character_id
    end
  where (r.subject_character_id = p_character_id or r.target_character_id = p_character_id)
    and private.can_view_character(counterpart.id, v_user_id);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'asset_kind', a.asset_kind,
        'ownership_kind', a.ownership_kind,
        'display_name', a.display_name,
        'description', a.description,
        'state', a.state,
        'location_id', a.location_id,
        'location_name', l.name,
        'npc_character_id', a.npc_character_id,
        'npc_name', npc.name,
        'inventory_item_id', a.inventory_item_id,
        'inventory_item_name', item.name,
        'world_storage_id', a.world_storage_id,
        'world_storage_name', storage.name,
        'custom_data', a.custom_data,
        'player_visible', a.player_visible,
        'acquired_at', a.acquired_at,
        'ended_at', a.ended_at,
        'created_by', a.created_by,
        'updated_by', a.updated_by,
        'created_at', a.created_at,
        'updated_at', a.updated_at
      )
      order by
        case when a.state = 'active' then 0 else 1 end,
        a.updated_at desc,
        a.created_at desc
    ),
    '[]'::jsonb
  )
  into v_assets
  from public.character_assets a
  left join public.locations l on l.id = a.location_id
  left join public.characters npc on npc.id = a.npc_character_id
  left join public.character_inventory_items item on item.id = a.inventory_item_id
  left join public.world_storages storage on storage.id = a.world_storage_id
  where a.owner_character_id = p_character_id
    and (a.location_id is null or private.can_view_location(a.location_id, v_user_id))
    and (a.npc_character_id is null or private.can_view_character(a.npc_character_id, v_user_id))
    and (
      a.world_storage_id is null
      or private.can_view_world_storage_v1(a.world_storage_id, v_user_id)
    );

  return jsonb_build_object(
    'character',
      jsonb_build_object(
        'id', v_character.id,
        'campaign_id', v_character.campaign_id,
        'name', v_character.name,
        'avatar_url', v_character.avatar_url,
        'character_class', v_character.character_class,
        'level', v_character.level,
        'character_type', v_character.character_type,
        'life_state', v_character.life_state,
        'visibility_mode', v_character.visibility_mode,
        'publication_state', v_character.publication_state,
        'bio', coalesce(v_character.bio, '')
      ),
    'sheet', coalesce(v_sheet, '{}'::jsonb),
    'relationships', v_relationships,
    'assets', v_assets
  );
end;
$function$;

revoke all on function public.read_character_biography_manager_v1(uuid) from public, anon;
grant execute on function public.read_character_biography_manager_v1(uuid) to authenticated;

comment on function public.read_character_biography_manager_v1(uuid) is
  'GM/Admin biography read including hidden relationship/asset metadata, while still respecting private character/location visibility.';
