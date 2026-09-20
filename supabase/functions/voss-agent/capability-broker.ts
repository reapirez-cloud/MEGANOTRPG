import type { VossAuthority } from "./authority.ts"

export const FREDDY_CAPABILITIES = [
  "world.write",
  "characters.write",
  "content.write",
  "memory.write",
  "media.write",
  "campaign.manage",
  "system.admin",
] as const

export type FreddyCapability = typeof FREDDY_CAPABILITIES[number]

const CAPABILITY_SET = new Set<string>(FREDDY_CAPABILITIES)

const GM_CAPABILITIES = new Set<FreddyCapability>([
  "world.write",
  "characters.write",
  "content.write",
  "memory.write",
  "media.write",
  "campaign.manage",
])

const ADMIN_CAPABILITIES = new Set<FreddyCapability>(FREDDY_CAPABILITIES)

export const FREDDY_CAPABILITY_TOOL = {
  type: "function",
  function: {
    name: "request_capability",
    description:
      "Freddy only. Request one or more temporary tool capabilities needed to complete the user's current task. Infer the required capabilities from the user's request, conversation history and current screen context. Request them yourself instead of asking the user to restate the task or name an internal tool. The server independently checks current authority. Capabilities last only for this conversation turn (including its automatic continuation chunks) and never raise the user's role.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        capabilities: {
          type: "array",
          minItems: 1,
          maxItems: 7,
          uniqueItems: true,
          items: {
            type: "string",
            enum: FREDDY_CAPABILITIES,
          },
          description:
            "world.write = locations/zones; characters.write = PCs/NPCs; content.write = GM drafts/definitions such as items, feats, spells, features, conditions and references; memory.write = durable GM memory; media.write = generated/attached media; campaign.manage = broad campaign character/location management; system.admin = system-admin settings/security only.",
        },
        reason: {
          type: "string",
          description:
            "Short operational reason. Do not include hidden chain-of-thought.",
        },
      },
      required: ["capabilities"],
    },
  },
} as const

export function isFreddyCapabilityTool(name: string) {
  return name === FREDDY_CAPABILITY_TOOL.function.name
}

export function normalizeFreddyCapabilities(value: unknown): FreddyCapability[] {
  if (!Array.isArray(value)) return []
  return [...new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .filter((item): item is FreddyCapability => CAPABILITY_SET.has(item)),
  )]
}

function allowedCapabilities(authority: VossAuthority) {
  if (authority === "admin") return ADMIN_CAPABILITIES
  if (authority === "gm") return GM_CAPABILITIES
  return new Set<FreddyCapability>()
}

export function requestFreddyCapabilities(
  authority: VossAuthority,
  args: Record<string, unknown>,
  current: Iterable<FreddyCapability> = [],
) {
  const requested = normalizeFreddyCapabilities(args.capabilities)
  const existing = new Set(current)
  const allowed = allowedCapabilities(authority)

  if (!requested.length) {
    return {
      ok: false,
      authority,
      scope: "current_turn",
      requested: [],
      granted: [],
      newly_granted: [],
      denied: [],
      error: "capabilities_required",
    }
  }

  const granted = requested.filter((capability) => allowed.has(capability))
  const newlyGranted = granted.filter((capability) => !existing.has(capability))
  const denied = requested
    .filter((capability) => !allowed.has(capability))
    .map((capability) => ({
      capability,
      reason:
        authority === "player"
          ? "voss_read_only"
          : "authority_not_allowed",
    }))

  return {
    ok: granted.length > 0,
    authority,
    scope: "current_turn",
    requested,
    granted,
    newly_granted: newlyGranted,
    already_granted: granted.filter((capability) => existing.has(capability)),
    denied,
  }
}
