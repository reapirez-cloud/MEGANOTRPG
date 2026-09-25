import { useCallback, useEffect, useMemo, useState } from "react"

import { supabase } from "../../lib/supabase"
import { formatExactCampaignTime } from "../../world-state/time.ts"
import "./chat-survival-drawer.css"

type SurvivalTrack = {
  value?: number
  stage?: number
  penalty?: number
}

type SurvivalStatus = {
  character_id?: string
  character_name?: string
  location_id?: string | null
  location_name?: string | null
  campaign_minute?: number
  campaign_day?: number
  day_period?: string
  survival?: {
    hunger?: SurvivalTrack
    fatigue?: SurvivalTrack
    roll?: {
      mode?: string
      flat_penalty?: number
      stacking?: string
    }
  }
}

function asStatus(value: unknown): SurvivalStatus {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as SurvivalStatus
    : {}
}

function clampPercent(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 100
  return Math.max(0, Math.min(100, Math.round(parsed)))
}

function stageText(stage: number) {
  if (stage >= 3) return "III"
  if (stage === 2) return "II"
  if (stage === 1) return "I"
  return "Норма"
}

function pressureText(stage: number, penalty: number) {
  if (stage >= 3) return `Помеха · ${penalty || -7}`
  if (stage === 2) return `Помеха · ${penalty || -5}`
  if (stage === 1) return "Помеха"
  return "Без штрафа"
}

function SurvivalMeter({
  label,
  value,
  stage,
  penalty,
}: {
  label: string
  value: number
  stage: number
  penalty: number
}) {
  return (
    <div className="u1-survival-meter" data-stage={stage}>
      <div className="u1-survival-meter__head">
        <span>{label}</span>
        <strong>{value}%</strong>
      </div>
      <div className="u1-survival-meter__track" aria-hidden="true">
        <i style={{ width: value + "%" }} />
      </div>
      <div className="u1-survival-meter__foot">
        <span>{stageText(stage)}</span>
        <small>{pressureText(stage, penalty)}</small>
      </div>
    </div>
  )
}

export default function ChatSurvivalDrawer({
  characterId,
  onClose,
}: {
  characterId: string
  onClose: () => void
}) {
  const [status, setStatus] = useState<SurvivalStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setError("")
    const { data, error: rpcError } = await supabase.rpc(
      "get_ai_survival_status_v1",
      { p_character_id: characterId },
    )
    if (rpcError) {
      setError(rpcError.message)
      setLoading(false)
      return
    }
    setStatus(asStatus(data))
    setLoading(false)
  }, [characterId])

  useEffect(() => {
    void load()
    const channel = supabase
      .channel("ai-survival-status:" + characterId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "character_world_state",
          filter: `character_id=eq.${characterId}`,
        },
        () => void load(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "character_resource_states",
          filter: `character_id=eq.${characterId}`,
        },
        () => void load(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [characterId, load])

  const hunger = status?.survival?.hunger || {}
  const fatigue = status?.survival?.fatigue || {}
  const satiety = clampPercent(hunger.value)
  const alertness = clampPercent(fatigue.value)
  const hungerStage = Math.max(0, Math.min(3, Number(hunger.stage || 0)))
  const fatigueStage = Math.max(0, Math.min(3, Number(fatigue.stage || 0)))
  const activeStage = Math.max(hungerStage, fatigueStage)
  const activePenalty = Number(status?.survival?.roll?.flat_penalty || 0)

  const timeLabel = useMemo(() => {
    const minute = Number(status?.campaign_minute)
    return Number.isFinite(minute)
      ? formatExactCampaignTime(minute)
      : `День ${Math.max(1, Number(status?.campaign_day || 1))}`
  }, [status?.campaign_day, status?.campaign_minute])

  return (
    <div
      className="u1-survival-drawer-backdrop"
      role="presentation"
      data-swipe-navigation="ignore"
      onPointerDown={(event) => {
        if (event.currentTarget === event.target) onClose()
      }}
    >
      <aside
        className="u1-survival-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Статус персонажа"
        data-swipe-navigation="ignore"
      >
        <header className="u1-survival-drawer__head">
          <div>
            <span>AI WORLD / СТАТУС</span>
            <strong>{status?.character_name || "Персонаж"}</strong>
            <small>
              {activeStage > 0
                ? `Survival ${stageText(activeStage)} · ${pressureText(activeStage, activePenalty)}`
                : "Состояние стабильное"}
            </small>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть">×</button>
        </header>

        <div className="u1-survival-drawer__body">
          {loading ? (
            <div className="u1-survival-drawer__empty">Сверяем состояние мира…</div>
          ) : error ? (
            <div className="u1-survival-drawer__error">{error}</div>
          ) : (
            <>
              <section className="u1-survival-drawer__context">
                <div>
                  <small>Время</small>
                  <strong>{timeLabel}</strong>
                </div>
                <div>
                  <small>Локация</small>
                  <strong>{status?.location_name || "Не определена"}</strong>
                </div>
              </section>

              <section className="u1-survival-drawer__section">
                <div className="u1-survival-drawer__section-title">
                  <span>Выживание</span>
                  <small>0–100</small>
                </div>
                <SurvivalMeter
                  label="Сытость"
                  value={satiety}
                  stage={hungerStage}
                  penalty={Number(hunger.penalty || 0)}
                />
                <SurvivalMeter
                  label="Бодрость"
                  value={alertness}
                  stage={fatigueStage}
                  penalty={Number(fatigue.penalty || 0)}
                />
              </section>

              {activeStage > 0 ? (
                <section className="u1-survival-drawer__pressure">
                  <small>Активный штраф</small>
                  <strong>{pressureText(activeStage, activePenalty)}</strong>
                  <p>
                    Голод и усталость отображаются отдельно. Помеха применяется
                    один раз, числовой штраф берётся по худшему состоянию и не
                    складывается.
                  </p>
                </section>
              ) : null}

              <p className="u1-survival-drawer__hint">
                Время, еду, сон и нагрузку ведёт ИИ-ГМ. Ручных кнопок отдыха в
                AI-мире нет.
              </p>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}
