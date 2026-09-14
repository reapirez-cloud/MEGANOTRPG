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
  model: "gpt-image-2.5-flare" | "gpt-image-2.5-sunburst"
  size: string
  width: number
  height: number
  quality: "low" | "medium" | "high" | "xhigh" | "max"
  outputFormat: "webp"
  outputCompression: number
}

const PROFILES: Record<ImageProfileKey, ImageProfile> = {
  tiny_icon: {
    key: "tiny_icon",
    purpose: "icon",
    model: "gpt-image-2.5-flare",
    size: "1024x1024",
    width: 1024,
    height: 1024,
    quality: "low",
    outputFormat: "webp",
    outputCompression: 68,
  },
  ui_preview: {
    key: "ui_preview",
    purpose: "ui_preview",
    model: "gpt-image-2.5-flare",
    size: "1024x1024",
    width: 1024,
    height: 1024,
    quality: "medium",
    outputFormat: "webp",
    outputCompression: 78,
  },
  portrait: {
    key: "portrait",
    purpose: "portrait",
    model: "gpt-image-2.5-flare",
    size: "1024x1536",
    width: 1024,
    height: 1536,
    quality: "high",
    outputFormat: "webp",
    outputCompression: 82,
  },
  panel: {
    key: "panel",
    purpose: "panel",
    model: "gpt-image-2.5-flare",
    size: "1536x512",
    width: 1536,
    height: 512,
    quality: "medium",
    outputFormat: "webp",
    outputCompression: 80,
  },
  hero_art: {
    key: "hero_art",
    purpose: "hero_art",
    model: "gpt-image-2.5-flare",
    size: "1536x864",
    width: 1536,
    height: 864,
    quality: "high",
    outputFormat: "webp",
    outputCompression: 84,
  },
  master_art: {
    key: "master_art",
    purpose: "master_art",
    model: "gpt-image-2.5-sunburst",
    size: "1920x1088",
    width: 1920,
    height: 1088,
    quality: "xhigh",
    outputFormat: "webp",
    outputCompression: 88,
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
  hasReferences = false,
): ImageProfile {
  const base = PROFILES[PURPOSE_TO_PROFILE[purpose]]

  if (!hasReferences || base.model === "gpt-image-2.5-sunburst") return base

  // Reference-heavy edits benefit from the more precise image model while
  // preserving the same semantic size/quality profile.
  return {
    ...base,
    model: "gpt-image-2.5-sunburst",
  }
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
