import fs from "node:fs"
import path from "node:path"

const root = process.cwd()

function read(rel) {
  const full = path.join(root, rel)
  if (!fs.existsSync(full)) {
    throw new Error(`Не найден ${rel}. Запусти скрипт из корня MEGANOTRPG.`)
  }
  return fs.readFileSync(full, "utf8")
}

function write(rel, content) {
  fs.writeFileSync(path.join(root, rel), content, "utf8")
  console.log(`✓ ${rel}`)
}

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`Не найден блок «${label}». Ничего вручную не меняй — пришли мне эту ошибку.`)
  }
  return source.replace(search, replacement)
}

// 1) CharacterContext: manager delete character.
{
  let s = read("src/context/CharacterContext.tsx")

  if (!s.includes("deleteCharacter: (characterId: string)")) {
    s = replaceRequired(
      s,
      "  updateCharacter: (characterId: string, input: CharacterInput) => Promise<Result>\n",
      "  updateCharacter: (characterId: string, input: CharacterInput) => Promise<Result>\n  deleteCharacter: (characterId: string) => Promise<Result>\n",
      "тип deleteCharacter",
    )
  }

  if (!s.includes("const deleteCharacter = useCallback")) {
    const anchor = "  const updateOwnCharacterAvatar = useCallback("
    const block = `  const deleteCharacter = useCallback(
    async (characterId: string): Promise<Result> => {
      if (!campaignId) {
        return { ok: false, error: "Кампания ещё не загружена." }
      }

      const { error: deleteError } = await supabase
        .from("characters")
        .delete()
        .eq("id", characterId)
        .eq("campaign_id", campaignId)

      if (deleteError) return { ok: false, error: deleteError.message }
      await load()
      return { ok: true }
    },
    [campaignId, load],
  )

`
    if (!s.includes(anchor)) throw new Error("Не найден updateOwnCharacterAvatar.")
    s = s.replace(anchor, block + anchor)
  }

  if (!s.includes("        deleteCharacter,\n        updateOwnCharacterAvatar,")) {
    s = replaceRequired(
      s,
      "        updateCharacter,\n        updateOwnCharacterAvatar,",
      "        updateCharacter,\n        deleteCharacter,\n        updateOwnCharacterAvatar,",
      "CharacterContext provider",
    )
  }

  write("src/context/CharacterContext.tsx", s)
}

// 2) Characters: delete button only for manager.
{
  let s = read("src/pages/Characters.tsx")

  if (!s.includes("    deleteCharacter,\n    setActiveForMember,")) {
    s = replaceRequired(
      s,
      "    createCharacter,\n    updateCharacter,\n    setActiveForMember,",
      "    createCharacter,\n    updateCharacter,\n    deleteCharacter,\n    setActiveForMember,",
      "Characters deleteCharacter destructure",
    )
  }

  if (!s.includes("const [deleteArmed, setDeleteArmed]")) {
    s = replaceRequired(
      s,
      '  const [formError, setFormError] = useState("")',
      '  const [formError, setFormError] = useState("")\n  const [deleteArmed, setDeleteArmed] = useState(false)',
      "Characters delete state",
    )
  }

  if (!s.includes('setDeleteArmed(false)\n    setEditor({ type: "edit", character })')) {
    s = replaceRequired(
      s,
      '    setFormError("")\n    setEditor({ type: "edit", character })',
      '    setFormError("")\n    setDeleteArmed(false)\n    setEditor({ type: "edit", character })',
      "Characters openEdit reset",
    )
  }

  if (!s.includes("async function removeCharacter()")) {
    const anchor = "  function memberLabel(member: CampaignMember) {"
    const block = `  async function removeCharacter() {
    if (editor?.type !== "edit") return

    if (!deleteArmed) {
      setDeleteArmed(true)
      return
    }

    setSaving(true)
    setFormError("")
    const result = await deleteCharacter(editor.character.id)
    setSaving(false)

    if (!result.ok) {
      setFormError(result.error || "Не удалось удалить персонажа.")
      return
    }

    setEditor(null)
    setDeleteArmed(false)
  }

`
    if (!s.includes(anchor)) throw new Error("Не найден memberLabel.")
    s = s.replace(anchor, block + anchor)
  }

  if (!s.includes("manager-delete-wide")) {
    const oldBlock = `            {formError && <div className="auth-error">{formError}</div>}
            <button className="sheet-save" type="submit" disabled={saving}>
              {saving ? "Сохраняем…" : "Сохранить"}
            </button>`
    const newBlock = `            {formError && <div className="auth-error">{formError}</div>}

            {editor.type === "edit" && (
              <button
                className={deleteArmed ? "manager-delete-wide manager-delete-wide--armed" : "manager-delete-wide"}
                type="button"
                disabled={saving}
                onClick={() => void removeCharacter()}
              >
                {deleteArmed ? "Точно удалить персонажа?" : "Удалить персонажа"}
              </button>
            )}

            <button className="sheet-save" type="submit" disabled={saving}>
              {saving ? "Сохраняем…" : "Сохранить"}
            </button>`
    s = replaceRequired(s, oldBlock, newBlock, "кнопка удаления персонажа")
  }

  write("src/pages/Characters.tsx", s)
}

