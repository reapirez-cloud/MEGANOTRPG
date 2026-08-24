import fs from "node:fs"

const file = "src/pages/World.tsx"

if (!fs.existsSync(file)) {
  console.error("Не найден src/pages/World.tsx. Запусти команду из корня проекта MEGANOTRPG.")
  process.exit(1)
}

let source = fs.readFileSync(file, "utf8")
const backup = `${file}.v9.bak`

if (source.includes('{ type: "achievements" }') && source.includes('{ type: "updates" }')) {
  console.log("v9 уже применён — ничего менять не нужно.")
  process.exit(0)
}

fs.copyFileSync(file, backup)

function replaceRequired(search, replacement, label) {
  if (!source.includes(search)) {
    console.error(`Не удалось найти блок: ${label}`)
    console.error(`Исходник оставлен без изменений. Резервная копия: ${backup}`)
    process.exit(1)
  }
  source = source.replace(search, replacement)
}

replaceRequired(
`  | { type: "article"; articleId: string }
  | { type: "locations" }
  | { type: "location"; locationId: string }`,
`  | { type: "article"; articleId: string }
  | { type: "achievements" }
  | { type: "updates" }
  | { type: "locations" }
  | { type: "location"; locationId: string }`,
"типы экранов мира",
)

replaceRequired(
`  const rootLocations = useMemo(
    () => world.locations.filter((location) => !location.parent_location_id),
    [world.locations],
  )`,
`  const rootLocations = useMemo(
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
  )`,
"сортировка достижений и событий",
)

const extraViews = `
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
                            ? \`\${character.name} (\${member.display_name})\`
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

`

replaceRequired(
`  if (view.type === "locations") {`,
`${extraViews}  if (view.type === "locations") {`,
"экраны полного списка",
)

const startMarker = `        <section className="section">
          <div className="section-head">
            <div>
              <h3 className="section-title">Достижения игроков</h3>`

const endMarker = `        </section>
      </div>
      {editorNode}`

const start = source.indexOf(startMarker)
const end = source.indexOf(endMarker, start)

if (start === -1 || end === -1) {
  console.error("Не удалось найти главные блоки достижений/событий.")
  console.error(`Исходник оставлен без изменений. Резервная копия: ${backup}`)
  process.exit(1)
}

const mainBlocks = `        <section className="section">
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
                            ? \`\${character.name} (\${member.display_name})\`
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
`

source = source.slice(0, start) + mainBlocks + source.slice(end + `        </section>\n`.length)

fs.writeFileSync(file, source, "utf8")

console.log("Готово.")
console.log("Главная вкладка «Мир»: 3 последних достижения + 3 последних события.")
console.log("Кнопка «Все» открывает отдельный полный список.")
console.log(`Резервная копия: ${backup}`)
