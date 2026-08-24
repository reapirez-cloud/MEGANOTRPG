import { useEffect, useState } from "react"
import type { FormEvent, ReactNode } from "react"
import type { User } from "@supabase/supabase-js"

import { supabase } from "../../lib/supabase"
import { AuthProvider, type AppProfile } from "../../context/AuthContext"

type Phase = "loading" | "profile" | "ready" | "error"

export default function AuthGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("loading")
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<AppProfile | null>(null)
  const [error, setError] = useState("")
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void bootstrap()
  }, [])

  async function bootstrap() {
    setPhase("loading")
    setError("")

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError) {
      setError(sessionError.message)
      setPhase("error")
      return
    }

    let currentUser = session?.user ?? null

    if (!currentUser) {
      const { data, error: anonymousError } =
        await supabase.auth.signInAnonymously({
          options: {
            data: {
              app: "MEGANOTRPG",
              source: "web_test",
            },
          },
        })

      if (anonymousError || !data.user) {
        setError(
          anonymousError?.message ||
            "Не удалось создать техническую учётную запись.",
        )
        setPhase("error")
        return
      }

      currentUser = data.user
    }

    setUser(currentUser)

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
      setPhase("profile")
      return
    }

    setProfile(existingProfile as AppProfile)
    setPhase("ready")
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
        setError("Такое имя уже занято. Выбери другое.")
      } else {
        setError(insertError.message)
      }
      return
    }

    setProfile(data as AppProfile)
    setPhase("ready")
  }

  if (phase === "loading") {
    return (
      <div className="auth-screen">
        <div className="auth-loading">
          <span className="auth-spinner" />
          <div className="auth-muted">Подключаем игрока…</div>
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

          {error.toLowerCase().includes("anonymous") && (
            <div className="auth-note">
              В Supabase нужно включить:
              <strong> Authentication → Providers → Anonymous Sign-Ins</strong>.
            </div>
          )}

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
            Это имя увидят другие игроки в чате. Для этого браузера уже создан
            отдельный пользователь Supabase.
          </p>

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
            {saving ? "Сохраняем…" : "Войти в кампанию"}
          </button>

          <p className="auth-footnote">
            Пока это тестовая авторизация по устройству. Позже Telegram будет
            определять игрока автоматически.
          </p>
        </form>
      </div>
    )
  }

  if (!user || !profile) {
    return null
  }

  return (
    <AuthProvider user={user} profile={profile}>
      {children}
    </AuthProvider>
  )
}
