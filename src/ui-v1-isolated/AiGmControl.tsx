import { useCallback, useEffect, useState } from "react"

import { useAI } from "../ai/AIProvider"
import { openAgent } from "../ai/agentUiBridge"
import { supabase } from "../lib/supabase"
import "./ai-gm-control.css"

type ModelChoice = {
  id: string
  model_key: string
  display_name: string
  supports_tools: boolean
  supports_json: boolean
  supports_vision: boolean
  context_window: number
  cost_tier: number
  reasoning_tier: number
  latency_tier: number
  selected: boolean
}

type BehaviorChoice = {
  profile_key: string
  display_name: string
  summary: string
  selected: boolean
}

type BehaviorResponse = {
  ai_world: boolean
  can_manage: boolean
  selected_profile_key: string
  profiles: BehaviorChoice[]
}

type ContentMode = "off" | "allowed" | "adult_focused"

type ContentResponse = {
  ai_world: boolean
  selected_mode: ContentMode
  modes: Array<{
    mode: ContentMode
    display_name: string
    summary: string
  }>
}

type DirectorKey =
  | "combat"
  | "exploration"
  | "investigation"
  | "social_play"
  | "romance"
  | "daily_life"
  | "horror"
  | "politics_intrigue"
  | "economy_property"
  | "pacing"

type DirectorResponse = {
  ai_world: boolean
  configured: boolean
  version: number
  interests: Record<DirectorKey, number>
  free_text: string
  updated_at: string | null
}

const DIRECTOR_CONTROLS: Array<{
  key: DirectorKey
  label: string
  low: string
  high: string
}> = [
  { key: "combat", label: "Бои", low: "реже", high: "чаще" },
  { key: "exploration", label: "Исследование", low: "меньше", high: "больше" },
  { key: "investigation", label: "Расследования", low: "меньше", high: "больше" },
  { key: "social_play", label: "Социалка", low: "меньше", high: "больше" },
  { key: "romance", label: "Романтика", low: "меньше", high: "больше" },
  { key: "daily_life", label: "Обычная жизнь", low: "меньше", high: "больше" },
  { key: "horror", label: "Хоррор", low: "меньше", high: "больше" },
  { key: "politics_intrigue", label: "Политика / интриги", low: "меньше", high: "больше" },
  { key: "economy_property", label: "Деньги / имущество", low: "меньше", high: "больше" },
  { key: "pacing", label: "Темп", low: "медленнее", high: "быстрее" },
]

function modelMeta(model: ModelChoice) {
  const context =
    model.context_window >= 1_000_000
      ? Math.round(model.context_window / 1_000_000) + "M"
      : Math.round(model.context_window / 1000) + "K"

  const parts = [
    context + " контекст",
    model.supports_tools ? "tools" : null,
    model.supports_vision ? "vision" : null,
  ].filter(Boolean)

  return parts.join(" · ")
}

