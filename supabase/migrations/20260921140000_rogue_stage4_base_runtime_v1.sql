-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:rogue
-- CLASS_PACKAGE_TEST: tests/rogueRuntimeStage4Base.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: rogue:stage4=BASE_RUNTIME_CERTIFIED;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Rogue Stage 4. Completes and certifies the base Rogue 1-20 runtime while
-- deliberately leaving the public Rogue family non-READY until all subclasses
-- and final Stage 7 certification exist.

begin;

-- ---------------------------------------------------------------------------
-- Generic authoritative d20 floor. This is not Rogue-owned: any resolved rule
-- may request a floor and the client passes that floor to this server roll path.
-- ---------------------------------------------------------------------------

create or replace function public.send_chat_roll_v4(
  p_room_id uuid,
  p_character_id uuid,
  p_label text,
  p_kind text,
  p_modifier integer default 0,
  p_roll_d20 boolean default true,
  p_dice_count integer default 0,
  p_dice_sides integer default 0,
  p_dice_modifier integer default 0,
  p_d20_floor integer default 1,
  p_resource_costs jsonb default '[]'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_d20_raw integer;
  v_d20 integer;
  v_total integer;
  v_roll integer;
  v_rolls integer[] := '{}';
  v_dice_total integer := 0;
  v_id bigint;
  i integer;
  v_payload jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_write_chat_room(p_room_id,auth.uid()) then
    raise exception 'Нет права писать в этот чат';
  end if;
  if length(trim(coalesce(p_label,'')))=0 then raise exception 'Roll label is required'; end if;
  if p_modifier < -500 or p_modifier > 500 or p_dice_modifier < -500 or p_dice_modifier > 500 then
    raise exception 'Modifier is out of range';
  end if;
  if p_dice_count < 0 or p_dice_count > 40 then raise exception 'Dice count is out of range'; end if;
  if p_dice_count > 0 and (p_dice_sides < 2 or p_dice_sides > 1000) then
    raise exception 'Die sides are out of range';
  end if;
  if not p_roll_d20 and p_dice_count=0 then raise exception 'Roll must contain at least one die'; end if;
  if p_d20_floor < 1 or p_d20_floor > 20 then raise exception 'D20 floor is out of range'; end if;
  if not p_roll_d20 and p_d20_floor<>1 then raise exception 'D20 floor requires a d20 roll'; end if;

  perform private.consume_character_resource_costs(
    p_character_id,
    coalesce(p_resource_costs,'[]'::jsonb),
    auth.uid()
  );

  if p_roll_d20 then
    v_d20_raw:=floor(random()*20+1)::integer;
    v_d20:=greatest(v_d20_raw,p_d20_floor);
    v_total:=v_d20+p_modifier;
  end if;

  if p_dice_count>0 then
    for i in 1..p_dice_count loop
      v_roll:=floor(random()*p_dice_sides+1)::integer;
      v_rolls:=array_append(v_rolls,v_roll);
      v_dice_total:=v_dice_total+v_roll;
    end loop;
    v_dice_total:=v_dice_total+p_dice_modifier;
  end if;

  v_payload:=jsonb_build_object(
      'label',trim(p_label),
      'kind',coalesce(nullif(trim(p_kind),''),'roll'),
      'modifier',p_modifier,
      'rollD20',p_roll_d20
    )
    || case when p_roll_d20 then jsonb_build_object(
      'd20Raw',v_d20_raw,
      'd20',v_d20,
      'd20Floor',p_d20_floor,
      'total',v_total
    ) else '{}'::jsonb end
    || case when p_dice_count>0 then jsonb_build_object(
      'effect',jsonb_build_object(
        'count',p_dice_count,
        'sides',p_dice_sides,
        'rolls',to_jsonb(v_rolls),
        'modifier',p_dice_modifier,
        'total',v_dice_total
      )
    ) else '{}'::jsonb end
    || case when jsonb_array_length(coalesce(p_resource_costs,'[]'::jsonb))>0
      then jsonb_build_object('resourceCosts',p_resource_costs)
      else '{}'::jsonb
    end;

  insert into public.chat_messages(
    room_id,character_id,body,event_kind,event_payload
  ) values(
    p_room_id,p_character_id,'','roll',v_payload
  )
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.send_chat_roll_v4(
  uuid,uuid,text,text,integer,boolean,integer,integer,integer,integer,jsonb
) from public,anon;
grant execute on function public.send_chat_roll_v4(
  uuid,uuid,text,text,integer,boolean,integer,integer,integer,integer,jsonb
) to authenticated,service_role;

comment on function public.send_chat_roll_v4(
  uuid,uuid,text,text,integer,boolean,integer,integer,integer,integer,jsonb
) is
'GENA generic roll path with an optional server-enforced raw-d20 floor.';

-- ---------------------------------------------------------------------------
-- Rogue Stage 4 runtime.
-- ---------------------------------------------------------------------------

create or replace function private.ensure_rogue_stage4_base_runtime_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_rogue uuid;
begin
  select id into v_rogue
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:rogue'
    and is_active
  order by version desc,created_at desc
  limit 1;

  if v_rogue is null then raise exception 'ROGUE_STAGE4_CLASS_MISSING:%',p_campaign_id; end if;

  if not exists(
    select 1 from public.rule_templates
    where id=v_rogue
      and catalog_revision in (
        'xphb-2024-rogue-stage3-core-runtime-v1',
        'xphb-2024-rogue-stage4-base-runtime-v1'
      )
  ) then
    raise exception 'ROGUE_STAGE4_REQUIRES_STAGE3:%',p_campaign_id;
  end if;

  -- Level 5 — Uncanny Dodge.
  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,5,
    private.rogue_stage3_feature_v1(
      'rogue-uncanny-dodge-feature-l5',
      'uncanny-dodge',
      'class:rogue:uncanny-dodge:l5',
      'Невероятное уклонение',
      'Когда видимый вами атакующий попадает по вам броском атаки, вы можете Реакцией уменьшить урон этой атаки вдвое, округляя вниз.',
      jsonb_build_object(
        'kind','incoming_attack_damage_rule',
        'trigger','visible_attacker_hits_with_attack_roll',
        'economy','reaction',
        'multiplierNumerator',1,
        'multiplierDenominator',2,
        'round','down',
        'adjudication','gm'
      )
    )
  );

  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,5,
    private.rogue_stage3_action_v1(
      'rogue-uncanny-dodge-action',
      'uncanny-dodge',
      'rogue_uncanny_dodge',
      'Невероятное уклонение',
      'reaction',
      jsonb_build_array(
        jsonb_build_object(
          'kind','semantic',
          'key','incoming_attack_damage_multiplier',
          'payload',jsonb_build_object(
            'numerator',1,
            'denominator',2,
            'round','down',
            'trigger','visible_attacker_hits_with_attack_roll',
            'adjudication','gm'
          )
        )
      ),
      jsonb_build_array('rogue','reaction','damage_reduction','gm_scene_requirement')
    )
  );

  -- Level 7 — Evasion and Reliable Talent.
  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,7,
    private.rogue_stage3_feature_v1(
      'rogue-evasion-feature-l7',
      'evasion',
      'class:rogue:evasion:l7',
      'Увёртливость',
      'Когда эффект позволяет сделать спасбросок Ловкости, чтобы при успехе получить половину урона, вы вместо этого не получаете урона при успехе и получаете половину при провале. Способность не работает, пока вы Недееспособны.',
      jsonb_build_object(
        'kind','saving_throw_damage_rule',
        'ability','dexterity',
        'trigger','half_damage_on_success',
        'successDamageNumerator',0,
        'successDamageDenominator',1,
        'failureDamageNumerator',1,
        'failureDamageDenominator',2,
        'disabledCondition','incapacitated',
        'adjudication','combat_resolution_owner'
      )
    )
  );

  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,7,
    private.rogue_stage3_feature_v1(
      'rogue-reliable-talent-feature-l7',
      'reliable-talent',
      'class:rogue:reliable-talent:l7',
      'Надёжный талант',
      'Когда вы совершаете проверку характеристики, использующую навык или инструмент, которым владеете, результат d20 9 или ниже считается равным 10.',
      jsonb_build_object(
        'kind','d20_minimum',
        'minimum',10,
        'testKinds',jsonb_build_array('skill','tool'),
        'requiresProficiency',true,
        'appliesToRawD20',true
      )
    )
  );

  -- Level 15 — Slippery Mind is fully deterministic CE proficiency state.
  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,15,
    private.rogue_stage3_feature_v1(
      'rogue-slippery-mind-feature-l15',
      'slippery-mind',
      'class:rogue:slippery-mind:l15',
      'Скользкий ум',
      'Вы получаете владение спасбросками Мудрости и Харизмы.',
      jsonb_build_object(
        'kind','saving_throw_proficiency_grant',
        'abilities',jsonb_build_array('wisdom','charisma')
      )
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,15,
    jsonb_build_object(
      'id','rogue-slippery-mind-wisdom-save',
      'type','grant',
      'sourceKey','slippery-mind',
      'target','proficiency',
      'key','savingThrow:wisdom',
      'payload',jsonb_build_object('rank',1,'label','Спасбросок: Мудрость')
    )
  );
  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,15,
    jsonb_build_object(
      'id','rogue-slippery-mind-charisma-save',
      'type','grant',
      'sourceKey','slippery-mind',
      'target','proficiency',
      'key','savingThrow:charisma',
      'payload',jsonb_build_object('rank',1,'label','Спасбросок: Харизма')
    )
  );

  -- Level 18 — Elusive. Attack advantage itself is scene/combat state, so the
  -- shared rule contract is authoritative without inventing a target tracker.
  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,18,
    private.rogue_stage3_feature_v1(
      'rogue-elusive-feature-l18',
      'elusive',
      'class:rogue:elusive:l18',
      'Неуловимый',
      'Ни один бросок атаки против вас не может иметь Преимущество, пока вы не Недееспособны.',
      jsonb_build_object(
        'kind','attack_advantage_rule',
        'againstSelf',true,
        'advantageForbidden',true,
        'disabledCondition','incapacitated',
        'adjudication','combat_resolution_owner'
      )
    )
  );

  -- Level 20 — Stroke of Luck: one real persistent use, restored on either rest.
  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,20,
    private.rogue_stage3_feature_v1(
      'rogue-stroke-of-luck-feature-l20',
      'stroke-of-luck',
      'class:rogue:stroke-of-luck:l20',
      'Мастерский удар',
      'Когда вы проваливаете D20 Test, вы можете превратить результат броска d20 в 20. После применения способность восстанавливается после короткого или долгого отдыха. Для атаки результат 20 имеет обычные последствия результата 20.',
      jsonb_build_object(
        'kind','d20_result_override',
        'trigger','failed_d20_test',
        'result',20,
        'attackUsesNatural20Consequences',true,
        'usesResourceKey','rogue_stroke_of_luck',
        'adjudication','gm'
      )
    )
  );

  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,20,
    jsonb_build_object(
      'id','rogue-stroke-of-luck-resource',
      'type','resource',
      'sourceKey','stroke-of-luck',
      'key','rogue_stroke_of_luck',
      'label','Мастерский удар',
      'max',1,
      'recharge',jsonb_build_array('short_rest','long_rest'),
      'initial','full',
      'grantOperation','REPLACE',
      'priority',20,
      'presentation',jsonb_build_object(
        'icon','◆','tone','neutral','display','pips','priority',95
      )
    )
  );

  perform private.rogue_stage3_upsert_level_mechanic_v1(
    v_rogue,20,
    jsonb_build_object(
      'id','rogue-stroke-of-luck-action',
      'type','action',
      'sourceKey','stroke-of-luck',
      'key','rogue_stroke_of_luck_override',
      'label','Мастерский удар: результат 20',
      'economy','triggered',
      'range',jsonb_build_object('kind','self'),
      'resourceCosts',jsonb_build_array(jsonb_build_object(
        'key','rogue_stroke_of_luck','amount',1
      )),
      'requirements',jsonb_build_array(jsonb_build_object(
        'kind','state',
        'key','failed_d20_test',
        'enforcement','gm',
        'label','Используйте только после проваленного D20 Test'
      )),
      'effects',jsonb_build_array(jsonb_build_object(
        'kind','semantic',
        'key','d20_result_override',
        'payload',jsonb_build_object(
          'result',20,
          'trigger','failed_d20_test',
          'attackUsesNatural20Consequences',true,
          'adjudication','gm'
        )
      )),
      'tags',jsonb_build_array(
        'rogue','d20','failed-d20-test','result-override','gm-confirmed'
      ),
      'presentation',jsonb_build_object(
        'icon','◆','tone','neutral','priority',100
      )
    )
  );

  update public.rule_templates
  set
    catalog_revision='xphb-2024-rogue-stage4-base-runtime-v1',
    mechanical_summary='Разбойник 2024: полный базовый runtime 1–20 через общий Choice Runtime, CE и GENA. Надёжный талант использует общий серверный d20-floor; Мастерский удар — реальный ресурс с Short/Long Rest recovery и GM-confirmed override события.',
    rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
      'mechanics_status','IN_PROGRESS_STAGE4_BASE_RUNTIME_CERTIFIED',
      'runtime_stage',4,
      'runtime_revision','xphb-2024-rogue-stage4-base-runtime-v1',
      'base_runtime_certified',true,
      'base_runtime_levels','1-20',
      'reference_only_until_final_certification',true,
      'uncanny_dodge_runtime','structured_reaction',
      'evasion_runtime','structured_passive',
      'reliable_talent_runtime','generic_server_d20_floor',
      'slippery_mind_runtime','native_save_proficiencies',
      'elusive_runtime','structured_passive',
      'stroke_of_luck_runtime','persistent_resource_plus_gm_confirmed_d20_override',
      'stroke_of_luck_resource_key','rogue_stroke_of_luck',
      'generic_feat_hooks_status','STRUCTURED_MARKERS_EXIST_PROJECT_WIDE_EXECUTOR_OUTSIDE_ROGUE',
      'remaining_base_runtime_pending_stage4',false,
      'subclass_runtime_included',false,
      'next_stage','rogue_phb2024_subclasses_runtime'
    ),
    updated_at=now()
  where id=v_rogue;