// 3) General art gallery: manager-only create/delete.
{
  let s = read("src/pages/Art.tsx")

  s = s.replace(
    "    if (!file || !campaignId) return",
    "    if (!file || !campaignId || !canManage) return",
  )

  if (!s.includes("{canManage && (\n              <>\n                <button\n                  className=\"section-link media-add-art\"")) {
    const oldBlock = `            <button
              className="section-link media-add-art"
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Загрузка…" : "+ Добавить"}
            </button>
            <input
              ref={fileRef}
              className="media-hidden-input"
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0] || null
                event.currentTarget.value = ""
                void addArt(file)
              }}
            />`

    const newBlock = `            {canManage && (
              <>
                <button
                  className="section-link media-add-art"
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? "Загрузка…" : "+ Добавить"}
                </button>
                <input
                  ref={fileRef}
                  className="media-hidden-input"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null
                    event.currentTarget.value = ""
                    void addArt(file)
                  }}
                />
              </>
            )}`

    s = replaceRequired(s, oldBlock, newBlock, "ограничение общей галереи")
  }

  s = s.replace(
    '              Артов пока нет. Нажми «+ Добавить» и выбери картинку на телефоне.',
    '              {canManage ? "Артов пока нет. Нажми «+ Добавить» и выбери картинку на телефоне." : "Артов кампании пока нет."}',
  )

  s = s.replace(
    "(selected.uploaded_by === user.id || canManage) && (",
    "canManage && (",
  )

  write("src/pages/Art.tsx", s)
}

// 4) Character profile: player edits existing spells, but only manager creates/deletes.
// Diary deletion is manager-only.
{
  let s = read("src/pages/CharacterProfile.tsx")

  s = s.replace(
    '{canEditSpells && sheet?.spellcasting_enabled && <button className="section-link" type="button" onClick={() => setEditor({ type: "spell", spell: null })}>+ Заклинание</button>}',
    '{canManage && sheet?.spellcasting_enabled && <button className="section-link" type="button" onClick={() => setEditor({ type: "spell", spell: null })}>+ Заклинание</button>}',
  )

  s = s.replace(
    '          onDelete={editor.spell ? () => data.deleteSpell(editor.spell!.id) : undefined}',
    '          onDelete={canManage && editor.spell ? () => data.deleteSpell(editor.spell!.id) : undefined}',
  )

  s = s.replace(
    "        const canDeletePost = canManage || post.created_by === currentUserId",
    "        const canDeletePost = canManage && currentUserId.length > 0",
  )

  s = s.replace(
    '{(canManage || comment.created_by === currentUserId) && <button type="button" onClick={() => void deleteComment(comment.id)}>Удалить</button>}',
    '{canManage && currentUserId.length > 0 && <button type="button" onClick={() => void deleteComment(comment.id)}>Удалить</button>}',
  )

  write("src/pages/CharacterProfile.tsx", s)
}

