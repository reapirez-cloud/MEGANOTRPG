export type MediaPresentationShape = "rect" | "square" | "circle"

export type MediaPresentation = {
  version: 1
  shape: MediaPresentationShape
  aspectRatio: number
  crop: {
    x: number
    y: number
    width: number
    height: number
  }
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

export function parseMediaPresentation(value: unknown): MediaPresentation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (record.version !== 1) return null

  const shape = record.shape
  if (shape !== "rect" && shape !== "square" && shape !== "circle") return null

  const aspectRatio = record.aspectRatio
  if (!finite(aspectRatio) || aspectRatio <= 0 || aspectRatio > 12) return null
  if ((shape === "square" || shape === "circle") && Math.abs(aspectRatio - 1) > 0.001) {
    return null
  }

  const crop = record.crop
  if (!crop || typeof crop !== "object" || Array.isArray(crop)) return null
  const values = crop as Record<string, unknown>
  const x = values.x
  const y = values.y
  const width = values.width
  const height = values.height
  if (![x, y, width, height].every(finite)) return null
  if (
    x < 0 ||
    y < 0 ||
    width <= 0 ||
    height <= 0 ||
    width > 1 ||
    height > 1 ||
    x + width > 1.000001 ||
    y + height > 1.000001
  ) {
    return null
  }

  return {
    version: 1,
    shape,
    aspectRatio,
    crop: { x, y, width, height },
  }
}