end;
$function$;

revoke all on function private.ensure_rogue_stage4_base_runtime_v1(uuid)
from public,anon,authenticated;
grant execute on function private.ensure_rogue_stage4_base_runtime_v1(uuid)
to service_role;

create or replace function private.ensure_rogue_stage4_base_runtime_v1_after_campaign()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.ensure_rogue_stage4_base_runtime_v1(new.id);
  return new;
end;
$function$;

revoke all on function private.ensure_rogue_stage4_base_runtime_v1_after_campaign()
from public,anon,authenticated;

drop trigger if exists o_campaigns_ensure_rogue_stage4_base_runtime_v1 on public.campaigns;
create trigger o_campaigns_ensure_rogue_stage4_base_runtime_v1
after insert on public.campaigns
for each row execute function private.ensure_rogue_stage4_base_runtime_v1_after_campaign();

do $apply$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.ensure_rogue_stage4_base_runtime_v1(r.id);
  end loop;
end;
$apply$;

-- ---------------------------------------------------------------------------
-- Fail-closed base-class certification.
-- ---------------------------------------------------------------------------

do $cert$
declare
  r record;
  v_bad integer;
  v_count integer;
begin
  for r in
    select id,campaign_id,catalog_revision,rules_meta
    from public.rule_templates
    where kind='class' and catalog_key='class:rogue' and is_active
  loop
    if r.catalog_revision<>'xphb-2024-rogue-stage4-base-runtime-v1' then
      raise exception 'ROGUE_STAGE4_BAD_REVISION:%:%',r.campaign_id,r.catalog_revision;
    end if;
    if r.rules_meta->>'mechanics_status'<>'IN_PROGRESS_STAGE4_BASE_RUNTIME_CERTIFIED'
       or coalesce((r.rules_meta->>'runtime_stage')::integer,0)<>4
       or coalesce((r.rules_meta->>'base_runtime_certified')::boolean,false)<>true
       or coalesce((r.rules_meta->>'subclass_runtime_included')::boolean,true)
    then
      raise exception 'ROGUE_STAGE4_BAD_STATUS:%',r.campaign_id;
    end if;

    select count(*) into v_count
    from public.rule_template_levels
    where template_id=r.id;
    if v_count<>20 then raise exception 'ROGUE_STAGE4_LEVEL_COUNT:%:%',r.campaign_id,v_count; end if;

    -- All 15 canonical base feature source keys must now resolve as structured
    -- feature rules somewhere in the 1-20 parent package.
    select count(*) into v_bad
    from (values
      ('sneak-attack'),('expertise'),('thieves-cant'),('weapon-mastery'),
      ('cunning-action'),('steady-aim'),('cunning-strike'),('uncanny-dodge'),
      ('evasion'),('reliable-talent'),('improved-cunning-strike'),
      ('devious-strikes'),('slippery-mind'),('elusive'),('stroke-of-luck')
    ) expected(source_key)
    where not exists(
      select 1
      from public.rule_template_levels l
      cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
      where l.template_id=r.id
        and m.value->>'type'='grant'
        and m.value->>'target'='feature'
        and m.value->>'sourceKey'=expected.source_key
        and jsonb_typeof(m.value#>'{payload,mechanic}')='object'
        and nullif(m.value#>>'{payload,mechanic,kind}','') is not null
    );
    if v_bad<>0 then raise exception 'ROGUE_STAGE4_BASE_FEATURE_GAP:%:%',r.campaign_id,v_bad; end if;

    -- Deterministic Slippery Mind contribution.
    select count(*) into v_count
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where l.template_id=r.id
      and l.level=15
      and m.value->>'type'='grant'
      and m.value->>'target'='proficiency'
      and m.value->>'key' in ('savingThrow:wisdom','savingThrow:charisma');
    if v_count<>2 then raise exception 'ROGUE_STAGE4_SLIPPERY_MIND_INVALID:%:%',r.campaign_id,v_count; end if;

    if not exists(
      select 1
      from public.rule_template_levels l
      cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
      where l.template_id=r.id
        and l.level=7
        and m.value->>'id'='rogue-reliable-talent-feature-l7'
        and m.value#>>'{payload,mechanic,kind}'='d20_minimum'
        and (m.value#>>'{payload,mechanic,minimum}')::integer=10
        and coalesce((m.value#>>'{payload,mechanic,requiresProficiency}')::boolean,false)
    ) then
      raise exception 'ROGUE_STAGE4_RELIABLE_TALENT_INVALID:%',r.campaign_id;
    end if;

    if not exists(
      select 1
      from public.rule_template_levels l
      cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
      where l.template_id=r.id
        and l.level=20
        and m.value->>'type'='resource'
        and m.value->>'key'='rogue_stroke_of_luck'
        and (m.value->>'max')::integer=1
        and m.value->'recharge' @> '["short_rest","long_rest"]'::jsonb
    ) then
      raise exception 'ROGUE_STAGE4_STROKE_RESOURCE_INVALID:%',r.campaign_id;
    end if;

    if not exists(
      select 1
      from public.rule_template_levels l
      cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
      cross join lateral jsonb_array_elements(coalesce(m.value->'effects','[]'::jsonb)) e(value)
      where l.template_id=r.id
        and l.level=20
        and m.value->>'id'='rogue-stroke-of-luck-action'
        and m.value->>'type'='action'
        and e.value->>'kind'='semantic'
        and e.value->>'key'='d20_result_override'
        and (e.value#>>'{payload,result}')::integer=20
    ) then
      raise exception 'ROGUE_STAGE4_STROKE_ACTION_INVALID:%',r.campaign_id;
    end if;

    if exists(
      select 1
      from public.rule_templates s
      where s.campaign_id=r.campaign_id
        and s.kind='subclass'
        and s.is_active
        and (s.parent_template_id=r.id or s.catalog_key like 'subclass:rogue:%' or s.slug like 'rogue-%')
    ) then
      raise exception 'ROGUE_STAGE4_SUBCLASS_RUNTIME_LEAK:%',r.campaign_id;
    end if;
  end loop;

  if to_regprocedure(
    'public.send_chat_roll_v4(uuid,uuid,text,text,integer,boolean,integer,integer,integer,integer,jsonb)'
  ) is null then
    raise exception 'ROGUE_STAGE4_D20_FLOOR_RPC_MISSING';
  end if;
end;
$cert$;

commit;