// 5) World data delete methods.
{
  let s = read("src/hooks/useWorldContent.ts")

  if (!s.includes("const deleteWorldSection = useCallback")) {
    const anchor = "  return {\n    sections,"
    const block = `  const deleteWorldSection = useCallback(
    async (sectionId: string): Promise<Result> => {
      const { error } = await supabase.from("world_sections").delete().eq("id", sectionId)
      if (error) return { ok: false, error: error.message }
      await load()
      return { ok: true }
    },
    [load],
  )

  const deleteWorldArticle = useCallback(
    async (articleId: string): Promise<Result> => {
      const { error } = await supabase.from("world_articles").delete().eq("id", articleId)
      if (error) return { ok: false, error: error.message }
      await load()
      return { ok: true }
    },
    [load],
  )

  const deleteLocation = useCallback(
    async (locationId: string): Promise<Result> => {
      const { error } = await supabase.from("locations").delete().eq("id", locationId)
      if (error) return { ok: false, error: error.message }
      await load()
      return { ok: true }
    },
    [load],
  )

  const deleteLocationSection = useCallback(
    async (sectionId: string): Promise<Result> => {
      const { error } = await supabase.from("location_sections").delete().eq("id", sectionId)
      if (error) return { ok: false, error: error.message }
      await load()
      return { ok: true }
    },
    [load],
  )

  const deleteLocationLink = useCallback(
    async (linkId: string): Promise<Result> => {
      const { error } = await supabase.from("location_links").delete().eq("id", linkId)
      if (error) return { ok: false, error: error.message }
      await load()
      return { ok: true }
    },
    [load],
  )

  const deleteAchievement = useCallback(
    async (achievementId: string): Promise<Result> => {
      const { error } = await supabase.from("achievements").delete().eq("id", achievementId)
      if (error) return { ok: false, error: error.message }
      await load()
      return { ok: true }
    },
    [load],
  )

  const deleteUpdate = useCallback(
    async (updateId: string): Promise<Result> => {
      const { error } = await supabase.from("campaign_updates").delete().eq("id", updateId)
      if (error) return { ok: false, error: error.message }
      await load()
      return { ok: true }
    },
    [load],
  )

`
    if (!s.includes(anchor)) throw new Error("Не найден return useWorldContent.")
    s = s.replace(anchor, block + anchor)
  }

  if (!s.includes("    deleteWorldSection,\n    deleteWorldArticle,")) {
    s = replaceRequired(
      s,
      "    updateUpdate,\n  }",
      "    updateUpdate,\n    deleteWorldSection,\n    deleteWorldArticle,\n    deleteLocation,\n    deleteLocationSection,\n    deleteLocationLink,\n    deleteAchievement,\n    deleteUpdate,\n  }",
      "useWorldContent return",
    )
  }

  write("src/hooks/useWorldContent.ts", s)
}

