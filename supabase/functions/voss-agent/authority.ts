export type VossAuthority = "player" | "gm" | "admin"

export type CampaignMembershipLike = {
  role?: string | null
  is_owner?: boolean | null
}

export function resolveVossAuthority(
  membership: CampaignMembershipLike,
  isSystemAdmin: boolean,
): VossAuthority {
  if (isSystemAdmin) return "admin"
  if (membership.is_owner === true || membership.role === "gm") return "gm"
  return "player"
}

export function canManageCampaignWithVoss(authority: VossAuthority) {
  return authority === "gm" || authority === "admin"
}

export function canUseSystemVossTools(authority: VossAuthority) {
  return authority === "admin"
}

export function isPlayerVossAuthority(authority: VossAuthority) {
  return authority === "player"
}
