import { useCallback, useEffect, useMemo, useState } from "react"

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
  dimensions?: Record<string, number>
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

type RuntimeFeature = {
  key: string
  display_name: string
  summary: string
  state: "always_on" | "triggered"
}

type ControlPanelResponse = {
  campaign_id: string
  ai_world: boolean
  can_manage: boolean
  gm_models: ModelChoice[]
  junior_models: ModelChoice[]
  behavior: BehaviorResponse | null
  director: DirectorResponse | null
  content: ContentResponse | null
  features: RuntimeFeature[]
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

  return [
    context + " контекст",
    "reasoning " + model.reasoning_tier,
    model.supports_tools ? "tools" : null,
    model.supports_vision ? "vision" : null,
  ].filter(Boolean).join(" · ")
}

function selectedModel(models: ModelChoice[]) {
  return models.find((model) => model.selected) || models[0] || null
}

export default function AiGmControl({ onBack }: { onBack: () => void }) {
  const { campaignId, assistantName } = useAI()
  const [panel, setPanel] = useState<ControlPanelResponse | null>(null)
  const [directorDraft, setDirectorDraft] = useState<DirectorResponse | null>(null)
  const [directorDirty, setDirectorDirty] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState("")
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")

  const load = useCallback(async (showSpinner = true) => {
    if (!campaignId) {
      setError("Кампания ещё не выбрана.")
      setLoading(false)
      return
    }

    if (showSpinner) setLoading(true)
    setError("")

    const { data, error: loadError } = await supabase.rpc(
      "read_ai_gm_control_panel_v1",
      { p_campaign_id: campaignId },
    )

    if (loadError || !data) {
      setError(loadError?.message || "Не удалось прочитать настройки ИИ-ГМ.")
      setLoading(false)
      return
    }

    const next = data as ControlPanelResponse
    setPanel(next)
    setDirectorDraft(next.director)
    setDirectorDirty(false)
    setLoading(false)
  }, [campaignId])

  useEffect(() => {
    void load()
  }, [load])

  const gmModel = useMemo(
    () => selectedModel(panel?.gm_models || []),
    [panel?.gm_models],
  )
  const juniorModel = useMemo(
    () => selectedModel(panel?.junior_models || []),
    [panel?.junior_models],
  )

  const canManage = panel?.can_manage === true

  async function saveAndReload(
    key: string,
    request: () => Promise<{ error: { message: string } | null }>,
    successMessage: string,
  ) {
    if (busy) return
    setBusy(key)
    setError("")
    setNotice("")

    const result = await request()
    if (result.error) {
      setError(result.error.message)
      setBusy("")
      return
    }

    await load(false)
    setNotice(successMessage)
    setBusy("")
  }

  async function chooseModel(kind: "gm" | "junior", modelId: string) {
    if (!campaignId || !canManage) return

    await saveAndReload(
      kind + ":" + modelId,
      async () => {
        const rpc =
          kind === "gm"
            ? "set_campaign_gm_model_v1"
            : "set_campaign_ai_junior_model_v1"
        const result = await supabase.rpc(rpc, {
          p_campaign_id: campaignId,
          p_model_id: modelId,
        })
        return { error: result.error }
      },
      kind === "gm"
        ? "Модель главного ИИ-ГМ сохранена."
        : "Модель младшего шуршальщика сохранена.",
    )
  }

  async function chooseBehavior(profileKey: string) {
    if (!campaignId || !canManage) return

    await saveAndReload(
      "behavior:" + profileKey,
      async () => {
        const result = await supabase.rpc(
          "set_campaign_ai_gm_behavior_profile_v1",
          {
            p_campaign_id: campaignId,
            p_profile_key: profileKey,
          },
        )
        return { error: result.error }
      },
      "Режим ИИ-ГМ сохранён.",
    )
  }

  async function chooseContent(mode: ContentMode) {
    if (!campaignId || !canManage) return

    await saveAndReload(
      "content:" + mode,
      async () => {
        const result = await supabase.rpc(
          "set_campaign_ai_gm_content_profile_v1",
          {
            p_campaign_id: campaignId,
            p_mode: mode,
          },
        )
        return { error: result.error }
      },
      "Контент-профиль сохранён.",
    )
  }

  function setInterest(key: DirectorKey, value: number) {
    setDirectorDraft((current) =>
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
    if (!campaignId || !directorDraft || busy) return

    setBusy("director")
    setError("")
    setNotice("")

    const interests = directorDraft.interests
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
        p_free_text: directorDraft.free_text,
      },
    )

    if (result.error) {
      setError(result.error.message)
      setBusy("")
      return
    }

    await load(false)
    setNotice("Предпочтения директора сохранены.")
    setBusy("")
  }

  if (loading) {
    return (
      <main className="u1-ai-gm-control">
        <div className="u1-ai-gm-control__loading">
          Поднимаем настоящий пульт ИИ-ГМ…
        </div>
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
          className="u1-ai-gm-control__refresh"
          onClick={() => void load(false)}
          disabled={Boolean(busy)}
        >
          ↻
        </button>
      </header>

      {!panel?.ai_world ? (
        <section className="u1-ai-gm-control__empty">
          <strong>Это не ИИ-мир</strong>
          <p>Настройки главного и младшего ИИ доступны внутри экспериментальной AI-кампании.</p>
          {error && <p>{error}</p>}
        </section>
      ) : (
        <div className="u1-ai-gm-control__body">
          <section className="u1-ai-gm-overview">
            <div>
              <span>ГЛАВНЫЙ</span>
              <strong>{gmModel?.display_name || "Не выбран"}</strong>
              <small>Ведёт сцену и принимает решения.</small>
            </div>
            <div>
              <span>МЛАДШИЙ</span>
              <strong>{juniorModel?.display_name || "Не выбран"}</strong>
              <small>Шуршит канон после ответа.</small>
            </div>
          </section>

          <section className="u1-ai-gm-card">
            <span className="u1-ai-gm-card__eyebrow">01 · ГЛАВНЫЙ ИИ</span>
            <h2>Модель мастера</h2>
            <p>
              Именно эта модель пишет ответ игроку, назначает проверки и решает,
              что логично происходит в сцене.
            </p>
            <div className="u1-ai-gm-models">
              {(panel.gm_models || []).map((model) => (
                <button
                  key={model.id}
                  type="button"
                  className="u1-ai-gm-choice"
                  data-selected={model.selected || undefined}
                  disabled={!canManage || Boolean(busy)}
                  onClick={() => void chooseModel("gm", model.id)}
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
            <span className="u1-ai-gm-card__eyebrow">02 · МЛАДШИЙ ИИ</span>
            <h2>Шуршальщик</h2>
            <p>
              Не переписывает решение мастера. Его работа — после ответа
              создать или обновить нужные сущности и довести базу до уже
              объявленного канона.
            </p>
            <div className="u1-ai-gm-models">
              {(panel.junior_models || []).map((model) => (
                <button
                  key={model.id}
                  type="button"
                  className="u1-ai-gm-choice"
                  data-selected={model.selected || undefined}
                  disabled={!canManage || Boolean(busy)}
                  onClick={() => void chooseModel("junior", model.id)}
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

          {panel.behavior && (
            <section className="u1-ai-gm-card">
              <span className="u1-ai-gm-card__eyebrow">03 · РЕЖИМ МАСТЕРА</span>
              <h2>Как мир давит на игрока</h2>
              <p>
                Режим меняет выбор между одинаково правдоподобными ветками.
                Канон, кубы и характер NPC он не переписывает.
              </p>
              <div className="u1-ai-gm-behaviors">
                {panel.behavior.profiles.map((profile) => (
                  <button
                    key={profile.profile_key}
                    type="button"
                    className="u1-ai-gm-choice u1-ai-gm-choice--behavior"
                    data-selected={profile.selected || undefined}
                    disabled={!canManage || Boolean(busy)}
                    onClick={() => void chooseBehavior(profile.profile_key)}
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

          {directorDraft && (
            <section className="u1-ai-gm-card">
              <span className="u1-ai-gm-card__eyebrow">04 · ДИРЕКТОР</span>
              <h2>Что тебе интереснее играть</h2>
              <p>
                Это мягкое направление будущих возможностей, а не чит-код.
                NPC всё ещё могут отказать, а мир не обязан исполнять желание.
              </p>
              <div className="u1-ai-gm-sliders">
                {DIRECTOR_CONTROLS.map((control) => (
                  <label key={control.key}>
                    <span>
                      <strong>{control.label}</strong>
                      <b>{directorDraft.interests[control.key]}</b>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={5}
                      step={1}
                      value={directorDraft.interests[control.key]}
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
                <span>Свободное направление</span>
                <textarea
                  value={directorDraft.free_text}
                  maxLength={1200}
                  rows={4}
                  onChange={(event) => {
                    setDirectorDraft((current) =>
                      current
                        ? { ...current, free_text: event.target.value.slice(0, 1200) }
                        : current,
                    )
                    setDirectorDirty(true)
                  }}
                  placeholder="Например: больше городской социалки, медленная жизнь, торговля и жильё; боёв поменьше."
                />
              </label>

              <button
                type="button"
                className="u1-ai-gm-save"
                disabled={!directorDirty || Boolean(busy)}
                onClick={() => void saveDirector()}
              >
                {busy === "director" ? "Сохраняем…" : "Сохранить предпочтения"}
              </button>
            </section>
          )}

          {panel.content && (
            <section className="u1-ai-gm-card">
              <span className="u1-ai-gm-card__eyebrow">05 · КОНТЕНТ-ПРОФИЛЬ</span>
              <h2>Зрелая / life-sim тематика</h2>
              <p>
                Это профиль приложения. Он не отменяет ограничения провайдера,
                причинность мира и самостоятельность NPC.
              </p>
              <div className="u1-ai-gm-behaviors">
                {panel.content.modes.map((choice) => (
                  <button
                    key={choice.mode}
                    type="button"
                    className="u1-ai-gm-choice"
                    data-selected={panel.content?.selected_mode === choice.mode || undefined}
                    disabled={!canManage || Boolean(busy)}
                    onClick={() => void chooseContent(choice.mode)}
                  >
                    <span>
                      <strong>{choice.display_name}</strong>
                      <small>{choice.summary}</small>
                    </span>
                    <i>{panel.content?.selected_mode === choice.mode ? "✓" : "›"}</i>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="u1-ai-gm-card">
            <span className="u1-ai-gm-card__eyebrow">06 · ФУНКЦИИ МИРА</span>
            <h2>Что работает автоматически</h2>
            <p>
              Эти функции являются частью причинного ядра ИИ-мира. Их нельзя
              случайно отключить галочкой и потом удивляться, почему канон
              разъехался с чатом.
            </p>
            <div className="u1-ai-gm-features">
              {(panel.features || []).map((feature) => (
                <article key={feature.key}>
                  <div>
                    <strong>{feature.display_name}</strong>
                    <small>{feature.summary}</small>
                  </div>
                  <span data-triggered={feature.state === "triggered" || undefined}>
                    {feature.state === "triggered" ? "по триггеру" : "включено"}
                  </span>
                </article>
              ))}
            </div>
          </section>

          {!canManage && (
            <div className="u1-ai-gm-control__notice">
              Модели и режим кампании меняет владелец/ГМ. Личные настройки
              директора доступны каждому участнику для себя.
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
            <small>Фредди — отдельный дворецкий/админ, а не вход в настройки ИИ-ГМ.</small>
          </button>
        </div>
      )}
    </main>
  )
}
