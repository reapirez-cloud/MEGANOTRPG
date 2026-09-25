
create or replace function public.send_chat_roll_v2(
  p_room_id uuid,
  p_character_id uuid,
  p_label text,
  p_kind text,
  p_modifier integer default 0,
  p_roll_d20 boolean default true,
  p_dice_count integer default 0,
  p_dice_sides integer default 0,
  p_dice_modifier integer default 0
)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select public.send_chat_roll_v5(
    p_room_id,p_character_id,p_label,p_kind,p_modifier,p_roll_d20,
    p_dice_count,p_dice_sides,p_dice_modifier,1,'[]'::jsonb,
    'normal','[]'::jsonb
  )
$$;

create or replace function public.send_chat_roll_v3(
  p_room_id uuid,
  p_character_id uuid,
  p_label text,
  p_kind text,
  p_modifier integer default 0,
  p_roll_d20 boolean default true,
  p_dice_count integer default 0,
  p_dice_sides integer default 0,
  p_dice_modifier integer default 0,
  p_resource_costs jsonb default '[]'::jsonb
)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select public.send_chat_roll_v5(
    p_room_id,p_character_id,p_label,p_kind,p_modifier,p_roll_d20,
    p_dice_count,p_dice_sides,p_dice_modifier,1,p_resource_costs,
    'normal','[]'::jsonb
  )
$$;
