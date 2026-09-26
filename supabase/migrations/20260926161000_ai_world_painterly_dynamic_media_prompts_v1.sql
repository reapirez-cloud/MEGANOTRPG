-- Keep Stage 9 NPC/location prompts aligned with the AI-world slot visual policy.
-- The slot owns rendering language; target-specific prompts only describe subject/composition.

do $patch$
declare
  v_oid oid;
  v_def text;
  v_next text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private'
    and p.proname='queue_ai_gm_media_target_v2'
    and pg_get_function_identity_arguments(p.oid)=
      'p_target_type text, p_target_id uuid, p_trigger_kind text, p_source_character_id uuid, p_source_room_id uuid, p_publication_key text';

  if v_oid is null then
    raise exception 'queue_ai_gm_media_target_v2_not_found';
  end if;

  v_def:=pg_get_functiondef(v_oid);
  v_next:=v_def;

  v_next:=replace(
    v_next,
    'Composition: single-character portrait, grounded dark fantasy, readable face and silhouette, graphite atmosphere, no text, no UI, no watermark.',
    'Composition: single-character portrait in the campaign visual style supplied by the AI-world slot; intentionally illustrated painterly fantasy, strong graphic shape design, matte grouped skin tones, readable face and silhouette, cinematic natural light, atmospheric depth, no photorealism, no 3D-render look, no text, no UI, no watermark.'
  );

  v_next:=replace(
    v_next,
    'Composition: wide cinematic establishing scene, polished semi-realistic vector dark-fantasy art, deep readable environment, coherent architecture and terrain, atmospheric depth, no text, no UI, no watermark.',
    'Composition: wide cinematic establishing scene in the campaign visual style supplied by the AI-world slot; stylized painterly fantasy illustration with graphic shape discipline, deep readable environment, coherent architecture and terrain, atmospheric depth, no photorealism, no 3D-render look, no text, no UI, no watermark.'
  );

  if v_next=v_def then
    if position('campaign visual style supplied by the AI-world slot' in v_def)>0 then
      return;
    end if;
    raise exception 'dynamic_media_prompt_patch_target_not_found';
  end if;

  execute v_next;
end;
$patch$;
