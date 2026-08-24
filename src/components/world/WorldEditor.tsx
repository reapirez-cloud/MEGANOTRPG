import { useState } from "react"
import type { FormEvent } from "react"
import type { Character, CampaignMember } from "../../context/CharacterContext"
import type { LocationEntry, LocationSection } from "../../types/world"

export type WorldEditorMode =
  | { type: "campaign" }
  | { type: "world-section" }
  | { type: "article"; sectionId: string }
  | { type: "location"; parentId: string | null }
  | { type: "location-section"; locationId: string }
  | { type: "location-link"; section: LocationSection }
  | { type: "achievement" }
  | { type: "update" }
  | null

type AsyncResult = Promise<{ ok: boolean; error?: string }>

type Props = {
  mode: WorldEditorMode
  onClose: () => void
  campaignTitle: string
  locations: LocationEntry[]
  characters: Character[]
  members: CampaignMember[]
  updateCampaignTitle: (title: string) => AsyncResult
  createWorldSection: (title: string, description: string) => AsyncResult
  createWorldArticle: (sectionId: string, title: string, summary: string, body: string) => AsyncResult
  createLocation: (input: {
    parent_location_id: string | null
    name: string
    summary: string
    description: string
    image_url: string | null
  }) => AsyncResult
  createLocationSection: (locationId: string, title: string, body: string) => AsyncResult
  createLocationLink: (sectionId: string, targetLocationId: string, label: string) => AsyncResult
  createAchievement: (input: {
    character_id: string | null
    title: string
    description: string
    icon: string
  }) => AsyncResult
  createUpdate: (input: {
    kind: "change" | "announcement"
    title: string
    body: string
  }) => AsyncResult
}

