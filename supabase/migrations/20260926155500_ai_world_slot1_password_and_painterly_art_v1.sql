-- First AI-world slot gets a second lock; AI-world art switches to a
-- stylized painterly/vector-inspired illustration language.

create or replace function public.open_ai_world_slot_v2(p_slot_id uuid)
returns table(campaign_id uuid, role text, is_owner boolean, active_character_id uuid)
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_slot public.ai_world_slots%rowtype;
  v_campaign_id uuid;
  v_title text;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;
  if p_slot_id is null then
    raise exception 'slot_required';
  end if;

  select *
    into v_slot
  from public.ai_world_slots s
  where s.id=p_slot_id
    and s.owner_user_id=v_user_id
  for update;

  if v_slot.id is null then
    raise exception 'ai_world_slot_not_found';
  end if;

  -- v2 remains callable for old clients, but may not bypass room 01.
  if v_slot.slot_index=1 then
    raise exception 'ai_world_slot_access_code_required';
  end if;

  v_title:=coalesce(
    nullif(btrim(v_slot.name),''),
    'ИИ мир · Слот ' || lpad(v_slot.slot_index::text,2,'0')
  );
  v_campaign_id:=v_slot.campaign_id;

  if v_campaign_id is null then
    insert into public.campaigns(slug,title,summary,rules_summary)
    values(
      'ai-world-' || replace(v_slot.id::text,'-',''),
      v_title,'',''
    )
    returning id into v_campaign_id;

    update public.ai_world_slots
    set campaign_id=v_campaign_id,updated_at=now()
    where id=v_slot.id;
  else
    update public.campaigns
    set title=v_title
    where id=v_campaign_id;
  end if;

  insert into public.campaign_members(campaign_id,user_id,role,is_owner)
  values(v_campaign_id,v_user_id,'player',true)
  on conflict on constraint campaign_members_pkey do update set
    role='player',
    is_owner=true;

  return query
  select cm.campaign_id,cm.role,cm.is_owner,cm.active_character_id
  from public.campaign_members cm
  where cm.campaign_id=v_campaign_id
    and cm.user_id=v_user_id;
end;
$function$;

create or replace function public.open_ai_world_slot_v3(
  p_slot_id uuid,
  p_access_code text default null
)
returns table(campaign_id uuid, role text, is_owner boolean, active_character_id uuid)
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_slot public.ai_world_slots%rowtype;
  v_campaign_id uuid;
  v_title text;
  v_code_hash text;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;
  if p_slot_id is null then
    raise exception 'slot_required';
  end if;

  select *
    into v_slot
  from public.ai_world_slots s
  where s.id=p_slot_id
    and s.owner_user_id=v_user_id
  for update;

  if v_slot.id is null then
    raise exception 'ai_world_slot_not_found';
  end if;

  if v_slot.slot_index=1 then
    v_code_hash:=encode(
      extensions.digest(coalesce(p_access_code,''),'sha256'),
      'hex'
    );
    if v_code_hash <> '9d693eeee1d1899cbc50b6d45df953d3835acf28ee869879b45565fccc814765' then
      raise exception 'ai_world_slot_access_code_invalid';
    end if;
  end if;

  v_title:=coalesce(
    nullif(btrim(v_slot.name),''),
    'ИИ мир · Слот ' || lpad(v_slot.slot_index::text,2,'0')
  );
  v_campaign_id:=v_slot.campaign_id;

  if v_campaign_id is null then
    insert into public.campaigns(slug,title,summary,rules_summary)
    values(
      'ai-world-' || replace(v_slot.id::text,'-',''),
      v_title,'',''
    )
    returning id into v_campaign_id;

    update public.ai_world_slots
    set campaign_id=v_campaign_id,updated_at=now()
    where id=v_slot.id;
  else
    update public.campaigns
    set title=v_title
    where id=v_campaign_id;
  end if;

  insert into public.campaign_members(campaign_id,user_id,role,is_owner)
  values(v_campaign_id,v_user_id,'player',true)
  on conflict on constraint campaign_members_pkey do update set
    role='player',
    is_owner=true;

  return query
  select cm.campaign_id,cm.role,cm.is_owner,cm.active_character_id
  from public.campaign_members cm
  where cm.campaign_id=v_campaign_id
    and cm.user_id=v_user_id;
end;
$function$;

revoke all on function public.open_ai_world_slot_v3(uuid,text)
  from public,anon;
grant execute on function public.open_ai_world_slot_v3(uuid,text)
  to authenticated,service_role;

alter table public.ai_world_slots
  alter column image_base_prompt set default 'Stylized painterly digital fantasy illustration with vector-inspired shape discipline, not photorealism. Build the image from clean readable silhouettes, confident simplified shapes, clear value groups, elegant facial planes, and selective detail. Use softly hand-painted matte surfaces, subtle brush texture, gentle color transitions, controlled edges, soft atmospheric shadows, and a few crisp accents instead of photographic micro-detail. Faces must look intentionally illustrated: natural but slightly stylized proportions, smooth grouped skin tones, expressive eyes, and believable anatomy without skin pores, hyperreal eye reflections, waxy 3D skin, plastic rendering, photographic texture, or uncanny-valley realism. Hair should read as grouped painted locks and graphic masses with selective strands, never as photo-simulated individual hairs. Use cinematic natural lighting with warm sunlight or practical light against deep soft shadows, muted earthy dark-fantasy colors such as moss green, olive, charcoal, umber, muted gold and cool shadow tones. Environments should be lush, atmospheric and readable, with depth created through values, haze and layered shapes rather than texture noise. Aim for premium hand-painted fantasy editorial/concept illustration with a subtle vector-like graphic structure: painterly, elegant, moody, stylized and cohesive, never flat SVG clip-art. Avoid photorealism, hyperreal concept art, 3D render aesthetics, glossy skin, excessive sharpness, noisy pores, oversharpened fabric, anime/chibi styling, pixel art, cheap cartoon icons, readable text, watermarks and logos. Preserve the requested subject, canon, mood, composition, location identity and character identity as the primary content.';

update public.ai_world_slots
set image_quality='low',
    image_base_prompt='Stylized painterly digital fantasy illustration with vector-inspired shape discipline, not photorealism. Build the image from clean readable silhouettes, confident simplified shapes, clear value groups, elegant facial planes, and selective detail. Use softly hand-painted matte surfaces, subtle brush texture, gentle color transitions, controlled edges, soft atmospheric shadows, and a few crisp accents instead of photographic micro-detail. Faces must look intentionally illustrated: natural but slightly stylized proportions, smooth grouped skin tones, expressive eyes, and believable anatomy without skin pores, hyperreal eye reflections, waxy 3D skin, plastic rendering, photographic texture, or uncanny-valley realism. Hair should read as grouped painted locks and graphic masses with selective strands, never as photo-simulated individual hairs. Use cinematic natural lighting with warm sunlight or practical light against deep soft shadows, muted earthy dark-fantasy colors such as moss green, olive, charcoal, umber, muted gold and cool shadow tones. Environments should be lush, atmospheric and readable, with depth created through values, haze and layered shapes rather than texture noise. Aim for premium hand-painted fantasy editorial/concept illustration with a subtle vector-like graphic structure: painterly, elegant, moody, stylized and cohesive, never flat SVG clip-art. Avoid photorealism, hyperreal concept art, 3D render aesthetics, glossy skin, excessive sharpness, noisy pores, oversharpened fabric, anime/chibi styling, pixel art, cheap cartoon icons, readable text, watermarks and logos. Preserve the requested subject, canon, mood, composition, location identity and character identity as the primary content.',
    updated_at=now();
