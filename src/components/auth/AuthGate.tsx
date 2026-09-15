import { useEffect, useState } from "react"
import type { FormEvent, ReactNode } from "react"
import type { User } from "@supabase/supabase-js"

import { supabase } from "../../lib/supabase"
import {
  AuthProvider,
  type AppCampaignAccess,
  type AppProfile,
} from "../../context/AuthContext"

type Phase =
  | "loading"
  | "profile"
  | "invite"
  | "ready"
  | "telegram-required"
  | "error"

type TelegramUser = {
  id: number
  first_name: string
  last_name: string | null
  username: string | null
  photo_url: string | null
}

type TelegramAuthResponse = {
  token_hash?: string
  telegram_user?: TelegramUser
  error?: string
}

type MembershipRow = {
  campaign_id: string
  role: "gm" | "player"
  is_owner: boolean
  active_character_id: string | null
  created_at: string
}

const CAMPAIGN_STORAGE_KEY = "meganotrpg:v1:campaign-id"

function isLocalDevelopment() {
  return (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  )
}

function allowE2ETestAuthBypass() {
  return (
    import.meta.env.DEV &&
    isLocalDevelopment() &&
    import.meta.env.VITE_E2E_AUTH_BYPASS === "true"
  )
}

function rememberedCampaignId() {
  try {
    return window.localStorage.getItem(CAMPAIGN_STORAGE_KEY) || ""
  } catch {
    return ""
  }
}

function rememberCampaignId(campaignId: string) {
  try {
    window.localStorage.setItem(CAMPAIGN_STORAGE_KEY, campaignId)
  } catch {
    // Storage is only a navigation hint. Membership is always rechecked in Supabase.
  }
}

function campaignAccessFrom(row: MembershipRow): AppCampaignAccess {
  const isOwner = row.is_owner === true
  const role = row.role === "gm" ? "gm" : "player"

  return {
    campaignId: row.campaign_id,
    role,
    isOwner,
    canManage: isOwner || role === "gm",
    activeCharacterId: row.active_character_id,
  }
}

const E2E_USER = {
  id: "00000000-0000-4000-8000-000000000001",
  app_metadata: {},
  user_metadata: { app: "MEGANOTRPG", auth_source: "e2e" },
  aud: "authenticated",
  created_at: "2026-01-01T00:00:00.000Z",
} as User

