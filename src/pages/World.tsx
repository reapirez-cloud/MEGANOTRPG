import { useMemo, useState } from "react"

import { useCharacters } from "../context/CharacterContext"
import { useWorldContent } from "../hooks/useWorldContent"
import WorldEditor, {
  type WorldEditorMode,
} from "../components/world/WorldEditor"
import type { CampaignUpdate, LocationEntry } from "../types/world"
import CampaignBackground from "../components/common/CampaignBackground"
import ContextActionSheet, {
  type ContextAction,
} from "../components/common/ContextActionSheet"
import { useLongPressItem } from "../hooks/useLongPressItem"
import type {
  AchievementEntry,
  LocationLink,
  LocationSection,
  WorldArticle,
  WorldSection,
} from "../types/world"

type View =
  | { type: "main" }
  | { type: "library" }
  | { type: "section"; sectionId: string }
  | { type: "article"; articleId: string }
  | { type: "achievements" }
  | { type: "updates" }
  | { type: "locations" }
  | { type: "location"; locationId: string }

type WorldMenu =
  | { type: "campaign"; item: { title: string } }
  | { type: "section"; item: WorldSection }
  | { type: "article"; item: WorldArticle }
  | { type: "location"; item: LocationEntry }
  | { type: "location-section"; item: LocationSection }
  | { type: "location-link"; item: LocationLink }
  | { type: "achievement"; item: AchievementEntry }
  | { type: "update"; item: CampaignUpdate }

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
  }).format(new Date(value))
}

function BackRow({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="world-back-row">
      <button className="world-back-button" type="button" onClick={onBack}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="m15 5-7 7 7 7"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <h2>{title}</h2>
    </div>
  )
}

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="manage-edit-button" type="button" onClick={onClick}>
      ✎ Изменить
    </button>
  )
}

function LocationCard({
  location,
  onClick,
  onLongPress,
}: {
  location: LocationEntry
  onClick: () => void
  onLongPress?: () => void
}) {
  const bindLongPress = useLongPressItem<LocationEntry>(() => {
    const action = onLongPress ?? onClick
    action()
  })
  return (
    <button
      {...bindLongPress(location)}
      className="world-location-card surface"
      type="button"
      onClick={onClick}
      style={{ touchAction: "pan-y" }}
    >
      <CampaignBackground
        className="world-location-card__art"
        value={location.image_url}
        overlay="linear-gradient(180deg, transparent, rgba(8,8,10,.82))"
      />
      <div className="world-location-card__copy">
        <strong>{location.name}</strong>
        <p>{location.summary || "Без короткого описания"}</p>
      </div>
    </button>
  )
}

