export type SkillRank = 0 | 1 | 2

export type InventoryCategory =
  | "equipment"
  | "consumable"
  | "tool"
  | "book"
  | "trinket"
  | "quest"
  | "material"
  | "currency"
  | "container"
  | "other"

export type EquipmentSlot =
  | "main_hand"
  | "off_hand"
  | "two_hands"
  | "head"
  | "neck"
  | "shoulders"
  | "chest"
  | "hands"
  | "wrists"
  | "waist"
  | "legs"
  | "feet"
  | "back"
  | "ring_left"
  | "ring_right"
  | "ammo"
  | "other"

export type CharacterSheet = {
  character_id: string
  race: string
  background: string
  alignment: string
  experience: number
  strength: number
  dexterity: number
  constitution: number
  intelligence: number
  wisdom: number
  charisma: number
  armor_class: number
  initiative_bonus: number
  speed: number
  proficiency_bonus: number
  max_hp: number
  current_hp: number
  temp_hp: number
  hit_dice: string
  death_save_successes: number
  death_save_failures: number
  passive_perception: number
  saving_throw_proficiencies: string[]
  skill_proficiencies: Record<string, SkillRank>
  proficiencies: string
  languages: string
  senses: string
  personality_traits: string
  ideals: string
  bonds: string
  flaws: string
  backstory: string
  notes: string
  spellcasting_enabled: boolean
  spellcasting_ability: string | null
  spell_save_dc: number | null
  spell_attack_bonus: number | null
  spell_slots: Record<string, { max: number; used: number }>
  created_at: string
  updated_at: string
}

export type InventoryItem = {
  id: string
  character_id: string
  name: string
  quantity: number
  weight: number | null
  equipped: boolean
  category: InventoryCategory
  equipment_slot: EquipmentSlot | null
  image_url: string | null
  description: string
  sort_order: number
  created_at: string
  updated_at: string
}

export type CharacterSpell = {
  id: string
  character_id: string
  name: string
  spell_level: number
  school: string
  casting_time: string
  spell_range: string
  duration: string
  components: string
  concentration: boolean
  ritual: boolean
  prepared: boolean
  description: string
  source: string
  sort_order: number
  created_at: string
  updated_at: string
}

export type CharacterFeature = {
  id: string
  character_id: string
  kind: "feat" | "class_feature" | "racial_trait" | "feature" | "other"
  name: string
  description: string
  sort_order: number
  created_at: string
  updated_at: string
}

export type DiaryPost = {
  id: string
  character_id: string
  created_by: string
  body: string
  created_at: string
}

export type DiaryComment = {
  id: string
  post_id: string
  created_by: string
  body: string
  created_at: string
}

export type InventoryInput = {
  name: string
  quantity: number
  weight: number | null
  equipped: boolean
  category: InventoryCategory
  equipment_slot: EquipmentSlot | null
  image_url: string | null
  description: string
}

export type SpellInput = {
  name: string
  spell_level: number
  school: string
  casting_time: string
  spell_range: string
  duration: string
  components: string
  concentration: boolean
  ritual: boolean
  prepared: boolean
  description: string
  source: string
}

export type FeatureInput = {
  kind: CharacterFeature["kind"]
  name: string
  description: string
}
