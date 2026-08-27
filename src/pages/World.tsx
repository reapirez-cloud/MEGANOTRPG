import { useEffect, useMemo, useState } from "react"
import { useCharacters } from "../context/CharacterContext"
import { useLongPressItem } from "../hooks/useLongPressItem"
import { useWorldContent } from "../hooks/useWorldContent"
import { useWorldState } from "../hooks/useWorldState"
import WorldEditor from "../components/world/WorldEditor"
import type { WorldEditorMode } from "../components/world/WorldEditor"
import CampaignImage from "../components/common/CampaignImage"
import CharacterAvatar from "../components/characters/CharacterAvatar"
import { formatCampaignTime } from "../world-state/time"
import type { LocationEntry, VisibilityMode } from "../types/world"

const visibilityLabel: Record<VisibilityMode, string> = { always: "Видно всегда", discover: "По открытию", private: "Только я" }

export default function World() {
  const context = useCharacters()
  const world = useWorldContent()
  const state = useWorldState()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editor, setEditor] = useState<WorldEditorMode>(null)
  const [menuLocation, setMenuLocation] = useState<LocationEntry | null>(null)
  const [visibilityOpen, setVisibilityOpen] = useState(false)
  const [error, setError] = useState("")
  const bindLocationLongPress = useLongPressItem<LocationEntry>((location) => { if (context.canManage) setMenuLocation(location) })

  useEffect(() => {
    if (selectedId && world.locations.some((location) => location.id === selectedId)) return
    setSelectedId(state.currentLocation?.id || world.locations.find((location) => location.lifecycle_state === "active")?.id || null)
  }, [selectedId, state.currentLocation?.id, world.locations])

  const selected = useMemo(() => world.locations.find((location) => location.id === selectedId) || null, [selectedId, world.locations])
  const parent = selected?.parent_location_id ? world.locations.find((location) => location.id === selected.parent_location_id) || null : null
  const children = useMemo(() => selected ? world.locations.filter((location) => location.parent_location_id === selected.id && location.lifecycle_state === "active") : world.locations.filter((location) => !location.parent_location_id && location.lifecycle_state === "active"), [selected, world.locations])
  const selectedSections = useMemo(() => selected ? world.locationSections.filter((section) => section.location_id === selected.id) : [], [selected, world.locationSections])
  const selectedSectionIds = new Set(selectedSections.map((section) => section.id))
  const transitions = useMemo(() => world.locationLinks.filter((link) => selectedSectionIds.has(link.section_id)).map((link) => ({ link, target: world.locations.find((location) => location.id === link.target_location_id) || null })).filter((entry) => entry.target), [world.locationLinks, world.locations, selectedSections])
  const peopleHere = useMemo(() => selected ? state.states.filter((entry) => entry.location_id === selected.id).map((entry) => ({ state: entry, character: context.characters.find((character) => character.id === entry.character_id) })).filter((entry) => entry.character) : [], [context.characters, selected, state.states])
  const scenesHere = useMemo(() => selected ? state.scenes.filter((scene) => scene.location_id === selected.id && scene.scene_state === "active") : [], [selected, state.scenes])
  const knownLocations = useMemo(() => world.locations.filter((location) => location.lifecycle_state === "active"), [world.locations])

  async function setVisibility(mode: VisibilityMode) {
    if (!menuLocation) return
    const result = await world.setLocationVisibility(menuLocation.id, mode)
    if (!result.ok) { setError(result.error || "Не удалось изменить видимость."); return }
    setVisibilityOpen(false); setMenuLocation(null)
  }

  async function toggleArchive(location: LocationEntry) {
    const result = await world.setLocationArchived(location.id, location.lifecycle_state !== "archived")
    if (!result.ok) setError(result.error || "Не удалось изменить состояние зоны.")
    setMenuLocation(null)
  }

  if (world.loading || state.loading) return <div className="world-v2-loading"><span className="auth-spinner"/><p>Собираем известный мир…</p></div>

  return <div className="world-v2">
    <header className="world-v2-top">
      <div><span>Мир кампании</span><h2>{context.campaignTitle}</h2><p>{context.activeCharacter ? `Мир глазами ${context.activeCharacter.name}` : "Известные локации кампании"}</p></div>
      {context.canManage && <button type="button" className="world-v2-add" onClick={() => setEditor({ type: "location", parentId: selected?.id || null })} aria-label="Добавить локацию">＋</button>}
    </header>

    {state.currentState && <section className="world-position-strip"><span>◉</span><div><small>Текущая позиция</small><strong>{state.currentLocation?.name || "Локация не задана"}</strong><p>{formatCampaignTime(state.currentState)}</p></div>{state.currentLocation && selected?.id !== state.currentLocation.id && <button type="button" onClick={() => setSelectedId(state.currentLocation!.id)}>Показать</button>}</section>}

    {selected ? <>
      <section className={`world-location-hero ${selected.lifecycle_state === "archived" ? "is-archived" : ""}`} {...bindLocationLongPress(selected)} style={{ touchAction: "pan-y" }}>
        {selected.image_url && <CampaignImage className="world-location-hero__image" value={selected.image_url} alt={selected.name} />}
        <div className="world-location-hero__scrim" />
        <div className="world-location-hero__copy">
          <div className="world-location-hero__crumb">{parent ? <button type="button" onClick={() => setSelectedId(parent.id)}>{parent.name}</button> : <span>{context.campaignTitle}</span>}<span>›</span></div>
          <h1>{selected.name}</h1>
          {selected.summary && <p>{selected.summary}</p>}
          {context.canManage && <div className="world-location-hero__badges"><span>{visibilityLabel[selected.visibility_mode]}</span>{selected.lifecycle_state === "archived" && <span>Архив</span>}</div>}
        </div>
        {context.canManage && <button type="button" className="world-location-hero__menu" onClick={() => setMenuLocation(selected)} aria-label="Действия локации">•••</button>}
      </section>

      {(peopleHere.length > 0 || scenesHere.length > 0) && <section className="world-live-section"><div className="world-section-title"><small>Сейчас здесь</small><h3>Живое состояние локации</h3></div>{peopleHere.length > 0 && <div className="world-presence-row">{peopleHere.map(({ character, state: position }) => character && <button type="button" key={character.id} onClick={() => { window.location.hash = `#/character/${character.id}?from=world` }}><CharacterAvatar character={character} size="small"/><span><strong>{character.name}</strong><small>{context.canManage || (state.currentState && position.campaign_day === state.currentState.campaign_day && position.day_period === state.currentState.day_period) ? formatCampaignTime(position) : "В этой локации"}</small></span></button>)}</div>}{scenesHere.length > 0 && <div className="world-scenes-row">{scenesHere.map((scene) => <button type="button" key={scene.room_id} onClick={() => { window.location.hash = `#/chat/${scene.room_id}` }}><span>✦</span><div><small>Активная сцена</small><strong>{scene.title}</strong><p>{formatCampaignTime(scene)}</p></div><b>›</b></button>)}</div>}</section>}

      {(transitions.length > 0 || children.length > 0) && <section className="world-route-section"><div className="world-section-title"><small>Навигация</small><h3>Куда можно перейти</h3></div><div className="world-route-grid">{transitions.map(({ link, target }) => target && <button type="button" key={link.id} onClick={() => setSelectedId(target.id)}><CampaignImage className="world-route-card__image" value={target.image_url} alt=""/><span className="world-route-card__scrim"/><span className="world-route-card__copy"><small>{link.label || "Переход"}</small><strong>{target.name}</strong></span></button>)}{children.filter((child) => !transitions.some((entry) => entry.target?.id === child.id)).map((child) => <button type="button" key={child.id} onClick={() => setSelectedId(child.id)}><CampaignImage className="world-route-card__image" value={child.image_url} alt=""/><span className="world-route-card__scrim"/><span className="world-route-card__copy"><small>Внутри локации</small><strong>{child.name}</strong></span></button>)}</div></section>}

      {(selected.description || selectedSections.length > 0) && <section className="world-lore-section"><div className="world-section-title"><small>Известно</small><h3>О локации</h3></div>{selected.description && <p className="world-location-description">{selected.description}</p>}{selectedSections.map((section) => <article key={section.id} className="world-lore-card"><h4>{section.title}</h4><p>{section.body}</p></article>)}</section>}
    </> : <div className="world-v2-empty"><span>◇</span><strong>Мир ещё не открыт</strong><p>{context.canManage ? "Создайте первую локацию. Новые зоны по умолчанию будут видны персонажу только после открытия." : "Когда персонаж попадёт в первую доступную локацию, она появится здесь."}</p>{context.canManage && <button type="button" onClick={() => setEditor({ type: "location", parentId: null })}>Создать локацию</button>}</div>}

    {knownLocations.length > 1 && <section className="world-known-section"><div className="world-section-title"><small>{context.canManage ? "Все доступные вам" : "Открытые персонажем"}</small><h3>Известные места</h3></div><div className="world-known-list">{knownLocations.map((location) => <button type="button" key={location.id} className={location.id === selected?.id ? "is-active" : ""} onClick={() => setSelectedId(location.id)} {...bindLocationLongPress(location)} style={{ touchAction: "pan-y" }}><span>◈</span><div><strong>{location.name}</strong><small>{location.summary || (location.parent_location_id ? "Подлокация" : "Локация")}</small></div>{context.canManage && <em>{visibilityLabel[location.visibility_mode]}</em>}<b>›</b></button>)}</div></section>}

    {error && <div className="world-inline-error">{error}<button type="button" onClick={() => setError("")}>×</button></div>}

    {menuLocation && !visibilityOpen && <div className="soft-sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMenuLocation(null) }}><section className="soft-sheet world-action-sheet"><div className="soft-sheet__handle"/><header className="soft-sheet__header"><div><small>Локация</small><h2>{menuLocation.name}</h2></div><button className="soft-sheet__close" type="button" onClick={() => setMenuLocation(null)}>×</button></header><div className="action-sheet-list"><button type="button" onClick={() => { setEditor({ type: "location-edit", location: menuLocation }); setMenuLocation(null) }}><span>✎</span><div><strong>Редактировать</strong><small>Название, описание и арт</small></div></button><button type="button" onClick={() => { setEditor({ type: "location", parentId: menuLocation.id }); setMenuLocation(null) }}><span>＋</span><div><strong>Добавить подлокацию</strong><small>Она будет скрыта до открытия</small></div></button><button type="button" onClick={() => { setEditor({ type: "location-section", locationId: menuLocation.id }); setMenuLocation(null) }}><span>≡</span><div><strong>Добавить информацию</strong><small>Лор и известные детали</small></div></button>{selectedSections[0] && <button type="button" onClick={() => { setEditor({ type: "location-link", section: selectedSections[0]! }); setMenuLocation(null) }}><span>⇢</span><div><strong>Добавить переход</strong><small>В том числе секретный ход</small></div></button>}<button type="button" onClick={() => setVisibilityOpen(true)}><span>◉</span><div><strong>Видимость</strong><small>{visibilityLabel[menuLocation.visibility_mode]}</small></div></button><button type="button" onClick={() => void world.publishLocationEvent(menuLocation.id, "updated")}><span>✦</span><div><strong>Опубликовать в Хронике</strong><small>Только значимое изменение</small></div></button><button type="button" className="is-danger" onClick={() => void toggleArchive(menuLocation)}><span>⌁</span><div><strong>{menuLocation.lifecycle_state === "archived" ? "Вернуть из архива" : "Архивировать"}</strong><small>История и старые сцены сохранятся</small></div></button></div></section></div>}

    {menuLocation && visibilityOpen && <div className="soft-sheet-backdrop"><section className="soft-sheet visibility-sheet"><div className="soft-sheet__handle"/><header className="soft-sheet__header"><div><small>Кто видит локацию</small><h2>{menuLocation.name}</h2></div><button className="soft-sheet__close" type="button" onClick={() => { setVisibilityOpen(false); setMenuLocation(null) }}>×</button></header><div className="visibility-options">{([ ["discover","После открытия","Появится у конкретного персонажа, когда ГМ перенесёт его сюда."], ["always","Видно всегда","Доступна всем игрокам кампании сразу."], ["private","Только я","Не раскрывается игрокам автоматически."] ] as Array<[VisibilityMode,string,string]>).map(([mode,label,description]) => <button key={mode} type="button" className={menuLocation.visibility_mode === mode ? "is-active" : ""} onClick={() => void setVisibility(mode)}><span>{mode === "discover" ? "◌" : mode === "always" ? "◉" : "◇"}</span><div><strong>{label}</strong><small>{description}</small></div>{menuLocation.visibility_mode === mode && <b>✓</b>}</button>)}</div></section></div>}

    <WorldEditor mode={editor} onClose={() => { setEditor(null); void world.reload() }} campaignTitle={context.campaignTitle} campaignSummary={context.campaignSummary} campaignRulesSummary={context.campaignRulesSummary} campaignCoverUrl={context.campaignCoverUrl} campaignId={context.campaignId} locations={world.locations} locationSections={world.locationSections} characters={context.characters} members={context.members} updateCampaignInfo={context.updateCampaignInfo} createWorldSection={world.createWorldSection} updateWorldSection={world.updateWorldSection} createWorldArticle={world.createWorldArticle} updateWorldArticle={world.updateWorldArticle} createLocation={world.createLocation} updateLocation={world.updateLocation} createLocationSection={world.createLocationSection} updateLocationSection={world.updateLocationSection} createLocationLink={world.createLocationLink} updateLocationLink={world.updateLocationLink} createAchievement={world.createAchievement} updateAchievement={world.updateAchievement} createUpdate={world.createUpdate} updateUpdate={world.updateUpdate} />
  </div>
}
