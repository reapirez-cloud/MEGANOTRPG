import type {
  SnakeSurfaceRequest,
  SnakeWindowSize,
} from "../../../snake-engine"

export function defaultWindowSize(
  request: SnakeSurfaceRequest,
): Required<SnakeWindowSize> {
  const fallbackWidth =
    request.kind === "confirm" ||
    request.kind === "notice" ||
    request.kind === "placeholder"
      ? "compact"
      : request.kind === "detail"
        ? "wide"
        : "standard"

  return {
    width: request.size?.width || fallbackWidth,
    height: request.size?.height || "content",
  }
}