export default function AiGmControl({ onBack }: { onBack: () => void }) {
  const { campaignId, canManage, assistantName } = useAI()
  const [loading, setLoading] = useState(true)
  const [aiWorld, setAiWorld] = useState(false)
  const [gmModels, setGmModels] = useState<ModelChoice[]>([])
  const [juniorModels, setJuniorModels] = useState<ModelChoice[]>([])
  const [behavior, setBehavior] = useState<BehaviorResponse | null>(null)
  const [content, setContent] = useState<ContentResponse | null>(null)
  const [director, setDirector] = useState<DirectorResponse | null>(null)
  const [directorDirty, setDirectorDirty] = useState(false)
  const [busy, setBusy] = useState("")
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    if (!campaignId) return
    setLoading(true)
    setError("")

    const behaviorResult = await supabase.rpc(
      "list_campaign_ai_gm_behavior_profiles_v1",
      { p_campaign_id: campaignId },
    )

    if (behaviorResult.error || !behaviorResult.data) {
      setError(behaviorResult.error?.message || "Не удалось прочитать настройки ИИ-ГМ.")
      setLoading(false)
      return
    }

    const nextBehavior = behaviorResult.data as BehaviorResponse
    setBehavior(nextBehavior)
    setAiWorld(nextBehavior.ai_world === true)

    if (!nextBehavior.ai_world) {
      setGmModels([])
      setJuniorModels([])
      setContent(null)
      setDirector(null)
      setLoading(false)
      return
    }

    const [gmResult, juniorResult, directorResult, contentResult] =
      await Promise.all([
        supabase.rpc("list_campaign_gm_models_v1", {
          p_campaign_id: campaignId,
        }),
        supabase.rpc("list_campaign_ai_junior_models_v1", {
          p_campaign_id: campaignId,
        }),
        supabase.rpc("read_my_ai_director_preferences_v1", {
          p_campaign_id: campaignId,
        }),
        supabase.rpc("list_campaign_ai_gm_content_profiles_v1", {
          p_campaign_id: campaignId,
        }),
      ])

    const firstError =
      gmResult.error ||
      juniorResult.error ||
      directorResult.error ||
      contentResult.error

    if (firstError) {
      setError(firstError.message)
      setLoading(false)
      return
    }

    setGmModels((gmResult.data || []) as ModelChoice[])
    setJuniorModels((juniorResult.data || []) as ModelChoice[])
    setDirector(directorResult.data as DirectorResponse)
    setContent(contentResult.data as ContentResponse)
    setDirectorDirty(false)
    setLoading(false)
  }, [campaignId])

  useEffect(() => {
    void load()
  }, [load])

  async function setModel(kind: "gm" | "junior", modelId: string) {
    if (!campaignId || !canManage || busy) return
    setBusy(kind + ":" + modelId)
    setError("")
    setNotice("")

    const rpc =
      kind === "gm"
        ? "set_campaign_gm_model_v1"
        : "set_campaign_ai_junior_model_v1"

    const result = await supabase.rpc(rpc, {
      p_campaign_id: campaignId,
      p_model_id: modelId,
    })

    if (result.error) {
      setError(result.error.message)
    } else {
      const setter = kind === "gm" ? setGmModels : setJuniorModels
      setter((current) =>
        current.map((model) => ({
          ...model,
          selected: model.id === modelId,
        })),
      )
      setNotice(
        kind === "gm"
          ? "Модель главного ИИ-ГМ сохранена."
          : "Модель младшего шуршальщика сохранена.",
      )
    }
    setBusy("")
  }

  async function chooseBehaviorProfile(profileKey: string) {
    if (!campaignId || !canManage || busy) return
    setBusy("behavior:" + profileKey)
    setError("")
    setNotice("")

    const result = await supabase.rpc(
      "set_campaign_ai_gm_behavior_profile_v1",
      {
        p_campaign_id: campaignId,
        p_profile_key: profileKey,
      },
    )

    if (result.error) {
      setError(result.error.message)
    } else {
      setBehavior((current) =>
        current
          ? {
              ...current,
              selected_profile_key: profileKey,
              profiles: current.profiles.map((profile) => ({
                ...profile,
                selected: profile.profile_key === profileKey,
              })),
            }
          : current,
      )
      setNotice("Стиль ИИ-ГМ сохранён.")
    }
    setBusy("")
  }

  async function setContentMode(mode: ContentMode) {
    if (!campaignId || !canManage || busy) return
    setBusy("content:" + mode)
    setError("")
    setNotice("")

    const result = await supabase.rpc(
      "set_campaign_ai_gm_content_profile_v1",
      {
        p_campaign_id: campaignId,
        p_mode: mode,
      },
    )

    if (result.error) {
      setError(result.error.message)
    } else {
      setContent((current) =>
        current ? { ...current, selected_mode: mode } : current,
      )
      setNotice("Контент-профиль сохранён.")
    }
    setBusy("")
  }

  function setInterest(key: DirectorKey, value: number) {
    setDirector((current) =>
      current
        ? {
            ...current,
            interests: {
              ...current.interests,
              [key]: Math.max(0, Math.min(5, Math.round(value))),
            },
          }
        : current,
    )
    setDirectorDirty(true)
  }

  async function saveDirector() {
    if (!campaignId || !director || busy) return
    setBusy("director")
    setError("")
    setNotice("")

    const interests = director.interests
    const result = await supabase.rpc(
      "set_my_ai_director_preferences_v1",
      {
        p_campaign_id: campaignId,
        p_combat: interests.combat,
        p_exploration: interests.exploration,
        p_investigation: interests.investigation,
        p_social_play: interests.social_play,
        p_romance: interests.romance,
        p_daily_life: interests.daily_life,
        p_horror: interests.horror,
        p_politics_intrigue: interests.politics_intrigue,
        p_economy_property: interests.economy_property,
        p_pacing: interests.pacing,
        p_free_text: director.free_text,
      },
    )

    if (result.error) {
      setError(result.error.message)
    } else if (result.data && typeof result.data === "object") {
      setDirector(result.data as DirectorResponse)
      setDirectorDirty(false)
      setNotice("Предпочтения директора сохранены.")
    }
    setBusy("")
  }

  if (loading) {
    return (
      <main className="u1-ai-gm-control">
        <div className="u1-ai-gm-control__loading">Поднимаем пульт ИИ-ГМ…</div>
      </main>
    )
  }

  return (
    <main className="u1-ai-gm-control">
      <header className="u1-ai-gm-control__header">
        <button type="button" onClick={onBack} aria-label="Назад">‹</button>
        <div>
          <span>MEGANOT / AI WORLD</span>
          <h1>Управление ИИ-ГМ</h1>
        </div>
        <button
          type="button"
          className="u1-ai-gm-control__freddy"
          onClick={() => openAgent()}
        >
          {assistantName}
        </button>
      </header>

      {!aiWorld ? (
        <section className="u1-ai-gm-control__empty">
          <strong>Это не ИИ-мир</strong>
          <p>Пульт ИИ-ГМ доступен для экспериментальной AI-кампании.</p>
        </section>
      ) : (
        <div className="u1-ai-gm-control__body">
          <section className="u1-ai-gm-card u1-ai-gm-card--status">
            <span className="u1-ai-gm-card__eyebrow">АРХИТЕКТУРА</span>
            <h2>Главный решает, младший шуршит</h2>
            <p>
              Главный ИИ ведёт сцену. Младший материализует нужные локации,
              NPC, квесты, связи и каноническое состояние после решения мастера.
              Пустой мир может наращиваться по ходу игры.
            </p>
          </section>

          <section className="u1-ai-gm-card">
            <span className="u1-ai-gm-card__eyebrow">ГЛАВНЫЙ ИИ</span>
            <h2>Мастер</h2>
            <p>Ведёт сцену, принимает решения и формирует задания младшему.</p>
            <div className="u1-ai-gm-models">
              {gmModels.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  className="u1-ai-gm-choice"
                  data-selected={model.selected || undefined}
                  disabled={!canManage || Boolean(busy)}
                  onClick={() => void setModel("gm", model.id)}
                >
                  <span>
                    <strong>{model.display_name}</strong>
                    <small>{modelMeta(model)}</small>
                  </span>
                  <i>{model.selected ? "✓" : "›"}</i>
                </button>
              ))}
            </div>
          </section>

          <section className="u1-ai-gm-card">
            <span className="u1-ai-gm-card__eyebrow">МЛАДШИЙ ИИ</span>
            <h2>Шуршальщик</h2>
            <p>
              Выполняет канонические изменения мира и не переписывает решение
              главного мастера.
            </p>
            <div className="u1-ai-gm-models">
              {juniorModels.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  className="u1-ai-gm-choice"
                  data-selected={model.selected || undefined}
                  disabled={!canManage || Boolean(busy)}
                  onClick={() => void setModel("junior", model.id)}
                >
                  <span>
                    <strong>{model.display_name}</strong>
                    <small>{modelMeta(model)}</small>
                  </span>
                  <i>{model.selected ? "✓" : "›"}</i>
                </button>
              ))}
            </div>
          </section>

          {behavior && (
            <section className="u1-ai-gm-card">
              <span className="u1-ai-gm-card__eyebrow">ПОВЕДЕНИЕ</span>
              <h2>Стиль мастера</h2>
              <div className="u1-ai-gm-behaviors">
                {behavior.profiles.map((profile) => (
                  <button
                    key={profile.profile_key}
                    type="button"
                    className="u1-ai-gm-choice"
                    data-selected={profile.selected || undefined}
                    disabled={!canManage || Boolean(busy)}
                    onClick={() => void chooseBehaviorProfile(profile.profile_key)}
                  >
                    <span>
                      <strong>{profile.display_name}</strong>
                      <small>{profile.summary}</small>
                    </span>
                    <i>{profile.selected ? "✓" : "›"}</i>
                  </button>
                ))}
              </div>
            </section>
          )}

          {director && (
            <section className="u1-ai-gm-card">
              <span className="u1-ai-gm-card__eyebrow">ДИРЕКТОР</span>
              <h2>Что тебе интереснее</h2>
              <p>
                Это не приказ миру. Значения помогают выбирать между одинаково
                правдоподобными возможностями.
              </p>
              <div className="u1-ai-gm-sliders">
                {DIRECTOR_CONTROLS.map((control) => (
                  <label key={control.key}>
                    <span>
                      <strong>{control.label}</strong>
                      <b>{director.interests[control.key]}</b>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={5}
                      step={1}
                      value={director.interests[control.key]}
                      onChange={(event) =>
                        setInterest(control.key, Number(event.target.value))
                      }
                    />
                    <small>
                      <i>{control.low}</i>
                      <i>{control.high}</i>
                    </small>
                  </label>
                ))}
              </div>

              <label className="u1-ai-gm-free-text">
                <span>Свободная настройка</span>
                <textarea
                  value={director.free_text}
                  maxLength={1200}
                  rows={4}
                  onChange={(event) => {
                    setDirector((current) =>
                      current
                        ? { ...current, free_text: event.target.value.slice(0, 1200) }
                        : current,
                    )
                    setDirectorDirty(true)
                  }}
                  placeholder="Например: больше городской социалки, меньше случайных боёв."
                />
              </label>
              <button
                type="button"
                className="u1-ai-gm-save"
                disabled={!directorDirty || Boolean(busy)}
                onClick={() => void saveDirector()}
              >
                {busy === "director" ? "Сохраняем…" : "Сохранить интересы"}
              </button>
            </section>
          )}

          {content && (
            <section className="u1-ai-gm-card">
              <span className="u1-ai-gm-card__eyebrow">КОНТЕНТ</span>
              <h2>Профиль сцен</h2>
              <div className="u1-ai-gm-behaviors">
                {content.modes.map((choice) => (
                  <button
                    key={choice.mode}
                    type="button"
                    className="u1-ai-gm-choice"
                    data-selected={content.selected_mode === choice.mode || undefined}
                    disabled={!canManage || Boolean(busy)}
                    onClick={() => void setContentMode(choice.mode)}
                  >
                    <span>
                      <strong>{choice.display_name}</strong>
                      <small>{choice.summary}</small>
                    </span>
                    <i>{content.selected_mode === choice.mode ? "✓" : "›"}</i>
                  </button>
                ))}
              </div>
            </section>
          )}

          {!canManage && (
            <div className="u1-ai-gm-control__notice">
              Режимы кампании доступны владельцу или ГМ. Личные интересы можно
              менять для своего директора.
            </div>
          )}

          {notice && <div className="u1-ai-gm-control__notice">{notice}</div>}
          {error && <div className="u1-ai-gm-control__error">{error}</div>}

          <button
            type="button"
            className="u1-ai-gm-open-freddy"
            onClick={() => openAgent()}
          >
            <span>Открыть {assistantName}</span>
            <small>Ручное управление миром и каноном</small>
          </button>
        </div>
      )}
    </main>
  )
}
