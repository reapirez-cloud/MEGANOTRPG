import type { SupabaseClient } from "@supabase/supabase-js"

export type CampaignInviteCreateInput = {
  maxUses: number
  expiresDays: number
}

export interface CampaignAdministrationGateway {
  setMemberRole(campaignId: string, userId: string, role: "gm" | "player"): Promise<void>
  removeMember(campaignId: string, userId: string): Promise<void>
  createInvite(campaignId: string, input: CampaignInviteCreateInput): Promise<string>
  revokeInvite(campaignId: string, code: string): Promise<void>
}

function fail(error: { message: string } | null, fallback: string): never {
  throw new Error(error?.message || fallback)
}

export class SupabaseCampaignAdministrationGateway implements CampaignAdministrationGateway {
  constructor(private readonly client: SupabaseClient) {}

  async setMemberRole(campaignId: string, userId: string, role: "gm" | "player") {
    const { error } = await this.client.rpc("set_campaign_member_role", {
      p_campaign_id: campaignId,
      p_user_id: userId,
      p_role: role,
    })
    if (error) fail(error, "Could not change campaign member role")
  }

  async removeMember(campaignId: string, userId: string) {
    const { error } = await this.client.rpc("remove_campaign_member_v1", {
      p_campaign_id: campaignId,
      p_user_id: userId,
    })
    if (error) fail(error, "Could not remove campaign member")
  }

  async createInvite(campaignId: string, input: CampaignInviteCreateInput) {
    const { data, error } = await this.client.rpc("create_campaign_invite", {
      p_campaign_id: campaignId,
      p_max_uses: input.maxUses,
      p_expires_days: input.expiresDays,
    })
    if (error) fail(error, "Could not create campaign invite")
    return String(data || "")
  }

  async revokeInvite(campaignId: string, code: string) {
    const { error } = await this.client.rpc("revoke_campaign_invite_v1", {
      p_campaign_id: campaignId,
      p_code: code,
    })
    if (error) fail(error, "Could not revoke campaign invite")
  }
}
