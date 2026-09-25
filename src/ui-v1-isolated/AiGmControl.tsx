import { useCallback, useEffect, useMemo, useState } from "react"

import { useAI } from "../ai/AIProvider"
import AgentShell from "../ai/AgentShell"
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

type RuntimeFeature = {
  key: string
  display_name: string
  summary: string
  enabled: boolean
  mutable: boolean
  state: "toggle" | "locked"
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

function modelMeta(model: ModelChoice | null) {
  if (!model) return "Модель не выбрана"

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

function behaviorLabel(profile: BehaviorChoice | null | undefined) {
  if (!profile) return "не выбран"
  if (profile.profile_key === "brutal") return "Хардкор / Жестокий"
  if (profile.profile_key === "sims") return "Симс"
  if (profile.profile_key === "adventure") return "Приключение"
  return profile.display_name
}

function contentLabel(mode: ContentMode | null | undefined) {
  if (mode === "adult_focused") return "18+ · Взрослая жизнь"
  if (mode === "allowed") return "18+ · Разрешено"
  return "18+ выключено"
}

export type AiGmControlPage = "overview" | "models" | "behavior"

export default function AiGmControl({
  page,
  onBack,
  onNavigate,
}: {
  page: AiGmControlPage
  onBack: () => void
  onNavigate: (page: Exclude<AiGmControlPage, "overview">) => void
}) {
  const { campaignId } = useAI()
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
  const selectedBehavior =
    panel?.behavior?.profiles.find((profile) => profile.selected) || null
  const selectedContentMode = panel?.content?.selected_mode || "off"
  const canManage = panel?.can_manage === true
  const pageTitle =
    page === "models"
      ? "Модели компании"
      : page === "behavior"
        ? "Настройки поведения ИИ"
        : "Настройки ИИ-ГМ"

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
    if (!campaignId || !canManage || !modelId) return

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
        ? "Старшая модель ИИ-ГМ сохранена."
        : "Младшая модель ИИ сохранена.",
    )
  }

  async function toggleFeature(feature: RuntimeFeature) {
    if (!campaignId || !canManage || !feature.mutable) return

    await saveAndReload(
      "feature:" + feature.key,
      async () => {
        const result = await supabase.rpc(
          "set_campaign_ai_gm_runtime_feature_v1",
          {
            p_campaign_id: campaignId,
            p_feature_key: feature.key,
            p_enabled: !feature.enabled,
          },
        )
        return { error: result.error }
      },
      feature.enabled
        ? "Функция отключена."
        : "Функция включена.",
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
          Загружаем настройки ИИ-ГМ…
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
          <h1>{pageTitle}</h1>
        </div>
        <button
          type="button"
          className="u1-ai-gm-control__refresh"
          onClick={() => void load(false)}
          disabled={Boolean(busy)}
          aria-label="Обновить настройки"
        >
          ↻
        </button>
      </header>

      {error && !panel ? (
        <section className="u1-ai-gm-control__empty">
          <strong>Не удалось загрузить настройки ИИ-ГМ</strong>
          <p>{error}</p>
          <button type="button" onClick={() => void load(true)}>
            Повторить
          </button>
        </section>
      ) : !panel?.ai_world ? (
        <section className="u1-ai-gm-control__empty">
          <strong>Это не ИИ-мир</strong>
          <p>Настройки старшего и младшего ИИ доступны внутри экспериментальной AI-кампании.</p>
        </section>
      ) : (
        <div className="u1-ai-gm-control__body">
          {page === "overview" && (
            <>
              <section className="u1-ai-gm-menu" aria-label="Разделы настроек ИИ-ГМ">
                <button
                  type="button"
                  className="u1-ai-gm-menu__entry"
                  onClick={() => onNavigate("models")}
                >
                  <span>
                    <b>Модели компании</b>
                    <small>
                      Старший: {gmModel?.display_name || "не выбрана"} · Младший:{" "}
                      {juniorModel?.display_name || "не выбрана"}
                    </small>
                  </span>
                  <i aria-hidden="true">›</i>
                </button>

                <button
                  type="button"
                  className="u1-ai-gm-menu__entry"
                  onClick={() => onNavigate("behavior")}
                >
                  <span>
                    <b>Настройки поведения ИИ</b>
                    <small>
                      {behaviorLabel(selectedBehavior)} · {contentLabel(selectedContentMode)} · автоматика мира
                    </small>
                  </span>
                  <i aria-hidden="true">›</i>
                </button>
              </section>

              {!canManage && (
                <div className="u1-ai-gm-control__notice">
                  Настройки кампании меняет владелец/ГМ.
                </div>
              )}

              {error && <div className="u1-ai-gm-control__error">{error}</div>}

              <section className="u1-ai-gm-assistant" aria-label="AI GM">
                <div className="u1-ai-gm-assistant__intro">
                  <span>AI GM</span>
                  <strong>Ассистент и управление компанией</strong>
                  <small>
                    Чаты, файлы, генерации и инструменты находятся здесь. Плавающий круглый интерфейс отключён.
                  </small>
                </div>
                <AgentShell embedded />
              </section>

            </>
          )}

          {page === "models" && (
            <>
              <section className="u1-ai-gm-card u1-ai-gm-card--models">
                <span className="u1-ai-gm-card__eyebrow">МОДЕЛИ КОМПАНИИ</span>
                <h2>Старший и младший ИИ</h2>
                <p>
                  Здесь выбираются обе модели кампании. Этот экран отдельный и
                  не делит место с настройками поведения.
                </p>

                <div className="u1-ai-gm-model-selectors">
                  <label>
                    <span>
                      <strong>Старший ИИ</strong>
                      <small>Ведущий, решения, проверки и ответы игроку</small>
                    </span>
                    <select
                      value={gmModel?.id || ""}
                      disabled={!canManage || Boolean(busy)}
                      onChange={(event) => void chooseModel("gm", event.target.value)}
                    >
                      {(panel.gm_models || []).map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.display_name}
                        </option>
                      ))}
                    </select>
                    <em>{modelMeta(gmModel)}</em>
                  </label>

                  <label>
                    <span>
                      <strong>Младший ИИ</strong>
                      <small>Шуршальщик, мир, сущности и фоновые задачи</small>
                    </span>
                    <select
                      value={juniorModel?.id || ""}
                      disabled={!canManage || Boolean(busy)}
                      onChange={(event) => void chooseModel("junior", event.target.value)}
                    >
                      {(panel.junior_models || []).map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.display_name}
                        </option>
                      ))}
                    </select>
                    <em>{modelMeta(juniorModel)}</em>
                  </label>
                </div>
              </section>

              {notice && <div className="u1-ai-gm-control__notice">{notice}</div>}
              {error && <div className="u1-ai-gm-control__error">{error}</div>}
            </>
          )}

          {page === "behavior" && (
            <>
              {panel.behavior && (
                <section className="u1-ai-gm-card">
                  <span className="u1-ai-gm-card__eyebrow">ХАРДКОР / ПРИКЛЮЧЕНИЕ / СИМС</span>
                  <h2>Режим кампании</h2>
                  <p>
                    Режим меняет строгость причинности и давление мира, но не
                    подменяет кубы, канон и самостоятельность NPC. В хардкоре
                    отдельно соблюдается реальный масштаб экономики: цены, доходы
                    и награды должны быть соразмерны миру, а не просто занижены.
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
                          <strong>{behaviorLabel(profile)}</strong>
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
                  <span className="u1-ai-gm-card__eyebrow">ДИРЕКТОР</span>
                  <h2>Что хочется встречать чаще</h2>
                  <p>
                    Мягкое направление будущих возможностей. Это не приказ миру
                    выдать игроку желаемый результат.
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
                  <span className="u1-ai-gm-card__eyebrow">18+ / ВЗРОСЛАЯ ТЕМАТИКА</span>
                  <h2>Контент кампании</h2>
                  <p>
                    Отдельно от режима мастера. Разрешает взрослые темы и задаёт,
                    насколько активно они могут появляться в естественном ходе
                    сцены.
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
                          <strong>
                            {choice.mode === "adult_focused"
                              ? "18+ · Взрослая жизнь"
                              : choice.mode === "allowed"
                                ? "18+ · Разрешено"
                                : "Выключено"}
                          </strong>
                          <small>{choice.summary}</small>
                        </span>
                        <i>{panel.content?.selected_mode === choice.mode ? "✓" : "›"}</i>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              <section className="u1-ai-gm-card">
                <span className="u1-ai-gm-card__eyebrow">ФУНКЦИИ ИИ-МИРА</span>
                <h2>Автоматика</h2>
                <p>
                  Дополнительные системы можно включать и выключать здесь.
                  Системы ядра отмечены замком.
                </p>

                <div className="u1-ai-gm-features">
                  {(panel.features || []).map((feature) => (
                    <article
                      key={feature.key}
                      data-enabled={feature.enabled || undefined}
                      data-locked={!feature.mutable || undefined}
                    >
                      <div>
                        <strong>{feature.display_name}</strong>
                        <small>{feature.summary}</small>
                      </div>

                      {feature.mutable ? (
                        <button
                          type="button"
                          className="u1-ai-gm-switch"
                          aria-pressed={feature.enabled}
                          aria-label={
                            (feature.enabled ? "Отключить: " : "Включить: ") +
                            feature.display_name
                          }
                          disabled={!canManage || Boolean(busy)}
                          onClick={() => void toggleFeature(feature)}
                        >
                          <i />
                        </button>
                      ) : (
                        <span className="u1-ai-gm-feature-lock">ядро</span>
                      )}
                    </article>
                  ))}
                </div>
              </section>

              {!canManage && (
                <div className="u1-ai-gm-control__notice">
                  Режим и функции кампании меняет владелец/ГМ.
                  Личные настройки директора доступны участнику для себя.
                </div>
              )}

              {notice && <div className="u1-ai-gm-control__notice">{notice}</div>}
              {error && <div className="u1-ai-gm-control__error">{error}</div>}
            </>
          )}
        </div>
      )}
    </main>
  )
}