// 6) World editor: two-tap delete in edit mode.
{
  let s = read("src/components/world/WorldEditor.tsx")

  if (!s.includes("  deleteItem: (mode: Exclude<WorldEditorMode, null>) => AsyncResult")) {
    const oldTail = `  updateUpdate: (
    updateId: string,
    input: {
      kind: "change" | "announcement"
      title: string
      body: string
    },
  ) => AsyncResult
}`

    const newTail = `  updateUpdate: (
    updateId: string,
    input: {
      kind: "change" | "announcement"
      title: string
      body: string
    },
  ) => AsyncResult
  deleteItem: (mode: Exclude<WorldEditorMode, null>) => AsyncResult
  onDeleted: () => void
}`

    s = replaceRequired(s, oldTail, newTail, "WorldEditor delete props")
  }

  if (!s.includes("const [deleteArmed, setDeleteArmed]")) {
    s = replaceRequired(
      s,
      '  const [error, setError] = useState("")',
      '  const [error, setError] = useState("")\n  const [deleteArmed, setDeleteArmed] = useState(false)',
      "WorldEditor delete state",
    )
  }

  if (!s.includes("async function removeCurrentItem()")) {
    const anchor = "  const showSummary ="
    const block = `  async function removeCurrentItem() {
    if (!deleteArmed) {
      setDeleteArmed(true)
      return
    }

    setSaving(true)
    setError("")
    const result = await props.deleteItem(currentMode)
    setSaving(false)

    if (!result.ok) {
      setError(result.error || "Не удалось удалить.")
      return
    }

    props.onClose()
    props.onDeleted()
  }

  const canDelete =
    currentMode.type === "world-section-edit" ||
    currentMode.type === "article-edit" ||
    currentMode.type === "location-edit" ||
    currentMode.type === "location-section-edit" ||
    currentMode.type === "location-link-edit" ||
    currentMode.type === "achievement-edit" ||
    currentMode.type === "update-edit"

`
    if (!s.includes(anchor)) throw new Error("Не найден showSummary.")
    s = s.replace(anchor, block + anchor)
  }

  if (!s.includes("world-delete-zone")) {
    const oldBlock = `        {error && <div className="auth-error">{error}</div>}

        <button className="sheet-save" type="submit" disabled={saving}>
          {saving ? "Сохраняем…" : "Сохранить"}
        </button>`

    const newBlock = `        {error && <div className="auth-error">{error}</div>}

        {canDelete && (
          <button
            className={deleteArmed ? "world-delete-zone world-delete-zone--armed" : "world-delete-zone"}
            type="button"
            disabled={saving}
            onClick={() => void removeCurrentItem()}
          >
            {deleteArmed ? "Точно удалить? Это действие необратимо" : "Удалить"}
          </button>
        )}

        <button className="sheet-save" type="submit" disabled={saving}>
          {saving ? "Сохраняем…" : "Сохранить"}
        </button>`

    s = replaceRequired(s, oldBlock, newBlock, "WorldEditor delete button")
  }

  write("src/components/world/WorldEditor.tsx", s)
}

// 7) World page: dispatch deletes to correct table.
{
  let s = read("src/pages/World.tsx")

  if (!s.includes("      deleteItem={async (mode) => {")) {
    const anchor = `      createUpdate={world.createUpdate}
      updateUpdate={world.updateUpdate}`

    const replacement = `      createUpdate={world.createUpdate}
      updateUpdate={world.updateUpdate}
      deleteItem={async (mode) => {
        if (mode.type === "world-section-edit") {
          return world.deleteWorldSection(mode.section.id)
        }
        if (mode.type === "article-edit") {
          return world.deleteWorldArticle(mode.article.id)
        }
        if (mode.type === "location-edit") {
          return world.deleteLocation(mode.location.id)
        }
        if (mode.type === "location-section-edit") {
          return world.deleteLocationSection(mode.section.id)
        }
        if (mode.type === "location-link-edit") {
          return world.deleteLocationLink(mode.link.id)
        }
        if (mode.type === "achievement-edit") {
          return world.deleteAchievement(mode.achievement.id)
        }
        if (mode.type === "update-edit") {
          return world.deleteUpdate(mode.update.id)
        }
        return { ok: false, error: "Этот объект нельзя удалить." }
      }}
      onDeleted={() => setView({ type: "main" })}`

    s = replaceRequired(s, anchor, replacement, "World delete dispatcher")
  }

  write("src/pages/World.tsx", s)
}

