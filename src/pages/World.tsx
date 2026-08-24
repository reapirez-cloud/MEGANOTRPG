import { useMemo, useState } from "react"

import { useCharacters } from "../context/CharacterContext"
import { useWorldContent } from "../hooks/useWorldContent"
import WorldEditor, {
  type WorldEditorMode,
} from "../components/world/WorldEditor"
import type { CampaignUpdate, LocationEntry } from "../types/world"

type View =
  | { type: "main" }
  | { type: "library" }
  | { type: "section"; sectionId: string }
  | { type: "article"; articleId: string }
  | { type: "achievements" }
  | { type: "updates" }
  | { type: "locations" }
  | { type: "location"; locationId: string }

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
}: {
  location: LocationEntry
  onClick: () => void
}) {
  return (
    <button
      className="world-location-card surface"
      type="button"
      onClick={onClick}
    >
      <div
        className="world-location-card__art"
        style={
          location.image_url
            ? {
                backgroundImage: `linear-gradient(180deg, transparent, rgba(8,8,10,.82)), url(${location.image_url})`,
              }
            : undefined
        }
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
}: {
  item: CampaignUpdate
  canManage: boolean
  onEdit: () => void
}) {
  return (
    <article className="world-update-row">
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
            {item.kind === "announcement" ? "Объявление GM" : "Изменение GM"}
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
    updateCampaignTitle,
    canManage,
    isOwner,
    hasOwner,
    claimOwner,
    characters,
    members,
  } = useCharacters()

  const world = useWorldContent()
  const [view, setView] = useState<View>({ type: "main" })
  const [editor, setEditor] = useState<WorldEditorMode>(null)
  const [claimingOwner, setClaimingOwner] = useState(false)
  const [claimError, setClaimError] = useState("")

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

  async function becomeOwner() {
    setClaimingOwner(true)
    setClaimError("")
    const result = await claimOwner()
    setClaimingOwner(false)
    if (!result.ok) setClaimError(result.error || "Не удалось назначить владельца.")
  }

  const editorNode = (
    <WorldEditor
      key={editor ? JSON.stringify(editor) : "none"}
      mode={editor}
      onClose={() => setEditor(null)}
      campaignTitle={campaignTitle}
      locations={world.locations}
      locationSections={world.locationSections}
      characters={characters}
      members={members}
      updateCampaignTitle={updateCampaignTitle}
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
            <p>Разделы создаются с нуля и потом в любой момент редактируются GM или владельцем.</p>
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
                className="world-section-card surface"
                type="button"
                key={section.id}
                onClick={() => setView({ type: "section", sectionId: section.id })}
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
        {editorNode}
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
                className="world-article-row"
                type="button"
                key={article.id}
                onClick={() => setView({ type: "article", articleId: article.id })}
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
        {editorNode}
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
          <article className="world-reading surface">
            <span>Запись мира</span>
            <h2>{article.title}</h2>
            {article.summary && <p className="world-reading__lead">{article.summary}</p>}
            <div className="world-reading__body">{article.body}</div>
          </article>
        </div>
        {editorNode}
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
                <article className="world-achievement-row" key={achievement.id}>
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
        {editorNode}
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
              />
            ))}
          </div>
        </div>
        {editorNode}
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
              />
            ))}
          </div>
        </div>
        {editorNode}
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

          <article className="world-location-detail surface">
            <div
              className="world-location-detail__art"
              style={
                location.image_url
                  ? {
                      backgroundImage: `linear-gradient(180deg, transparent, rgba(8,8,10,.88)), url(${location.image_url})`,
                    }
                  : undefined
              }
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
                  <article className="location-info-section surface" key={section.id}>
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
                            <div className="managed-link-row" key={link.id}>
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
        {editorNode}
      </>
    )
  }

  return (
    <>
      <div className="page-stack world-page">
        {!hasOwner && (
          <div className="owner-bootstrap surface">
            <div>
              <strong>Назначить владельца приложения</strong>
              <p>
                Это отдельная роль от GM. Владелец получает те же права управления,
                но GM остаётся другим человеком.
              </p>
              {claimError && <small>{claimError}</small>}
            </div>
            <button type="button" onClick={() => void becomeOwner()} disabled={claimingOwner}>
              Я владелец
            </button>
          </div>
        )}

        {isOwner && (
          <div className="owner-status surface">
            <span>Владелец</span>
            <strong>У тебя права управления наравне с GM</strong>
          </div>
        )}

        <div className="world-hero-wrap">
          <button
            className="hero-card surface world-hero-button"
            type="button"
            onClick={() => setView({ type: "library" })}
          >
            <div className="world-hero-button__copy">
              <div className="hero-card__eyebrow">Мир кампании</div>
              <h2 className="hero-card__title">{campaignTitle}</h2>
              <p className="hero-card__copy">Все правила, история и лор создаются с нуля.</p>
              <span className="world-hero-button__open">Открыть содержание →</span>
            </div>
          </button>

          {canManage && (
            <button
              className="world-hero-edit"
              type="button"
              onClick={() => setEditor({ type: "campaign" })}
              aria-label="Изменить название кампании"
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
              <button
                className="section-link"
                type="button"
                onClick={() => setView({ type: "achievements" })}
              >
                Все
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
                <article className="world-achievement-row" key={achievement.id}>
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
              <button
                className="section-link"
                type="button"
                onClick={() => setView({ type: "updates" })}
              >
                Все
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
              />
            ))}
          </div>
        </section>
      </div>
      {editorNode}
    </>
  )
}