export default function WorldEditor(props: Props) {
  const { mode } = props
  const [title, setTitle] = useState(mode?.type === "campaign" ? props.campaignTitle : "")
  const [summary, setSummary] = useState("")
  const [body, setBody] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [targetId, setTargetId] = useState("")
  const [characterId, setCharacterId] = useState("")
  const [icon, setIcon] = useState("★")
  const [kind, setKind] = useState<"change" | "announcement">("change")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  if (!mode) return null

  // Important for TypeScript: keep a non-null, immutable reference.
  // `submit` is a nested async function, so narrowing the nullable prop
  // directly is not preserved reliably across the closure.
  const currentMode = mode

  const editorTitle =
    currentMode.type === "campaign" ? "Название кампании" :
    currentMode.type === "world-section" ? "Новый раздел мира" :
    currentMode.type === "article" ? "Новая запись" :
    currentMode.type === "location" ? (currentMode.parentId ? "Новая подлокация" : "Новая локация") :
    currentMode.type === "location-section" ? "Раздел локации" :
    currentMode.type === "location-link" ? "Переход к локации" :
    currentMode.type === "achievement" ? "Новое достижение" :
    "Запись GM"

  const sourceLocationId =
    currentMode.type === "location-link" ? currentMode.section.location_id : null
  const targets = props.locations.filter((location) => location.id !== sourceLocationId)

  async function submit(event: FormEvent) {
    event.preventDefault()

    if (currentMode.type !== "location-link" && !title.trim()) {
      setError("Нужно название.")
      return
    }

    if (currentMode.type === "location-link" && !targetId) {
      setError("Выбери локацию для перехода.")
      return
    }

    setSaving(true)
    setError("")

    let result: { ok: boolean; error?: string }

    if (currentMode.type === "campaign") {
      result = await props.updateCampaignTitle(title)
    } else if (currentMode.type === "world-section") {
      result = await props.createWorldSection(title, body)
    } else if (currentMode.type === "article") {
      result = await props.createWorldArticle(currentMode.sectionId, title, summary, body)
    } else if (currentMode.type === "location") {
      result = await props.createLocation({
        parent_location_id: currentMode.parentId,
        name: title,
        summary,
        description: body,
        image_url: imageUrl || null,
      })
    } else if (currentMode.type === "location-section") {
      result = await props.createLocationSection(currentMode.locationId, title, body)
    } else if (currentMode.type === "location-link") {
      result = await props.createLocationLink(currentMode.section.id, targetId, title)
    } else if (currentMode.type === "achievement") {
      result = await props.createAchievement({
        character_id: characterId || null,
        title,
        description: body,
        icon,
      })
    } else {
      result = await props.createUpdate({ kind, title, body })
    }

    setSaving(false)

    if (!result.ok) {
      setError(result.error || "Не удалось сохранить.")
      return
    }

    props.onClose()
  }

  return (
    <div className="sheet-backdrop" onMouseDown={props.onClose}>
      <form
        className="bottom-sheet world-editor-sheet"
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />

        <div className="world-editor-head">
          <div>
            <h3 className="sheet-title">{editorTitle}</h3>
            <p className="sheet-copy">Приложение ничего не придумывает само — это данные GM.</p>
          </div>
          <button className="world-sheet-close" type="button" onClick={props.onClose}>×</button>
        </div>

        {currentMode.type === "update" && (
          <div className="world-kind-switch">
            <button type="button" className={kind === "change" ? "world-kind-switch__active" : ""} onClick={() => setKind("change")}>Изменение</button>
            <button type="button" className={kind === "announcement" ? "world-kind-switch__active" : ""} onClick={() => setKind("announcement")}>Объявление</button>
          </div>
        )}

        {currentMode.type === "location-link" && (
          <>
            <label className="field-label" htmlFor="world-target">Куда ведёт переход</label>
            <select id="world-target" className="app-select" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">Выбрать локацию</option>
              {targets.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </>
        )}

        {currentMode.type === "achievement" && (
          <>
            <label className="field-label" htmlFor="achievement-character">Кому</label>
            <select id="achievement-character" className="app-select" value={characterId} onChange={(e) => setCharacterId(e.target.value)}>
              <option value="">Вся группа</option>
              {props.characters.map((character) => {
                const member = character.assigned_user_id
                  ? props.members.find((item) => item.user_id === character.assigned_user_id)
                  : null
                const label = member ? `${character.name} (${member.display_name})` : character.name
                return <option key={character.id} value={character.id}>{label}</option>
              })}
            </select>

            <label className="field-label" htmlFor="achievement-icon">Значок</label>
            <input id="achievement-icon" className="app-input world-icon-input" value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} />
          </>
        )}

        <label className="field-label" htmlFor="world-title">
          {currentMode.type === "location-link" ? "Подпись перехода" : "Название"}
        </label>
        <input
          id="world-title"
          className="app-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={currentMode.type === "location-link" ? "Например: Старый тракт" : "Введите название"}
          maxLength={120}
          autoFocus={currentMode.type !== "location-link"}
        />

        {(currentMode.type === "article" || currentMode.type === "location") && (
          <>
            <label className="field-label" htmlFor="world-summary">Короткое описание</label>
            <input id="world-summary" className="app-input" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Для карточки и списка" maxLength={240} />
          </>
        )}

        {currentMode.type === "location" && (
          <>
            <label className="field-label" htmlFor="world-image">Арт</label>
            <input id="world-image" className="app-input" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Пока ссылка; потом Storage" />
          </>
        )}

        {currentMode.type !== "campaign" && currentMode.type !== "location-link" && (
          <>
            <label className="field-label" htmlFor="world-body">
              {currentMode.type === "world-section" ? "Описание раздела" :
               currentMode.type === "achievement" ? "Описание достижения" :
               currentMode.type === "update" ? "Текст" : "Содержание"}
            </label>
            <textarea id="world-body" className="app-textarea world-editor-textarea" value={body} onChange={(e) => setBody(e.target.value)} maxLength={12000} />
          </>
        )}

        {error && <div className="auth-error">{error}</div>}

        <button className="sheet-save" type="submit" disabled={saving}>
          {saving ? "Сохраняем…" : "Сохранить"}
        </button>
      </form>
    </div>
  )
}