// 8) Chat settings: delete game room only.
{
  let s = read("src/components/chat/ChatRoomSettings.tsx")

  if (!s.includes("  onDeleted: () => void")) {
    s = replaceRequired(
      s,
      "  onClose: () => void\n  onSaved: (title: string) => void",
      "  onClose: () => void\n  onSaved: (title: string) => void\n  onDeleted: () => void",
      "ChatRoomSettings prop",
    )
  }

  if (!s.includes("  onDeleted,\n}: Props)")) {
    s = replaceRequired(
      s,
      "  onClose,\n  onSaved,\n}: Props)",
      "  onClose,\n  onSaved,\n  onDeleted,\n}: Props)",
      "ChatRoomSettings destructure",
    )
  }

  if (!s.includes("const [deleteArmed, setDeleteArmed]")) {
    s = replaceRequired(
      s,
      '  const [error, setError] = useState("")',
      '  const [error, setError] = useState("")\n  const [deleteArmed, setDeleteArmed] = useState(false)',
      "Chat delete state",
    )
  }

  if (!s.includes("async function removeRoom()")) {
    const anchor = "  return ("
    const block = `  async function removeRoom() {
    if (!deleteArmed) {
      setDeleteArmed(true)
      return
    }

    setSaving(true)
    setError("")

    const { error: deleteError } = await supabase
      .from("chat_rooms")
      .delete()
      .eq("id", roomId)
      .eq("category", "game")

    setSaving(false)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    onDeleted()
  }

`
    if (!s.includes(anchor)) throw new Error("Не найден return ChatRoomSettings.")
    s = s.replace(anchor, block + anchor)
  }

  if (!s.includes("chat-room-delete")) {
    const oldBlock = `        {notice && <div className="chat-settings-notice">{notice}</div>}
        {error && <div className="auth-error">{error}</div>}

        <button className="sheet-save" type="button" disabled={saving} onClick={() => void save()}>
          {saving ? "Сохраняем…" : "Сохранить настройки"}
        </button>`

    const newBlock = `        {notice && <div className="chat-settings-notice">{notice}</div>}
        {error && <div className="auth-error">{error}</div>}

        <button
          className={deleteArmed ? "chat-room-delete chat-room-delete--armed" : "chat-room-delete"}
          type="button"
          disabled={saving}
          onClick={() => void removeRoom()}
        >
          {deleteArmed ? "Точно удалить игровой чат и его сообщения?" : "Удалить игровой чат"}
        </button>

        <button className="sheet-save" type="button" disabled={saving} onClick={() => void save()}>
          {saving ? "Сохраняем…" : "Сохранить настройки"}
        </button>`

    s = replaceRequired(s, oldBlock, newBlock, "Chat delete button")
  }

  write("src/components/chat/ChatRoomSettings.tsx", s)
}

// 9) ChatRoom: after room deletion return to chat list.
{
  let s = read("src/pages/ChatRoom.tsx")

  if (!s.includes("          onDeleted={() => {")) {
    s = replaceRequired(
      s,
      '          onClose={() => setSettingsOpen(false)}\n          onSaved={(nextTitle) => setRoomTitle(nextTitle)}',
      '          onClose={() => setSettingsOpen(false)}\n          onSaved={(nextTitle) => setRoomTitle(nextTitle)}\n          onDeleted={() => {\n            setSettingsOpen(false)\n            onBack()\n          }}',
      "ChatRoom onDeleted",
    )
  }

  write("src/pages/ChatRoom.tsx", s)
}

// 10) Styles.
{
  let s = read("src/chat-v11.css")
  if (!s.includes("/* v11.3 manager-only delete controls */")) {
    s += `

/* v11.3 manager-only delete controls */
.manager-delete-wide,
.world-delete-zone,
.chat-room-delete{
  width:100%;
  min-height:40px;
  margin-top:10px;
  border:1px solid #4a2929;
  border-radius:12px;
  background:#1b1213;
  color:#f0a3a3;
  font-size:10px;
  font-weight:800;
}
.manager-delete-wide--armed,
.world-delete-zone--armed,
.chat-room-delete--armed{
  border-color:#7f1d1d;
  background:#2a1113;
  color:#fecaca;
}
.manager-delete-wide:disabled,
.world-delete-zone:disabled,
.chat-room-delete:disabled{
  opacity:.45;
}
`
  }

  write("src/chat-v11.css", s)
}

console.log("")
console.log("Готово: v11.3 применён.")
console.log("Supabase уже обновлён — SQL запускать не нужно.")
console.log("Теперь выполни: npm run build")
