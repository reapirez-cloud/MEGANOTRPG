export type RootSpace = "chats" | "home" | "workspace"

export type LegacyMainTab = "feed" | "chats" | "world" | "characters" | "me"

export type CharacterReturnTarget =
  | "home"
  | "whats-new"
  | "world"
  | "workspace"
  | "characters"
  | "chats"
  | "chat"

export type AppRoute =
  | { type: "space"; space: RootSpace }
  | { type: "home-section"; section: "whats-new" }
  | { type: "world" }
  | { type: "workspace-characters" }
  | { type: "chat"; id: string }
  | {
      type: "character"
      id: string
      returnTo: CharacterReturnTarget
      roomId?: string
    }
  | { type: "gallery" }

function cleanPathname(pathname: string) {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`
  return normalized.length > 1 ? normalized.replace(/\/+$/, "") : normalized
}

function parseCharacterReturnTarget(value: string | null): CharacterReturnTarget {
  if (value === "feed") return "whats-new"
  if (value === "me") return "workspace"

  if (
    value === "home" ||
    value === "whats-new" ||
    value === "world" ||
    value === "workspace" ||
    value === "characters" ||
    value === "chats" ||
    value === "chat"
  ) {
    return value
  }

  return "home"
}

export function parseAppLocation(pathname: string, search = ""): AppRoute {
  const path = cleanPathname(pathname)
  const parts = path.split("/").filter(Boolean)

  if (parts[0] === "chat" && parts[1]) {
    return { type: "chat", id: decodeURIComponent(parts[1]) }
  }

  if (parts[0] === "character" && parts[1]) {
    const params = new URLSearchParams(search.replace(/^\?/, ""))
    return {
      type: "character",
      id: decodeURIComponent(parts[1]),
      returnTo: parseCharacterReturnTarget(params.get("from")),
      roomId: params.get("room") || undefined,
    }
  }

  if (path === "/gallery") return { type: "gallery" }
  if (path === "/world") return { type: "world" }
  if (path === "/workspace/characters") return { type: "workspace-characters" }
  if (path === "/home/whats-new" || path === "/feed") {
    return { type: "home-section", section: "whats-new" }
  }

  if (path === "/chats") return { type: "space", space: "chats" }
  if (path === "/workspace" || path === "/me") {
    return { type: "space", space: "workspace" }
  }
  if (path === "/home" || path === "/") return { type: "space", space: "home" }

  if (path === "/characters") return { type: "workspace-characters" }

  return { type: "space", space: "home" }
}

export function parseAppRoute(hash: string): AppRoute {
  const raw = hash.replace(/^#/, "") || "/"
  const [pathname, query = ""] = raw.split("?")
  return parseAppLocation(pathname, query ? `?${query}` : "")
}

export function legacyRedirectForLocation(pathname: string) {
  const path = cleanPathname(pathname)

  if (path === "/") return "/home"
  if (path === "/feed") return "/home/whats-new"
  if (path === "/me") return "/workspace"
  if (path === "/characters") return "/workspace/characters"

  return null
}

export function rootSpacePath(space: RootSpace) {
  return `/${space}`
}

export function characterRoutePath(
  id: string,
  returnTo: CharacterReturnTarget = "home",
  roomId?: string,
) {
  const params = new URLSearchParams({ from: returnTo })
  if (roomId) params.set("room", roomId)
  return `/character/${encodeURIComponent(id)}?${params.toString()}`
}

export function characterReturnPath(route: Extract<AppRoute, { type: "character" }>) {
  if (route.returnTo === "chat") {
    return route.roomId ? `/chat/${encodeURIComponent(route.roomId)}` : "/chats"
  }

  if (route.returnTo === "chats") return "/chats"
  if (route.returnTo === "whats-new") return "/home/whats-new"
  if (route.returnTo === "world") return "/world"
  if (route.returnTo === "workspace") return "/workspace"
  if (route.returnTo === "characters") return "/workspace/characters"

  return "/home"
}

export function dockSpaceForRoute(route: AppRoute): RootSpace {
  if (route.type === "chat") return "chats"
  if (route.type === "workspace-characters") return "workspace"

  if (route.type === "space") return route.space

  return "home"
}

export function mainRouteHash(tab: LegacyMainTab) {
  const target: Record<LegacyMainTab, string> = {
    feed: "/home/whats-new",
    chats: "/chats",
    world: "/world",
    characters: "/workspace/characters",
    me: "/workspace",
  }

  return `#${target[tab]}`
}
