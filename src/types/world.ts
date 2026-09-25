export type VisibilityMode = "always" | "discover" | "private"
export type WorldLifecycleState = "active" | "archived"

export type WorldSection = {
  id: string
  campaign_id: string
  slug: string
  title: string
  description: string
  sort_order: number
}

export type WorldArticle = {
  id: string
  campaign_id: string
  section_id: string
  title: string
  summary: string
  body: string
  sort_order: number
}

export type LocationEntry = {
  id: string
  campaign_id: string
  parent_location_id: string | null
  name: string
  summary: string
  description: string
  image_url: string | null
  sort_order: number
  visibility_mode: VisibilityMode
  lifecycle_state: WorldLifecycleState
  created_by: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

export type LocationSection = {
  id: string
  location_id: string
  title: string
  body: string
  sort_order: number
}

export type LocationLink = {
  id: string
  section_id: string
  target_location_id: string
  label: string
  sort_order: number
  visibility_mode: VisibilityMode
  created_by: string | null
}

export type AchievementEntry = {
  id: string
  campaign_id: string
  character_id: string | null
  title: string
  description: string
  icon: string
  awarded_at: string
}

export type CampaignUpdate = {
  id: string
  campaign_id: string
  kind: "change" | "announcement"
  title: string
  body: string
  published_at: string
}


export type WorldLoreCategory = "news" | "chronicle" | "history" | "world_event" | "rumor"

export type WorldLoreEntry = {
  id: string
  campaign_id: string
  category: WorldLoreCategory
  title: string
  summary: string
  body: string
  source_kind: "memory_fact" | "background_event" | "campaign_event" | "manual"
  source_id: string
  source_entry_key: string
  location_id: string | null
  campaign_day: number | null
  day_period: "dawn" | "morning" | "day" | "afternoon" | "evening" | "night" | null
  occurred_at: string
  visibility: "campaign" | "characters" | "gm"
  visible_character_ids: string[]
  importance: number
  tags: string[]
  provenance: Record<string, unknown>
  created_at: string
  updated_at: string
}
