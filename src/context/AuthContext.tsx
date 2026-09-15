import { createContext, useContext } from "react"
import type { ReactNode } from "react"
import type { User } from "@supabase/supabase-js"

export type AppProfile = {
  user_id: string
  display_name: string
  created_at: string
  updated_at: string
}

export type AppCampaignAccess = {
  campaignId: string
  role: "gm" | "player"
  isOwner: boolean
  canManage: boolean
  activeCharacterId: string | null
}

type AuthContextValue = {
  user: User
  profile: AppProfile
  campaign: AppCampaignAccess | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({
  user,
  profile,
  campaign = null,
  children,
}: {
  user: User
  profile: AppProfile
  campaign?: AppCampaignAccess | null
  children: ReactNode
}) {
  return (
    <AuthContext.Provider value={{ user, profile, campaign }}>
      {children}
    </AuthContext.Provider>
  )
}

// The provider and its hook intentionally share this private context.
// oxlint-disable-next-line react/only-export-components
export function useAuth() {
  const value = useContext(AuthContext)

  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider")
  }

  return value
}
