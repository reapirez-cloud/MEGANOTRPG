export type ImagePurpose =
  | "icon"
  | "ui_preview"
  | "portrait"
  | "panel"
  | "hero_art"
  | "master_art"

export type ImageProfileKey =
  | "tiny_icon"
  | "ui_preview"
  | "portrait"
  | "panel"
  | "hero_art"
  | "master_art"

export type ImageProfile = {
  key: ImageProfileKey
  purpose: ImagePurpose
  model: "gpt-image-2.5-sunburst"
  size: "1024x1024" | "1024x1536" | "1536x1024"
  width: number
  height: number
  quality: "low" | "high"
}

const PROFILES: Record<ImageProfileKey, ImageProfile> = {
  tiny_icon: {
    key: "tiny_icon",
    purpose: "icon",
    model: "gpt-image-2.5-sunburst",
    size: "1024x1024",
    width: 1024,
    height: 1024,
    quality: "low",
  },
  ui_preview: {
    key: "ui_preview",
    purpose: "ui_preview",
    model: "gpt-image-2.5-sunburst",
    size: "1024x1024",
    width: 1024,
    height: 1024,
    quality: "high",
  },
  portrait: {
    key: "portrait",
    purpose: "portrait",
    model: "gpt-image-2.5-sunburst",
    size: "1024x1536",
    width: 1024,
    height: 1536,
    quality: "high",
  },
  panel: {
    key: "panel",
    purpose: "panel",
    model: "gpt-image-2.5-sunburst",
    size: "1536x1024",
    width: 1536,
    height: 1024,
    quality: "high",
  },
  hero_art: {
    key: "hero_art",
    purpose: "hero_art",
    model: "gpt-image-2.5-sunburst",
    size: "1536x1024",
    width: 1536,
    height: 1024,
    quality: "high",
  },
  master_art: {
    key: "master_art",
    purpose: "master_art",
    model: "gpt-image-2.5-sunburst",
    size: "1536x1024",
    width: 1536,
    height: 1024,
    quality: "high",
  },
}

const PURPOSE_TO_PROFILE: Record<ImagePurpose, ImageProfileKey> = {
  icon: "tiny_icon",
  ui_preview: "ui_preview",
  portrait: "portrait",
  panel: "panel",
  hero_art: "hero_art",
  master_art: "master_art",
}

export function imageProfileForPurpose(
  purpose: ImagePurpose,
  _hasReferences = false,
): ImageProfile {
  return PROFILES[PURPOSE_TO_PROFILE[purpose]]
}

export function normalizeImagePurpose(
  raw: unknown,
  targetField = "",
): ImagePurpose {
  const value = typeof raw === "string" ? raw.trim() : ""
  if (
    value === "icon" ||
    value === "ui_preview" ||
    value === "portrait" ||
    value === "panel" ||
    value === "hero_art" ||
    value === "master_art"
  ) {
    return value
  }

  const field = targetField.toLocaleLowerCase("en-US")
  if (/icon|glyph/.test(field)) return "icon"
  if (/avatar|portrait/.test(field)) return "portrait"
  if (/panel|preview/.test(field)) return "panel"
  if (/hero|cover/.test(field)) return "hero_art"
  return "ui_preview"
}
