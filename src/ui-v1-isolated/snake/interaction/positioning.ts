import type { SnakePoint } from "../../../snake-engine"

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

export function positionSnakeMenu(
  point: SnakePoint,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  padding = 10,
) {
  let x = point.x
  let y = point.y

  if (x + size.width + padding > viewport.width) {
    x = point.x - size.width
  }

  if (y + size.height + padding > viewport.height) {
    y = point.y - size.height
  }

  const position = {
    x: clamp(x, padding, viewport.width - size.width - padding),
    y: clamp(y, padding, viewport.height - size.height - padding),
  }

  return {
    position,
    origin: {
      x: clamp(point.x - position.x, 0, size.width),
      y: clamp(point.y - position.y, 0, size.height),
    },
  }
}
