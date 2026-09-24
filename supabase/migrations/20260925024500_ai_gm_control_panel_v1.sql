create or replace function public.read_ai_gm_control_panel_v1(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_ai_world boolean;
  v_can_manage boolean;
  v_behavior jsonb;
  v_director jsonb;
  v_content jsonb;
  v_gm_models jsonb := '[]'::jsonb;
  v_junior_models jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if not private.is_campaign_member(p_campaign_id,v_user_id) then
    raise exception 'campaign_membership_required';
  end if;

  v_ai_world := private.is_ai_world_campaign_v1(p_campaign_id);
  v_can_manage := private.is_campaign_manager(p_campaign_id,v_user_id);

  if not v_ai_world then
    return jsonb_build_object(
      'campaign_id',p_campaign_id,
      'ai_world',false,
      'can_manage',v_can_manage,
      'gm_models','[]'::jsonb,
      'junior_models','[]'::jsonb,
      'behavior',null,
      'director',null,
      'content',null,
      'features','[]'::jsonb
    );
  end if;

  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)
    into v_gm_models
  from public.list_campaign_gm_models_v1(p_campaign_id) x;

  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)
    into v_junior_models
  from public.list_campaign_ai_junior_models_v1(p_campaign_id) x;

  v_behavior := public.list_campaign_ai_gm_behavior_profiles_v1(p_campaign_id);
  v_director := public.read_my_ai_director_preferences_v1(p_campaign_id);
  v_content := public.list_campaign_ai_gm_content_profiles_v1(p_campaign_id);

  return jsonb_build_object(
    'campaign_id',p_campaign_id,
    'ai_world',true,
    'can_manage',v_can_manage,
    'gm_models',v_gm_models,
    'junior_models',v_junior_models,
    'behavior',v_behavior,
    'director',v_director,
    'content',v_content,
    'features',jsonb_build_array(
      jsonb_build_object(
        'key','server_resolver',
        'display_name','Серверные броски и Resolver',
        'summary','Кубы, decision_key и причинные проверки фиксируются сервером до результата.',
        'state','always_on'
      ),
      jsonb_build_object(
        'key','junior_commit',
        'display_name','Младший шуршальщик',
        'summary','После ответа главного ИИ материализует уже объявленный канон: NPC, локации, квесты, связи и состояние.',
        'state','always_on'
      ),
      jsonb_build_object(
        'key','background_world',
        'display_name','Живой фон мира',
        'summary','Мир развивается между сценами через дневной Resolver и компактные снапшоты.',
        'state','always_on'
      ),
      jsonb_build_object(
        'key','npc_identity',
        'display_name','Память личности NPC',
        'summary','Характер, ценности, красные линии и отношения NPC остаются устойчивыми и версионируются.',
        'state','always_on'
      ),
      jsonb_build_object(
        'key','coop_sync',
        'display_name','Кооператив и время',
        'summary','ИИ различает разделённые группы, синхронизирует встретившихся персонажей и не перехватывает диалог игроков.',
        'state','always_on'
      ),
      jsonb_build_object(
        'key','bounded_context',
        'display_name','Ограниченный контекст',
        'summary','Главный ИИ получает последние релевантные сообщения плюс компактный канон, а не весь архив инструментов.',
        'state','always_on'
      ),
      jsonb_build_object(
        'key','maintenance',
        'display_name','Архивация и память',
        'summary','Длинная история сворачивается в факты и сводки без потери канонических событий.',
        'state','always_on'
      ),
      jsonb_build_object(
        'key','media_pipeline',
        'display_name','Медиа-пайплайн',
        'summary','Арты NPC и локаций создаются по игровым триггерам, предметы — по запросу, без блокировки основного ответа.',
        'state','triggered'
      )
    )
  );
end;
$function$;

revoke all on function public.read_ai_gm_control_panel_v1(uuid) from public, anon;
grant execute on function public.read_ai_gm_control_panel_v1(uuid) to authenticated;
