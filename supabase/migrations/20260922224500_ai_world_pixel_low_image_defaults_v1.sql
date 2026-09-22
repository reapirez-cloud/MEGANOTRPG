-- Default image policy for isolated experimental AI-world slots.
-- Muntar/campaign generation profiles remain unchanged.

alter table public.ai_world_slots
  add column if not exists image_quality text not null default 'low',
  add column if not exists image_base_prompt text not null default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_world_slots_image_quality_check'
  ) then
    alter table public.ai_world_slots
      add constraint ai_world_slots_image_quality_check
      check (image_quality in ('low','high'));
  end if;
end $$;

update public.ai_world_slots
set image_quality = 'low',
    image_base_prompt = 'High-quality modern pixel-art illustration with refined pixel clusters and deliberate texture, cinematic composition, rich lighting, readable silhouettes, detailed materials, sophisticated palette, and a painterly pixel-art finish. Pixel art is the rendering language, not a retro-game parody. Avoid coarse 8-bit/16-bit console aesthetics, oversized block pixels, Dendy/NES/Sega look, low-detail sprites, chibi proportions, pixelated UI, readable text, and logos. Preserve the requested subject, mood, lore, composition, and character identity as the primary content.',
    updated_at = now();
