import {
  StrictMode,
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react"
import { createRoot } from "react-dom/client"

import { AIProvider } from "../ai/AIProvider"
import AuthGate from "../components/auth/AuthGate"
import { useAuth } from "../context/AuthContext"
import { CharacterProvider } from "../context/CharacterContext"
import { supabase } from "../lib/supabase"
import UiV1App from "./UiV1App"
import { SnakeProvider } from "./SnakeProvider"
import "../ai/ai-voss.css"
import "../auth.css"
import "./styles.css"
import "./snake.css"
import "./workspace.css"
import "./gm-workshop.css"
import "./art-library.css"

type CampaignGatePhase = "checking" | "invite" | "ready" | "error"

type CampaignMembership = {
  campaign_id: string
  created_at: string
}

function CampaignAccessGate({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [phase, setPhase] = useState<CampaignGatePhase>("checking")
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [joining, setJoining] = useState(false)

  const checkMembership = useCallback(async () => {
    setPhase("checking")
    setError("")

    const { data, error: membershipError } = await supabase
      .from("campaign_members")
      .select("campaign_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })

    if (membershipError) {
      setError(membershipError.message)
      setPhase("error")
      return false
    }

    const memberships = (data || []) as CampaignMembership[]

    if (!memberships.length) {
      setPhase("invite")
      return false
    }

    const rememberedCampaignId =
      window.localStorage.getItem("meganotrpg:v1:campaign-id") ||
      window.localStorage.getItem("meganotrpg:campaign-id") ||
      ""

    const selectedMembership =
      memberships.find(
        (membership) => membership.campaign_id === rememberedCampaignId,
      ) || memberships[0]

    window.localStorage.setItem(
      "meganotrpg:v1:campaign-id",
      selectedMembership.campaign_id,
    )
    setPhase("ready")
    return true
  }, [user.id])

  useEffect(() => {
    void checkMembership()
  }, [checkMembership])

  async function joinCampaign(event: FormEvent) {
    event.preventDefault()
    if (joining) return

    const cleanedCode = code.trim()
    if (!cleanedCode) {
      setError("Введи код приглашения.")
      return
    }

    setJoining(true)
    setError("")

    const { data, error: joinError } = await supabase.rpc(
      "join_campaign_by_invite",
      { p_code: cleanedCode },
    )

    if (joinError) {
      setJoining(false)
      setError(
        joinError.message === "Telegram account required"
          ? "Приглашение можно принять только внутри Telegram Mini App."
          : joinError.message,
      )
      return
    }

    if (typeof data === "string") {
      window.localStorage.setItem("meganotrpg:v1:campaign-id", data)
    }

    await checkMembership()
    setJoining(false)
  }

  if (phase === "checking") {
    return (
      <div className="auth-screen">
        <div className="auth-loading">
          <span className="auth-spinner" />
          <div className="auth-muted">Проверяем доступ к кампании…</div>
        </div>
      </div>
    )
  }

  if (phase === "error") {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-eyebrow">MEGANOTRPG</div>
          <h1 className="auth-title">Не удалось проверить доступ</h1>
          <p className="auth-muted">{error}</p>
          <button
            className="auth-primary"
            type="button"
            onClick={() => void checkMembership()}
          >
            Повторить
          </button>
        </div>
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
            Попроси владельца или ГМ прислать код приглашения. Без принятого
            приглашения приложение не откроет кампанию.
          </p>

          <label className="auth-label" htmlFor="campaign-invite-code">
            Код приглашения
          </label>
          <input
            id="campaign-invite-code"
            className="auth-input auth-input--code"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="Например: A1B2C3D4E5F6"
            maxLength={32}
            autoCapitalize="characters"
            autoComplete="off"
            autoFocus
          />

          {error && <div className="auth-error">{error}</div>}

          <button
            className="auth-primary"
            type="submit"
            disabled={joining || !code.trim()}
          >
            {joining ? "Проверяем…" : "Присоединиться"}
          </button>
        </form>
      </div>
    )
  }

  return <>{children}</>
}

const root = document.getElementById("ui-v1-root")

if (!root) {
  throw new Error("UI v1 root not found")
}

createRoot(root).render(
  <StrictMode>
    <AuthGate>
      <CampaignAccessGate>
        <CharacterProvider>
          <AIProvider>
            <SnakeProvider>
              <UiV1App />
            </SnakeProvider>
          </AIProvider>
        </CharacterProvider>
      </CampaignAccessGate>
    </AuthGate>
  </StrictMode>,
)