const E2E_PROFILE: AppProfile = {
  user_id: E2E_USER.id,
  display_name: "Playwright",
  created_at: E2E_USER.created_at,
  updated_at: E2E_USER.created_at,
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("loading")
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<AppProfile | null>(null)
  const [campaign, setCampaign] = useState<AppCampaignAccess | null>(null)
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null)
  const [error, setError] = useState("")
  const [name, setName] = useState("")
  const [inviteCode, setInviteCode] = useState("")
  const [saving, setSaving] = useState(false)
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    if (allowE2ETestAuthBypass()) return
    void bootstrap()
  }, [])

  async function resolveCampaignAccess(
    currentUser: User,
    currentProfile: AppProfile,
  ) {
    setUser(currentUser)
    setProfile(currentProfile)
    setCampaign(null)
    setError("")

    // Keep anonymous localhost development usable without weakening production.
    if (isLocalDevelopment() && currentUser.is_anonymous === true) {
      setPhase("ready")
      return
    }

    const { data: memberships, error: membershipError } = await supabase
      .from("campaign_members")
      .select("campaign_id, role, is_owner, active_character_id, created_at")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: true })

    if (membershipError) {
      setError(membershipError.message)
      setPhase("error")
      return
    }

    const rows = (memberships || []) as MembershipRow[]
    const remembered = rememberedCampaignId()
    const selected =
      rows.find((row) => row.campaign_id === remembered) ||
      rows[0] ||
      null

    if (!selected) {
      setPhase("invite")
      return
    }

    rememberCampaignId(selected.campaign_id)
    setCampaign(campaignAccessFrom(selected))
    setPhase("ready")
  }

  async function loadProfile(currentUser: User, suggestedName = "") {
    setUser(currentUser)
    setProfile(null)
    setCampaign(null)

    const { data: existingProfile, error: profileError } = await supabase
      .from("profiles")
      .select("user_id, display_name, created_at, updated_at")
      .eq("user_id", currentUser.id)
      .maybeSingle()

    if (profileError) {
      setError(profileError.message)
      setPhase("error")
      return
    }

    if (!existingProfile) {
      if (suggestedName) {
        setName(suggestedName.slice(0, 40))
      }
      setPhase("profile")
      return
    }

    await resolveCampaignAccess(currentUser, existingProfile as AppProfile)
  }

  async function bootstrapTelegram(initData: string) {
    let response: Response
    try {
      response = await fetch("/api/telegram-auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ initData }),
      })
    } catch {
      setError("Не удалось связаться с сервером авторизации.")
      setPhase("error")
      return
    }

    let payload: TelegramAuthResponse = {}
    try {
      payload = (await response.json()) as TelegramAuthResponse
    } catch {
      // Keep the generic error below.
    }

    if (!response.ok || !payload.token_hash || !payload.telegram_user) {
      setError(payload.error || "Telegram-авторизация не удалась.")
      setPhase("error")
      return
    }

    setTelegramUser(payload.telegram_user)

    // Never let a previous Telegram account survive into the next login.
    // UI 1.0 and the classic shell share Supabase local storage, so a stale
    // browser session must be cleared before accepting the freshly signed
    // Telegram identity.
    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" })
    if (signOutError) {
      console.warn("Could not clear previous local Supabase session:", signOutError.message)
    }

    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: payload.token_hash,
      type: "email",
    })

    if (verifyError || !data.user) {
      setError(verifyError?.message || "Не удалось открыть сессию Supabase.")
      setPhase("error")
      return
    }

    const sessionTelegramId = String(
      data.user.user_metadata?.telegram_id || "",
    )
    const currentTelegramId = String(payload.telegram_user.id)

    if (!sessionTelegramId || sessionTelegramId !== currentTelegramId) {
      await supabase.auth.signOut({ scope: "local" })
      setUser(null)
      setProfile(null)
      setCampaign(null)
      setError(
        "Telegram-аккаунт и сессия приложения не совпали. Закрой Mini App и открой его снова.",
      )
      setPhase("error")
      return
    }

    const suggestedName = [
      payload.telegram_user.first_name,
      payload.telegram_user.last_name,
    ]
      .filter(Boolean)
      .join(" ")

    await loadProfile(data.user, suggestedName)
  }

  async function bootstrapLegacy() {
    const localDevelopment = isLocalDevelopment()

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError) {
      setError(sessionError.message)
      setPhase("error")
      return
    }

    // Localhost keeps its developer convenience. Anywhere else, a stored
    // Supabase session without freshly verified Telegram initData is invalid.
    if (session?.user && localDevelopment) {
      await loadProfile(session.user)
      return
    }

    if (session?.user && !localDevelopment) {
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" })
      if (signOutError) {
        console.warn("Could not clear stale browser session:", signOutError.message)
      }
    }

    // Anonymous auth remains available only for npm run dev on localhost.
    if (localDevelopment) {
      const { data, error: anonymousError } =
        await supabase.auth.signInAnonymously({
          options: {
            data: {
              app: "MEGANOTRPG",
              source: "local_development",
            },
          },
        })

      if (anonymousError || !data.user) {
        setError(
          anonymousError?.message ||
            "Не удалось создать локальную тестовую учётную запись.",
        )
        setPhase("error")
        return
      }

      await loadProfile(data.user)
      return
    }

    setUser(null)
    setProfile(null)
    setCampaign(null)
    setPhase("telegram-required")
  }

  async function bootstrap() {
    setPhase("loading")
    setError("")
    setCampaign(null)

    const webApp = window.Telegram?.WebApp

    if (webApp) {
      webApp.ready()
      webApp.expand()
    }

    const initData = webApp?.initData?.trim() || ""

    if (initData) {
      await bootstrapTelegram(initData)
      return
    }

    await bootstrapLegacy()
  }

  async function createProfile(event: FormEvent) {
    event.preventDefault()

    if (!user || saving) return

    const displayName = name.trim()

    if (displayName.length < 2) {
      setError("Имя должно быть не короче 2 символов.")
      return
    }

    setSaving(true)
    setError("")

    const { data, error: insertError } = await supabase
      .from("profiles")
      .insert({
        user_id: user.id,
        display_name: displayName,
      })
      .select("user_id, display_name, created_at, updated_at")
      .single()

    setSaving(false)

    if (insertError) {
      if (insertError.code === "23505") {
        setError(
          "Такое имя уже занято. Если это твой старый тестовый аккаунт — пока добавь к имени, например, «TG». После переноса Telegram-аккаунта старую запись уберём.",
        )
      } else {
        setError(insertError.message)
      }
      return
    }

    setPhase("loading")
    await resolveCampaignAccess(user, data as AppProfile)
  }

  async function joinCampaign(event: FormEvent) {
    event.preventDefault()

    if (!user || !profile || joining) return

    const code = inviteCode.trim().toUpperCase()
    if (!code) {
      setError("Введи код приглашения.")
      return
    }

    setJoining(true)
    setError("")

    const { data: joinedCampaignId, error: joinError } = await supabase.rpc(
      "join_campaign_by_invite",
      { p_code: code },
    )

    setJoining(false)

    if (joinError) {
      setError(joinError.message || "Код не подошёл.")
      return
    }

    if (typeof joinedCampaignId === "string" && joinedCampaignId) {
      rememberCampaignId(joinedCampaignId)
    }

    setInviteCode("")
    setPhase("loading")
    await resolveCampaignAccess(user, profile)
  }

  if (allowE2ETestAuthBypass()) {
    return (
      <AuthProvider user={E2E_USER} profile={E2E_PROFILE}>
        {children}
      </AuthProvider>
    )
  }

  if (phase === "loading") {
    return (
      <div className="auth-screen">
        <div className="auth-loading">
          <span className="auth-spinner" />
          <div className="auth-muted">
            {window.Telegram?.WebApp?.initData
              ? "Проверяем доступ…"
              : "Подключаем игрока…"}
          </div>
        </div>
      </div>
    )
  }

  if (phase === "telegram-required") {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-eyebrow">MEGANOTRPG</div>
          <h1 className="auth-title">Открой приложение в Telegram</h1>
          <p className="auth-muted">
            Вход в кампанию подтверждается Telegram Mini App. Открой{" "}
            <strong>@DND_MEGABOTPROPLUS_BOT</strong>{" "}
            и нажми кнопку запуска приложения.
          </p>

          <button
            type="button"
            className="auth-primary"
            onClick={() => void bootstrap()}
          >
            Проверить снова
          </button>
        </div>
      </div>
    )
  }

  if (phase === "error") {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-eyebrow">MEGANOTRPG</div>
          <h1 className="auth-title">Не удалось войти</h1>
          <p className="auth-muted">{error}</p>

          <button
            type="button"
            className="auth-primary"
            onClick={() => void bootstrap()}
          >
            Повторить
          </button>
        </div>
      </div>
    )
  }

  if (phase === "profile") {
    return (
      <div className="auth-screen">
        <form className="auth-card" onSubmit={createProfile}>
          <div className="auth-eyebrow">MEGANOTRPG</div>
          <h1 className="auth-title">Как тебя подписать?</h1>

          <p className="auth-muted">
            {telegramUser
              ? "Telegram уже подтвердил твой аккаунт. Осталось выбрать имя, которое увидят игроки в кампании."
              : "Это локальная тестовая учётная запись."}
          </p>

          {telegramUser?.username && (
            <div className="auth-note">
              Telegram: <strong>@{telegramUser.username}</strong>
            </div>
          )}

          <label className="auth-label" htmlFor="player-name">
            Имя игрока
          </label>

          <input
            id="player-name"
            className="auth-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Например: Виталий"
            minLength={2}
            maxLength={40}
            autoFocus
            autoComplete="nickname"
          />

          {error && <div className="auth-error">{error}</div>}

          <button
            type="submit"
            className="auth-primary"
            disabled={saving || name.trim().length < 2}
          >
            {saving ? "Сохраняем…" : "Продолжить"}
          </button>
        </form>
      </div>
    )
  }

  if (phase === "invite") {
    return (
      <div className="auth-screen">
        <form className="auth-card" onSubmit={joinCampaign}>
          <div className="auth-eyebrow">MEGANOTRPG</div>
          <h1 className="auth-title">Войти в кампанию</h1>
          <p className="auth-muted">
            Аккаунт подтверждён, но доступа к кампании ещё нет. Введи код,
            который выдал GM или владелец кампании.
          </p>

          <label className="auth-label" htmlFor="campaign-invite-code">
            Код приглашения
          </label>

          <input
            id="campaign-invite-code"
            className="auth-input"
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value)}
            placeholder="Например: A1B2C3D4E5F6"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />

          {error && <div className="auth-error">{error}</div>}

          <button
            type="submit"
            className="auth-primary"
            disabled={joining || inviteCode.trim().length === 0}
          >
            {joining ? "Проверяем код…" : "Войти в кампанию"}
          </button>
        </form>
      </div>
    )
  }

  if (phase !== "ready" || !user || !profile) {
    return null
  }

  return (
    <AuthProvider user={user} profile={profile} campaign={campaign}>
      {children}
    </AuthProvider>
  )
}
