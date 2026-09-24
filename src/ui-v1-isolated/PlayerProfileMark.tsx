import { useCallback, useEffect, useMemo, useState } from "react"

import { useAI } from "../ai/AIProvider"
import { supabase } from "../lib/supabase"

type CampaignGmModel = {
  id: string
  model_key: string
  display_name: string
  supports_tools: boolean
  supports_json: boolean
  supports_vision: boolean
  context_window: number | null
  cost_tier: number
  reasoning_tier: number
  latency_tier: number
  selected: boolean
}

function contextLabel(value: number | null) {
  if (!value) return "Контекст не указан"
  if (value >= 1_000_000) {
    const millions = value / 1_000_000
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M контекст`
  }
  if (value >= 1_000) return `${Math.round(value / 1_000)}K контекст`
  return `${value} контекст`
}

export default function PlayerProfileMark() {
  const { campaignId, canManage } = useAI()
  const [open, setOpen] = useState(false)
  const [gmEnabled, setGmEnabled] = useState(false)
  const [models, setModels] = useState<CampaignGmModel[]>([])
  const [juniorModels, setJuniorModels] = useState<CampaignGmModel[]>([])
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [juniorSavingId, setJuniorSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedModel = useMemo(
    () => models.find((model) => model.selected) || null,
    [models],
  )
  const selectedJuniorModel = useMemo(
    () => juniorModels.find((model) => model.selected) || null,
    [juniorModels],
  )

  const refresh = useCallback(async () => {
    if (!campaignId) {
      setGmEnabled(false)
      setModels([])
      setJuniorModels([])
      return
    }

    setLoading(true)
    setError(null)

    const scopeResult = await supabase.rpc("is_ai_world_campaign_v1", {
      p_campaign_id: campaignId,
    })

    if (scopeResult.error || scopeResult.data !== true) {
      setGmEnabled(false)
      setModels([])
      setJuniorModels([])
      setLoading(false)
      return
    }

    setGmEnabled(true)

    const [gmModelsResult, juniorModelsResult] = await Promise.all([
      supabase.rpc("list_campaign_gm_models_v1", {
        p_campaign_id: campaignId,
      }),
      supabase.rpc("list_campaign_ai_junior_models_v1", {
        p_campaign_id: campaignId,
      }),
    ])

    const readError = gmModelsResult.error || juniorModelsResult.error
    if (readError) {
      setError(readError.message)
      setLoading(false)
      return
    }

    setModels((gmModelsResult.data || []) as CampaignGmModel[])
    setJuniorModels((juniorModelsResult.data || []) as CampaignGmModel[])
    setLoading(false)
  }, [campaignId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  async function chooseModel(modelId: string) {
    if (!campaignId || !gmEnabled || !canManage || savingId) return

    setSavingId(modelId)
    setError(null)

    const { error: writeError } = await supabase.rpc(
      "set_campaign_gm_model_v1",
      {
        p_campaign_id: campaignId,
        p_model_id: modelId,
      },
    )

    if (writeError) {
      setError(writeError.message)
      setSavingId(null)
      return
    }

    await refresh()
    setSavingId(null)
  }

  async function chooseJuniorModel(modelId: string) {
    if (!campaignId || !gmEnabled || !canManage || juniorSavingId) return

    setJuniorSavingId(modelId)
    setError(null)

    const { error: writeError } = await supabase.rpc(
      "set_campaign_ai_junior_model_v1",
      {
        p_campaign_id: campaignId,
        p_model_id: modelId,
      },
    )

    if (writeError) {
      setError(writeError.message)
      setJuniorSavingId(null)
      return
    }

    await refresh()
    setJuniorSavingId(null)
  }

  if (!campaignId || !gmEnabled) return null

  return (
    <>
      <button
        className="u1-avatar u1-ai-model-trigger"
        type="button"
        aria-label="Модель ИИ-ведущего"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={
          selectedModel
            ? `ИИ-ведущий · ${selectedModel.display_name}`
            : "Модель ИИ-ведущего"
        }
        onClick={() => setOpen(true)}
        disabled={!campaignId}
      >
        AI
      </button>

      {open && (
        <div
          className="u1-ai-model-shade"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <section
            className="u1-ai-model-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="u1-ai-model-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="u1-ai-model-sheet__head">
              <div>
                <small>ИИ-ВЕДУЩИЙ</small>
                <strong id="u1-ai-model-title">Модели кампании</strong>
              </div>
              <button
                type="button"
                className="u1-ai-model-sheet__close"
                aria-label="Закрыть выбор модели"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </header>

            <div className="u1-ai-model-sheet__current">
              <span>Основной ГМ</span>
              <strong>
                {selectedModel?.display_name ||
                  (loading ? "Загрузка…" : "Не выбрана")}
              </strong>
              <small>
                {canManage
                  ? "Следующий ход ИИ-ГМ использует выбранную здесь модель."
                  : "Модель задаёт мастер кампании."}
              </small>
            </div>

            <div className="u1-ai-model-list" aria-busy={loading}>
              {models.map((model) => (
                <button
                  type="button"
                  key={model.id}
                  className="u1-ai-model-choice"
                  data-selected={model.selected || undefined}
                  disabled={!canManage || Boolean(savingId)}
                  onClick={() => void chooseModel(model.id)}
                >
                  <span className="u1-ai-model-choice__mark" aria-hidden="true">
                    {model.selected ? "●" : "○"}
                  </span>
                  <span className="u1-ai-model-choice__copy">
                    <strong>{model.display_name}</strong>
                    <small>
                      {contextLabel(model.context_window)}
                      {model.supports_vision ? " · изображения" : " · текст"}
                      {model.supports_tools ? " · инструменты" : ""}
                    </small>
                  </span>
                  {savingId === model.id && <b>…</b>}
                </button>
              ))}

              {!loading && models.length === 0 && !error && (
                <div className="u1-ai-model-sheet__empty">
                  Нет доступных моделей ИИ-ГМ.
                </div>
              )}
            </div>

            <div className="u1-ai-model-sheet__current">
              <span>Младший ИИ</span>
              <strong>
                {selectedJuniorModel?.display_name ||
                  (loading ? "Загрузка…" : "Не выбрана")}
              </strong>
              <small>
                Один выбор для materializer, mechanic worker, post-turn,
                фоновой симуляции и 45-message maintenance.
              </small>
            </div>

            <div className="u1-ai-model-list" aria-busy={loading}>
              {juniorModels.map((model) => (
                <button
                  type="button"
                  key={"junior-" + model.id}
                  className="u1-ai-model-choice"
                  data-selected={model.selected || undefined}
                  disabled={!canManage || Boolean(juniorSavingId)}
                  onClick={() => void chooseJuniorModel(model.id)}
                >
                  <span className="u1-ai-model-choice__mark" aria-hidden="true">
                    {model.selected ? "●" : "○"}
                  </span>
                  <span className="u1-ai-model-choice__copy">
                    <strong>{model.display_name}</strong>
                    <small>
                      {contextLabel(model.context_window)}
                      {model.supports_vision ? " · изображения" : " · текст"}
                      {model.supports_tools ? " · инструменты" : ""}
                    </small>
                  </span>
                  {juniorSavingId === model.id && <b>…</b>}
                </button>
              ))}

              {!loading && juniorModels.length === 0 && !error && (
                <div className="u1-ai-model-sheet__empty">
                  Нет доступных моделей младшего ИИ.
                </div>
              )}
            </div>

            {error && (
              <div className="u1-ai-model-sheet__error" role="status">
                {error}
              </div>
            )}

            {!canManage && (
              <footer className="u1-ai-model-sheet__foot">
                Выбор доступен только GM или владельцу кампании.
              </footer>
            )}
          </section>
        </div>
      )}
    </>
  )
}