function UpdateRow({
  item,
  canManage,
  onEdit,
  onLongPress,
}: {
  item: CampaignUpdate
  canManage: boolean
  onEdit: () => void
  onLongPress: () => void
}) {
  const bindLongPress = useLongPressItem<CampaignUpdate>(() => onLongPress())
  return (
    <article
      {...bindLongPress(item)}
      className="world-update-row"
      style={{ touchAction: "pan-y" }}
    >
      <div className={`world-update-icon world-update-icon--${item.kind}`}>
        {item.kind === "announcement" ? "!" : "+"}
      </div>
      <div className="world-update-row__body">
        <div className="world-update-row__top">
          <strong>{item.title}</strong>
          <span>{formatDate(item.published_at)}</span>
        </div>
        {item.body && <p>{item.body}</p>}
        <div className="managed-item-footer">
          <small>
            {item.kind === "announcement" ? "Объявление ГМ" : "Изменение ГМ"}
          </small>
          {canManage && (
            <button type="button" onClick={onEdit}>
              Изменить
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

export default function World() {
  const {
    campaignTitle,
    campaignId,
    campaignSummary,
    campaignRulesSummary,
    campaignCoverUrl,
    updateCampaignInfo,
    canManage,
    isOwner,
    characters,
    members,
  } = useCharacters()

  const world = useWorldContent()
  const [view, setView] = useState<View>({ type: "main" })
  const [editor, setEditor] = useState<WorldEditorMode>(null)
  const [worldMenu, setWorldMenu] = useState<WorldMenu | null>(null)
  const [actionError, setActionError] = useState("")
  const bindWorldLongPress = useLongPressItem<WorldMenu>((target) => {
    const canOpen = ["campaign", "section", "article", "location", "location-link"].includes(target.type)
    if (canManage || canOpen) setWorldMenu(target)
  })

  function worldMenuTitle(target: WorldMenu) {
    if (target.type === "campaign") return target.item.title
    if (target.type === "location") return target.item.name
    if (target.type === "location-link") {
      const destination = world.locations.find(
        (location) => location.id === target.item.target_location_id,
      )
      return target.item.label || destination?.name || "Переход"
    }
    return target.item.title
  }

  function openWorldTarget(target: WorldMenu) {
    if (target.type === "campaign") {
      setView({ type: "library" })
    } else if (target.type === "section") {
      setView({ type: "section", sectionId: target.item.id })
    } else if (target.type === "article") {
      setView({ type: "article", articleId: target.item.id })
    } else if (target.type === "location") {
      setView({ type: "location", locationId: target.item.id })
    } else if (target.type === "location-link") {
      setView({ type: "location", locationId: target.item.target_location_id })
    }
  }

  function editWorldTarget(target: WorldMenu) {
    if (target.type === "campaign") {
      setEditor({ type: "campaign" })
    } else if (target.type === "section") {
      setEditor({ type: "world-section-edit", section: target.item })
    } else if (target.type === "article") {
      setEditor({ type: "article-edit", article: target.item })
    } else if (target.type === "location") {
      setEditor({ type: "location-edit", location: target.item })
    } else if (target.type === "location-section") {
      setEditor({ type: "location-section-edit", section: target.item })
    } else if (target.type === "location-link") {
      setEditor({ type: "location-link-edit", link: target.item })
    } else if (target.type === "achievement") {
      setEditor({ type: "achievement-edit", achievement: target.item })
    } else {
      setEditor({ type: "update-edit", update: target.item })
    }
  }

  async function removeWorldTarget(target: WorldMenu) {
    if (target.type === "campaign") return
    const title = worldMenuTitle(target)
    if (!window.confirm(`Удалить «${title}»? Связанные вложенные данные тоже будут удалены.`)) return

    const table =
      target.type === "section" ? "world_sections" :
      target.type === "article" ? "world_articles" :
      target.type === "location" ? "locations" :
      target.type === "location-section" ? "location_sections" :
      target.type === "location-link" ? "location_links" :
      target.type === "achievement" ? "achievements" :
      "campaign_updates"

    setActionError("")
    const result = await world.deleteWorldItem(table, target.item.id)
    if (!result.ok) {
      setActionError(result.error || "Не удалось удалить элемент.")
      return
    }

    if (
      (target.type === "section" && view.type === "section" && view.sectionId === target.item.id)
      || (target.type === "article" && view.type === "article" && view.articleId === target.item.id)
      || (target.type === "location" && view.type === "location" && view.locationId === target.item.id)
    ) {
      setView({ type: "main" })
    }
  }

  function worldActions(target: WorldMenu): ContextAction[] {
    const canOpen = ["campaign", "section", "article", "location", "location-link"].includes(target.type)
    return [
      ...(canOpen
        ? [{
            id: "open",
            label: "Открыть",
            detail: "Перейти к содержанию",
            icon: "↗",
            onSelect: () => openWorldTarget(target),
          }]
        : []),
      ...(canManage
        ? [{
            id: "edit",
            label: "Редактировать",
            detail: "Изменить название и содержание",
            icon: "✎",
            onSelect: () => editWorldTarget(target),
          }]
        : []),
      ...(canManage && target.type !== "campaign"
        ? [{
            id: "delete",
            label: "Удалить",
            detail: "Удаление нельзя будет отменить",
            icon: "×",
            danger: true,
            onSelect: () => removeWorldTarget(target),
          }]
        : []),
    ]
  }

  const sectionArticleCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const article of world.articles) {
      map.set(article.section_id, (map.get(article.section_id) || 0) + 1)
    }
    return map
  }, [world.articles])

  const rootLocations = useMemo(
    () => world.locations.filter((location) => !location.parent_location_id),
    [world.locations],
  )

  const sortedAchievements = useMemo(
    () =>
      [...world.achievements].sort(
        (a, b) =>
          new Date(b.awarded_at).getTime() - new Date(a.awarded_at).getTime(),
      ),
    [world.achievements],
  )

  const sortedUpdates = useMemo(
    () =>
      [...world.updates].sort(
        (a, b) =>
          new Date(b.published_at).getTime() - new Date(a.published_at).getTime(),
      ),
    [world.updates],
  )

  const editorNode = (
    <WorldEditor
      key={editor ? JSON.stringify(editor) : "none"}
      mode={editor}
      onClose={() => setEditor(null)}
      campaignTitle={campaignTitle}
      campaignSummary={campaignSummary}
      campaignRulesSummary={campaignRulesSummary}
      campaignCoverUrl={campaignCoverUrl}
      campaignId={campaignId}
      locations={world.locations}
      locationSections={world.locationSections}
      characters={characters}
      members={members}
      updateCampaignInfo={updateCampaignInfo}
      createWorldSection={world.createWorldSection}
      updateWorldSection={world.updateWorldSection}
      createWorldArticle={world.createWorldArticle}
      updateWorldArticle={world.updateWorldArticle}
      createLocation={world.createLocation}
      updateLocation={world.updateLocation}
      createLocationSection={world.createLocationSection}
      updateLocationSection={world.updateLocationSection}
      createLocationLink={world.createLocationLink}
      updateLocationLink={world.updateLocationLink}
      createAchievement={world.createAchievement}
      updateAchievement={world.updateAchievement}
      createUpdate={world.createUpdate}
      updateUpdate={world.updateUpdate}
    />
  )

  const worldActionNode = worldMenu ? (
    <ContextActionSheet
      title={worldMenuTitle(worldMenu)}
      subtitle="Долгое нажатие открывает редактор и удаление"
      actions={worldActions(worldMenu)}
      onClose={() => setWorldMenu(null)}
    />
  ) : null

  const actionErrorNode = actionError ? (
    <div className="auth-error">{actionError}</div>
  ) : null

  if (world.loading) {
    return (
      <div className="center-state">
        <span className="status-spinner" />
        <div>Загружаем мир…</div>
      </div>
    )
  }

  if (world.error) {
    return (
      <div className="center-state">
        <strong>Не удалось загрузить мир</strong>
        <span>{world.error}</span>
        <button
          className="primary-mini-button"
          type="button"
          onClick={() => void world.reload()}
        >
          Повторить
        </button>
      </div>
    )
  }

  if (view.type === "library") {
    return (
      <>
        <div className="page-stack world-page">
          <BackRow title="Содержание мира" onBack={() => setView({ type: "main" })} />

          <div className="world-library-intro surface">
            <span>Библиотека кампании</span>
            <strong>{campaignTitle}</strong>
            <p>{campaignRulesSummary || "Добавь вводную, правила и важные договорённости кампании."}</p>
          </div>

          <div className="section-head">
            <h3 className="section-title">Разделы мира</h3>
            {canManage && (
              <button className="section-link" type="button" onClick={() => setEditor({ type: "world-section" })}>
                + Раздел
              </button>
            )}
          </div>

          <div className="world-section-list">
            {world.sections.length === 0 && (
              <div className="world-empty surface">Пока пусто.</div>
            )}

            {world.sections.map((section) => (
              <button
                {...bindWorldLongPress({ type: "section", item: section })}
                className="world-section-card surface"
                type="button"
                key={section.id}
                onClick={() => setView({ type: "section", sectionId: section.id })}
                style={{ touchAction: "pan-y" }}
              >
                <div className="world-section-card__mark" />
                <div className="world-section-card__body">
                  <strong>{section.title}</strong>
                  <p>{section.description || "Без описания"}</p>
                  <span>{sectionArticleCounts.get(section.id) || 0} записей</span>
                </div>
                <span className="world-chevron">›</span>
              </button>
            ))}
          </div>
        </div>
        {actionErrorNode}
        {editorNode}
        {worldActionNode}
      </>
    )
  }

  if (view.type === "section") {
    const section = world.sections.find((item) => item.id === view.sectionId)
    if (!section) return <div className="center-state">Раздел не найден.</div>

    const sectionArticles = world.articles.filter(
      (article) => article.section_id === section.id,
    )

    return (
      <>
        <div className="page-stack world-page">
          <BackRow title={section.title} onBack={() => setView({ type: "library" })} />

          <div className="managed-heading-row">
            <div className="world-section-description surface">
              <p>{section.description || "Без описания раздела."}</p>
            </div>
            {canManage && (
              <EditButton onClick={() => setEditor({ type: "world-section-edit", section })} />
            )}
          </div>

          <div className="section-head">
            <h3 className="section-title">Записи</h3>
            {canManage && (
              <button
                className="section-link"
                type="button"
                onClick={() => setEditor({ type: "article", sectionId: section.id })}
              >
                + Запись
              </button>
            )}
          </div>

          <div className="world-article-list surface">
            {sectionArticles.length === 0 && (
              <div className="world-empty">В этом разделе пока нет записей.</div>
            )}
            {sectionArticles.map((article) => (
              <button
                {...bindWorldLongPress({ type: "article", item: article })}
                className="world-article-row"
                type="button"
                key={article.id}
                onClick={() => setView({ type: "article", articleId: article.id })}
                style={{ touchAction: "pan-y" }}
              >
                <div>
                  <strong>{article.title}</strong>
                  <p>{article.summary || "Открыть запись"}</p>
                </div>
                <span>›</span>
              </button>
            ))}
          </div>
        </div>
        {actionErrorNode}
        {editorNode}
        {worldActionNode}
      </>
    )
  }

  if (view.type === "article") {
    const article = world.articles.find((item) => item.id === view.articleId)
    if (!article) return <div className="center-state">Запись не найдена.</div>
    const parent = world.sections.find((item) => item.id === article.section_id)

    return (
      <>
        <div className="page-stack world-page">
          <BackRow
            title={parent?.title || "Мир"}
            onBack={() => setView({ type: "section", sectionId: article.section_id })}
          />
          {canManage && (
            <div className="manage-toolbar">
              <EditButton onClick={() => setEditor({ type: "article-edit", article })} />
            </div>
          )}
          <article
            {...bindWorldLongPress({ type: "article", item: article })}
            className="world-reading surface"
            style={{ touchAction: "pan-y" }}
          >
            <span>Запись мира</span>
            <h2>{article.title}</h2>
            {article.summary && <p className="world-reading__lead">{article.summary}</p>}
            <div className="world-reading__body">{article.body}</div>
          </article>
        </div>
        {actionErrorNode}
        {editorNode}
        {worldActionNode}
      </>
    )
  }


  if (view.type === "achievements") {
    return (
      <>
        <div className="page-stack world-page">
          <BackRow title="Достижения" onBack={() => setView({ type: "main" })} />

          <div className="section-head">
            <div>
              <h3 className="section-title">Все достижения</h3>
              <p className="item-meta">Награды и памятные моменты кампании</p>
            </div>
            {canManage && (
              <button
                className="section-link"
                type="button"
                onClick={() => setEditor({ type: "achievement" })}
              >
                + Достижение
              </button>
            )}
          </div>

          <div className="world-achievement-list surface">
            {sortedAchievements.length === 0 && (
              <div className="world-empty">Достижений пока нет.</div>
            )}
            {sortedAchievements.map((achievement) => {
              const character = achievement.character_id
                ? characters.find((item) => item.id === achievement.character_id)
                : null
              const member = character?.assigned_user_id
                ? members.find((item) => item.user_id === character.assigned_user_id)
                : null

              return (
                <article
                  {...bindWorldLongPress({ type: "achievement", item: achievement })}
                  className="world-achievement-row"
                  key={achievement.id}
                  style={{ touchAction: "pan-y" }}
                >
                  <div className="world-achievement-row__icon">{achievement.icon}</div>
                  <div className="world-achievement-row__body">
                    <div className="world-achievement-row__top">
                      <strong>{achievement.title}</strong>
                      <span>{formatDate(achievement.awarded_at)}</span>
                    </div>
                    {achievement.description && <p>{achievement.description}</p>}
                    <div className="managed-item-footer">
                      <small>
                        {character
                          ? member
                            ? `${character.name} (${member.display_name})`
                            : character.name
                          : "Вся группа"}
                      </small>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() =>
                            setEditor({ type: "achievement-edit", achievement })
                          }
                        >
                          Изменить
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
        {actionErrorNode}
        {editorNode}
        {worldActionNode}
      </>
    )
  }

  if (view.type === "updates") {
    return (
      <>
        <div className="page-stack world-page">
          <BackRow title="События" onBack={() => setView({ type: "main" })} />

          <div className="section-head">
            <div>
              <h3 className="section-title">Все события</h3>
              <p className="item-meta">Объявления и изменения кампании</p>
            </div>
            {canManage && (
              <button
                className="section-link"
                type="button"
                onClick={() => setEditor({ type: "update" })}
              >
                + Событие
              </button>
            )}
          </div>

          <div className="world-update-list surface">
            {sortedUpdates.length === 0 && (
              <div className="world-empty">Событий пока нет.</div>
            )}
            {sortedUpdates.map((item) => (
              <UpdateRow
                item={item}
                key={item.id}
                canManage={canManage}
                onEdit={() => setEditor({ type: "update-edit", update: item })}
                onLongPress={() => canManage && setWorldMenu({ type: "update", item })}
              />
            ))}
          </div>
        </div>
        {actionErrorNode}
        {editorNode}
        {worldActionNode}
      </>
    )
  }

  if (view.type === "locations") {
    return (
      <>
        <div className="page-stack world-page">
          <BackRow title="Локации" onBack={() => setView({ type: "main" })} />

          <div className="section-head">
            <div>
              <h3 className="section-title">Корневые локации</h3>
              <p className="item-meta">Подлокации открываются внутри родительской</p>
            </div>
            {canManage && (
              <button className="section-link" type="button" onClick={() => setEditor({ type: "location", parentId: null })}>
                + Локация
              </button>
            )}
          </div>

          <div className="world-location-list">
            {rootLocations.length === 0 && <div className="world-empty surface">Локаций пока нет.</div>}
            {rootLocations.map((location) => (
              <LocationCard
                key={location.id}
                location={location}
                onClick={() => setView({ type: "location", locationId: location.id })}
                onLongPress={() => setWorldMenu({ type: "location", item: location })}
              />
            ))}
          </div>
        </div>
        {actionErrorNode}
        {editorNode}
        {worldActionNode}
      </>
    )
  }

  if (view.type === "location") {
    const location = world.locations.find((item) => item.id === view.locationId)
    if (!location) return <div className="center-state">Локация не найдена.</div>

    const children = world.locations.filter(
      (item) => item.parent_location_id === location.id,
    )
    const details = world.locationSections.filter(
      (section) => section.location_id === location.id,
    )

    return (
      <>
        <div className="page-stack world-page">
          <BackRow
            title={location.name}
            onBack={() =>
              location.parent_location_id
                ? setView({ type: "location", locationId: location.parent_location_id })
                : setView({ type: "locations" })
            }
          />

          {canManage && (
            <div className="manage-toolbar">
              <EditButton onClick={() => setEditor({ type: "location-edit", location })} />
            </div>
          )}

          <article
            {...bindWorldLongPress({ type: "location", item: location })}
            className="world-location-detail surface"
            style={{ touchAction: "pan-y" }}
          >
            <CampaignBackground
              className="world-location-detail__art"
              value={location.image_url}
              overlay="linear-gradient(180deg, transparent, rgba(8,8,10,.88))"
            />
            <div className="world-location-detail__body">
              <span>Локация</span>
              <h2>{location.name}</h2>
              {location.summary && <p className="world-location-detail__lead">{location.summary}</p>}
              {location.description && <p>{location.description}</p>}
            </div>
          </article>

          <section className="section">
            <div className="section-head">
              <div>
                <h3 className="section-title">Подлокации</h3>
                <p className="item-meta">Места внутри этой локации</p>
              </div>
              {canManage && (
                <button
                  className="section-link"
                  type="button"
                  onClick={() => setEditor({ type: "location", parentId: location.id })}
                >
                  + Подлокация
                </button>
              )}
            </div>

            <div className="compact-grid">
              {children.map((child) => (
                <LocationCard
                  key={child.id}
                  location={child}
                  onClick={() => setView({ type: "location", locationId: child.id })}
                onLongPress={() => setWorldMenu({ type: "location", item: child })}
                />
              ))}
            </div>
            {children.length === 0 && <div className="world-empty surface">Подлокаций пока нет.</div>}
          </section>

          <section className="section">
            <div className="section-head">
              <div>
                <h3 className="section-title">Разделы локации</h3>
                <p className="item-meta">Отдельные смысловые блоки</p>
              </div>
              {canManage && (
                <button
                  className="section-link"
                  type="button"
                  onClick={() => setEditor({ type: "location-section", locationId: location.id })}
                >
                  + Раздел
                </button>
              )}
            </div>

            <div className="location-section-stack">
              {details.map((section) => {
                const links = world.locationLinks.filter(
                  (link) => link.section_id === section.id,
                )

                return (
                  <article
                    {...bindWorldLongPress({ type: "location-section", item: section })}
                    className="location-info-section surface"
                    key={section.id}
                    style={{ touchAction: "pan-y" }}
                  >
                    <div className="location-info-section__head">
                      <h4>{section.title}</h4>
                      {canManage && (
                        <div className="mini-action-row">
                          <button type="button" onClick={() => setEditor({ type: "location-section-edit", section })}>
                            Изменить
                          </button>
                          <button type="button" onClick={() => setEditor({ type: "location-link", section })}>
                            + Переход
                          </button>
                        </div>
                      )}
                    </div>

                    {section.body && <p>{section.body}</p>}

                    {links.length > 0 && (
                      <div className="location-link-list">
                        {links.map((link) => {
                          const target = world.locations.find(
                            (item) => item.id === link.target_location_id,
                          )
                          if (!target) return null

                          return (
                            <div
                              {...bindWorldLongPress({ type: "location-link", item: link })}
                              className="managed-link-row"
                              key={link.id}
                              style={{ touchAction: "pan-y" }}
                            >
                              <button
                                type="button"
                                className="location-link-row"
                                onClick={() => setView({ type: "location", locationId: target.id })}
                              >
                                <span>
                                  <small>Перейти</small>
                                  <strong>{link.label || target.name}</strong>
                                </span>
                                <span>›</span>
                              </button>
                              {canManage && (
                                <button
                                  className="managed-link-edit"
                                  type="button"
                                  onClick={() => setEditor({ type: "location-link-edit", link })}
                                >
                                  ✎
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </article>
                )
              })}

              {details.length === 0 && (
                <div className="world-empty surface">Разделов пока нет.</div>
              )}
            </div>
          </section>
        </div>
        {actionErrorNode}
        {editorNode}
        {worldActionNode}
      </>
    )
  }

  return (
    <>
      <div className="page-stack world-page">
        {isOwner && (
          <div className="owner-status surface">
            <span>Владелец</span>
            <strong>Роли и общие игровые данные доступны; чужое «Только я» скрыто</strong>
          </div>
        )}

        <div className="world-hero-wrap">
          <button
            {...bindWorldLongPress({ type: "campaign", item: { title: campaignTitle } })}
            className="hero-card surface world-hero-button"
            type="button"
            onClick={() => setView({ type: "library" })}
            style={{ touchAction: "pan-y" }}
          >
            <CampaignBackground
              className="world-hero-cover"
              value={campaignCoverUrl}
              overlay="linear-gradient(90deg, rgba(13,10,16,.9), rgba(13,10,16,.46))"
            />
            <div className="world-hero-button__copy">
              <div className="hero-card__eyebrow">Мир кампании</div>
              <h2 className="hero-card__title">{campaignTitle}</h2>
              <p className="hero-card__copy">
                {campaignSummary || "Добавь короткое описание мира — его увидят все участники."}
              </p>
              <span className="world-hero-button__open">Открыть содержание →</span>
            </div>
          </button>

          {canManage && (
            <button
              className="world-hero-edit"
              type="button"
              onClick={() => setEditor({ type: "campaign" })}
              aria-label="Изменить оформление кампании"
            >
              ✎
            </button>
          )}
        </div>

        <section className="section">
          <div className="section-head">
            <div>
              <h3 className="section-title">Локации</h3>
              <p className="item-meta">Две последние корневые локации</p>
            </div>
            <div className="section-actions">
              {canManage && (
                <button className="section-link" type="button" onClick={() => setEditor({ type: "location", parentId: null })}>
                  + Добавить
                </button>
              )}
              <button className="section-link" type="button" onClick={() => setView({ type: "locations" })}>
                Все
              </button>
            </div>
          </div>

          <div className="compact-grid world-latest-locations">
            {rootLocations.slice(0, 2).map((location) => (
              <LocationCard
                key={location.id}
                location={location}
                onClick={() => setView({ type: "location", locationId: location.id })}
                onLongPress={() => setWorldMenu({ type: "location", item: location })}
              />
            ))}
          </div>
          {rootLocations.length === 0 && <div className="world-empty surface">Пока нет ни одной локации.</div>}
        </section>

        <section className="section">
          <div className="section-head">
            <div>
              <h3 className="section-title">Достижения</h3>
              <p className="item-meta">3 последних достижения</p>
            </div>
            <div className="section-actions">
              {canManage && (
                <button
                  className="section-link"
                  type="button"
                  onClick={() => setEditor({ type: "achievement" })}
                >
                  + Добавить
                </button>
              )}
              <button className="world-all-link" type="button" onClick={() => setView({ type: "achievements" })}>
                Все достижения →
              </button>
            </div>
          </div>

          <div className="world-achievement-list surface">
            {sortedAchievements.length === 0 && (
              <div className="world-empty">Достижений пока нет.</div>
            )}
            {sortedAchievements.slice(0, 3).map((achievement) => {
              const character = achievement.character_id
                ? characters.find((item) => item.id === achievement.character_id)
                : null
              const member = character?.assigned_user_id
                ? members.find((item) => item.user_id === character.assigned_user_id)
                : null

              return (
                <article
                  {...bindWorldLongPress({ type: "achievement", item: achievement })}
                  className="world-achievement-row"
                  key={achievement.id}
                  style={{ touchAction: "pan-y" }}
                >
                  <div className="world-achievement-row__icon">{achievement.icon}</div>
                  <div className="world-achievement-row__body">
                    <div className="world-achievement-row__top">
                      <strong>{achievement.title}</strong>
                      <span>{formatDate(achievement.awarded_at)}</span>
                    </div>
                    {achievement.description && <p>{achievement.description}</p>}
                    <div className="managed-item-footer">
                      <small>
                        {character
                          ? member
                            ? `${character.name} (${member.display_name})`
                            : character.name
                          : "Вся группа"}
                      </small>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() =>
                            setEditor({ type: "achievement-edit", achievement })
                          }
                        >
                          Изменить
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <div>
              <h3 className="section-title">События</h3>
              <p className="item-meta">3 последних события кампании</p>
            </div>
            <div className="section-actions">
              {canManage && (
                <button
                  className="section-link"
                  type="button"
                  onClick={() => setEditor({ type: "update" })}
                >
                  + Добавить
                </button>
              )}
              <button className="world-all-link" type="button" onClick={() => setView({ type: "updates" })}>
                Все события →
              </button>
            </div>
          </div>

          <div className="world-update-list surface">
            {sortedUpdates.length === 0 && (
              <div className="world-empty">Событий пока нет.</div>
            )}
            {sortedUpdates.slice(0, 3).map((item) => (
              <UpdateRow
                item={item}
                key={item.id}
                canManage={canManage}
                onEdit={() => setEditor({ type: "update-edit", update: item })}
                onLongPress={() => canManage && setWorldMenu({ type: "update", item })}
              />
            ))}
          </div>
        </section>
      </div>
      {actionErrorNode}
      {editorNode}
      {worldActionNode}
    </>
  )
}
