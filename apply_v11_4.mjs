import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = process.cwd()
const here = path.dirname(fileURLToPath(import.meta.url))
const embeddedV113 = "import fs from \"node:fs\"\nimport path from \"node:path\"\n\nconst root = process.cwd()\n\nfunction read(rel) {\n  const full = path.join(root, rel)\n  if (!fs.existsSync(full)) {\n    throw new Error(`Не найден ${rel}. Запусти скрипт из корня MEGANOTRPG.`)\n  }\n  return fs.readFileSync(full, \"utf8\")\n}\n\nfunction write(rel, content) {\n  fs.writeFileSync(path.join(root, rel), content, \"utf8\")\n  console.log(`✓ ${rel}`)\n}\n\nfunction replaceRequired(source, search, replacement, label) {\n  if (!source.includes(search)) {\n    throw new Error(`Не найден блок «${label}». Ничего вручную не меняй — пришли мне эту ошибку.`)\n  }\n  return source.replace(search, replacement)\n}\n\n// 1) CharacterContext: manager delete character.\n{\n  let s = read(\"src/context/CharacterContext.tsx\")\n\n  if (!s.includes(\"deleteCharacter: (characterId: string)\")) {\n    s = replaceRequired(\n      s,\n      \"  updateCharacter: (characterId: string, input: CharacterInput) => Promise<Result>\\n\",\n      \"  updateCharacter: (characterId: string, input: CharacterInput) => Promise<Result>\\n  deleteCharacter: (characterId: string) => Promise<Result>\\n\",\n      \"тип deleteCharacter\",\n    )\n  }\n\n  if (!s.includes(\"const deleteCharacter = useCallback\")) {\n    const anchor = \"  const updateOwnCharacterAvatar = useCallback(\"\n    const block = `  const deleteCharacter = useCallback(\n    async (characterId: string): Promise<Result> => {\n      if (!campaignId) {\n        return { ok: false, error: \"Кампания ещё не загружена.\" }\n      }\n\n      const { error: deleteError } = await supabase\n        .from(\"characters\")\n        .delete()\n        .eq(\"id\", characterId)\n        .eq(\"campaign_id\", campaignId)\n\n      if (deleteError) return { ok: false, error: deleteError.message }\n      await load()\n      return { ok: true }\n    },\n    [campaignId, load],\n  )\n\n`\n    if (!s.includes(anchor)) throw new Error(\"Не найден updateOwnCharacterAvatar.\")\n    s = s.replace(anchor, block + anchor)\n  }\n\n  if (!s.includes(\"        deleteCharacter,\\n        updateOwnCharacterAvatar,\")) {\n    s = replaceRequired(\n      s,\n      \"        updateCharacter,\\n        updateOwnCharacterAvatar,\",\n      \"        updateCharacter,\\n        deleteCharacter,\\n        updateOwnCharacterAvatar,\",\n      \"CharacterContext provider\",\n    )\n  }\n\n  write(\"src/context/CharacterContext.tsx\", s)\n}\n\n// 2) Characters: delete button only for manager.\n{\n  let s = read(\"src/pages/Characters.tsx\")\n\n  if (!s.includes(\"    deleteCharacter,\\n    setActiveForMember,\")) {\n    s = replaceRequired(\n      s,\n      \"    createCharacter,\\n    updateCharacter,\\n    setActiveForMember,\",\n      \"    createCharacter,\\n    updateCharacter,\\n    deleteCharacter,\\n    setActiveForMember,\",\n      \"Characters deleteCharacter destructure\",\n    )\n  }\n\n  if (!s.includes(\"const [deleteArmed, setDeleteArmed]\")) {\n    s = replaceRequired(\n      s,\n      '  const [formError, setFormError] = useState(\"\")',\n      '  const [formError, setFormError] = useState(\"\")\\n  const [deleteArmed, setDeleteArmed] = useState(false)',\n      \"Characters delete state\",\n    )\n  }\n\n  if (!s.includes('setDeleteArmed(false)\\n    setEditor({ type: \"edit\", character })')) {\n    s = replaceRequired(\n      s,\n      '    setFormError(\"\")\\n    setEditor({ type: \"edit\", character })',\n      '    setFormError(\"\")\\n    setDeleteArmed(false)\\n    setEditor({ type: \"edit\", character })',\n      \"Characters openEdit reset\",\n    )\n  }\n\n  if (!s.includes(\"async function removeCharacter()\")) {\n    const anchor = \"  function memberLabel(member: CampaignMember) {\"\n    const block = `  async function removeCharacter() {\n    if (editor?.type !== \"edit\") return\n\n    if (!deleteArmed) {\n      setDeleteArmed(true)\n      return\n    }\n\n    setSaving(true)\n    setFormError(\"\")\n    const result = await deleteCharacter(editor.character.id)\n    setSaving(false)\n\n    if (!result.ok) {\n      setFormError(result.error || \"Не удалось удалить персонажа.\")\n      return\n    }\n\n    setEditor(null)\n    setDeleteArmed(false)\n  }\n\n`\n    if (!s.includes(anchor)) throw new Error(\"Не найден memberLabel.\")\n    s = s.replace(anchor, block + anchor)\n  }\n\n  if (!s.includes(\"manager-delete-wide\")) {\n    const oldBlock = `            {formError && <div className=\"auth-error\">{formError}</div>}\n            <button className=\"sheet-save\" type=\"submit\" disabled={saving}>\n              {saving ? \"Сохраняем…\" : \"Сохранить\"}\n            </button>`\n    const newBlock = `            {formError && <div className=\"auth-error\">{formError}</div>}\n\n            {editor.type === \"edit\" && (\n              <button\n                className={deleteArmed ? \"manager-delete-wide manager-delete-wide--armed\" : \"manager-delete-wide\"}\n                type=\"button\"\n                disabled={saving}\n                onClick={() => void removeCharacter()}\n              >\n                {deleteArmed ? \"Точно удалить персонажа?\" : \"Удалить персонажа\"}\n              </button>\n            )}\n\n            <button className=\"sheet-save\" type=\"submit\" disabled={saving}>\n              {saving ? \"Сохраняем…\" : \"Сохранить\"}\n            </button>`\n    s = replaceRequired(s, oldBlock, newBlock, \"кнопка удаления персонажа\")\n  }\n\n  write(\"src/pages/Characters.tsx\", s)\n}\n\n// 3) General art gallery: manager-only create/delete.\n{\n  let s = read(\"src/pages/Art.tsx\")\n\n  s = s.replace(\n    \"    if (!file || !campaignId) return\",\n    \"    if (!file || !campaignId || !canManage) return\",\n  )\n\n  if (!s.includes(\"{canManage && (\\n              <>\\n                <button\\n                  className=\\\"section-link media-add-art\\\"\")) {\n    const oldBlock = `            <button\n              className=\"section-link media-add-art\"\n              type=\"button\"\n              onClick={() => fileRef.current?.click()}\n              disabled={uploading}\n            >\n              {uploading ? \"Загрузка…\" : \"+ Добавить\"}\n            </button>\n            <input\n              ref={fileRef}\n              className=\"media-hidden-input\"\n              type=\"file\"\n              accept=\"image/*\"\n              onChange={(event) => {\n                const file = event.target.files?.[0] || null\n                event.currentTarget.value = \"\"\n                void addArt(file)\n              }}\n            />`\n\n    const newBlock = `            {canManage && (\n              <>\n                <button\n                  className=\"section-link media-add-art\"\n                  type=\"button\"\n                  onClick={() => fileRef.current?.click()}\n                  disabled={uploading}\n                >\n                  {uploading ? \"Загрузка…\" : \"+ Добавить\"}\n                </button>\n                <input\n                  ref={fileRef}\n                  className=\"media-hidden-input\"\n                  type=\"file\"\n                  accept=\"image/*\"\n                  onChange={(event) => {\n                    const file = event.target.files?.[0] || null\n                    event.currentTarget.value = \"\"\n                    void addArt(file)\n                  }}\n                />\n              </>\n            )}`\n\n    s = replaceRequired(s, oldBlock, newBlock, \"ограничение общей галереи\")\n  }\n\n  s = s.replace(\n    '              Артов пока нет. Нажми «+ Добавить» и выбери картинку на телефоне.',\n    '              {canManage ? \"Артов пока нет. Нажми «+ Добавить» и выбери картинку на телефоне.\" : \"Артов кампании пока нет.\"}',\n  )\n\n  s = s.replace(\n    \"(selected.uploaded_by === user.id || canManage) && (\",\n    \"canManage && (\",\n  )\n\n  write(\"src/pages/Art.tsx\", s)\n}\n\n// 4) Character profile: player edits existing spells, but only manager creates/deletes.\n// Diary deletion is manager-only.\n{\n  let s = read(\"src/pages/CharacterProfile.tsx\")\n\n  s = s.replace(\n    '{canEditSpells && sheet?.spellcasting_enabled && <button className=\"section-link\" type=\"button\" onClick={() => setEditor({ type: \"spell\", spell: null })}>+ Заклинание</button>}',\n    '{canManage && sheet?.spellcasting_enabled && <button className=\"section-link\" type=\"button\" onClick={() => setEditor({ type: \"spell\", spell: null })}>+ Заклинание</button>}',\n  )\n\n  s = s.replace(\n    '          onDelete={editor.spell ? () => data.deleteSpell(editor.spell!.id) : undefined}',\n    '          onDelete={canManage && editor.spell ? () => data.deleteSpell(editor.spell!.id) : undefined}',\n  )\n\n  s = s.replace(\n    \"        const canDeletePost = canManage || post.created_by === currentUserId\",\n    \"        const canDeletePost = canManage && currentUserId.length > 0\",\n  )\n\n  s = s.replace(\n    '{(canManage || comment.created_by === currentUserId) && <button type=\"button\" onClick={() => void deleteComment(comment.id)}>Удалить</button>}',\n    '{canManage && currentUserId.length > 0 && <button type=\"button\" onClick={() => void deleteComment(comment.id)}>Удалить</button>}',\n  )\n\n  write(\"src/pages/CharacterProfile.tsx\", s)\n}\n\n// 5) World data delete methods.\n{\n  let s = read(\"src/hooks/useWorldContent.ts\")\n\n  if (!s.includes(\"const deleteWorldSection = useCallback\")) {\n    const anchor = \"  return {\\n    sections,\"\n    const block = `  const deleteWorldSection = useCallback(\n    async (sectionId: string): Promise<Result> => {\n      const { error } = await supabase.from(\"world_sections\").delete().eq(\"id\", sectionId)\n      if (error) return { ok: false, error: error.message }\n      await load()\n      return { ok: true }\n    },\n    [load],\n  )\n\n  const deleteWorldArticle = useCallback(\n    async (articleId: string): Promise<Result> => {\n      const { error } = await supabase.from(\"world_articles\").delete().eq(\"id\", articleId)\n      if (error) return { ok: false, error: error.message }\n      await load()\n      return { ok: true }\n    },\n    [load],\n  )\n\n  const deleteLocation = useCallback(\n    async (locationId: string): Promise<Result> => {\n      const { error } = await supabase.from(\"locations\").delete().eq(\"id\", locationId)\n      if (error) return { ok: false, error: error.message }\n      await load()\n      return { ok: true }\n    },\n    [load],\n  )\n\n  const deleteLocationSection = useCallback(\n    async (sectionId: string): Promise<Result> => {\n      const { error } = await supabase.from(\"location_sections\").delete().eq(\"id\", sectionId)\n      if (error) return { ok: false, error: error.message }\n      await load()\n      return { ok: true }\n    },\n    [load],\n  )\n\n  const deleteLocationLink = useCallback(\n    async (linkId: string): Promise<Result> => {\n      const { error } = await supabase.from(\"location_links\").delete().eq(\"id\", linkId)\n      if (error) return { ok: false, error: error.message }\n      await load()\n      return { ok: true }\n    },\n    [load],\n  )\n\n  const deleteAchievement = useCallback(\n    async (achievementId: string): Promise<Result> => {\n      const { error } = await supabase.from(\"achievements\").delete().eq(\"id\", achievementId)\n      if (error) return { ok: false, error: error.message }\n      await load()\n      return { ok: true }\n    },\n    [load],\n  )\n\n  const deleteUpdate = useCallback(\n    async (updateId: string): Promise<Result> => {\n      const { error } = await supabase.from(\"campaign_updates\").delete().eq(\"id\", updateId)\n      if (error) return { ok: false, error: error.message }\n      await load()\n      return { ok: true }\n    },\n    [load],\n  )\n\n`\n    if (!s.includes(anchor)) throw new Error(\"Не найден return useWorldContent.\")\n    s = s.replace(anchor, block + anchor)\n  }\n\n  if (!s.includes(\"    deleteWorldSection,\\n    deleteWorldArticle,\")) {\n    s = replaceRequired(\n      s,\n      \"    updateUpdate,\\n  }\",\n      \"    updateUpdate,\\n    deleteWorldSection,\\n    deleteWorldArticle,\\n    deleteLocation,\\n    deleteLocationSection,\\n    deleteLocationLink,\\n    deleteAchievement,\\n    deleteUpdate,\\n  }\",\n      \"useWorldContent return\",\n    )\n  }\n\n  write(\"src/hooks/useWorldContent.ts\", s)\n}\n\n// 6) World editor: two-tap delete in edit mode.\n{\n  let s = read(\"src/components/world/WorldEditor.tsx\")\n\n  if (!s.includes(\"  deleteItem: (mode: Exclude<WorldEditorMode, null>) => AsyncResult\")) {\n    const oldTail = `  updateUpdate: (\n    updateId: string,\n    input: {\n      kind: \"change\" | \"announcement\"\n      title: string\n      body: string\n    },\n  ) => AsyncResult\n}`\n\n    const newTail = `  updateUpdate: (\n    updateId: string,\n    input: {\n      kind: \"change\" | \"announcement\"\n      title: string\n      body: string\n    },\n  ) => AsyncResult\n  deleteItem: (mode: Exclude<WorldEditorMode, null>) => AsyncResult\n  onDeleted: () => void\n}`\n\n    s = replaceRequired(s, oldTail, newTail, \"WorldEditor delete props\")\n  }\n\n  if (!s.includes(\"const [deleteArmed, setDeleteArmed]\")) {\n    s = replaceRequired(\n      s,\n      '  const [error, setError] = useState(\"\")',\n      '  const [error, setError] = useState(\"\")\\n  const [deleteArmed, setDeleteArmed] = useState(false)',\n      \"WorldEditor delete state\",\n    )\n  }\n\n  if (!s.includes(\"async function removeCurrentItem()\")) {\n    const anchor = \"  const showSummary =\"\n    const block = `  async function removeCurrentItem() {\n    if (!deleteArmed) {\n      setDeleteArmed(true)\n      return\n    }\n\n    setSaving(true)\n    setError(\"\")\n    const result = await props.deleteItem(currentMode)\n    setSaving(false)\n\n    if (!result.ok) {\n      setError(result.error || \"Не удалось удалить.\")\n      return\n    }\n\n    props.onClose()\n    props.onDeleted()\n  }\n\n  const canDelete =\n    currentMode.type === \"world-section-edit\" ||\n    currentMode.type === \"article-edit\" ||\n    currentMode.type === \"location-edit\" ||\n    currentMode.type === \"location-section-edit\" ||\n    currentMode.type === \"location-link-edit\" ||\n    currentMode.type === \"achievement-edit\" ||\n    currentMode.type === \"update-edit\"\n\n`\n    if (!s.includes(anchor)) throw new Error(\"Не найден showSummary.\")\n    s = s.replace(anchor, block + anchor)\n  }\n\n  if (!s.includes(\"world-delete-zone\")) {\n    const oldBlock = `        {error && <div className=\"auth-error\">{error}</div>}\n\n        <button className=\"sheet-save\" type=\"submit\" disabled={saving}>\n          {saving ? \"Сохраняем…\" : \"Сохранить\"}\n        </button>`\n\n    const newBlock = `        {error && <div className=\"auth-error\">{error}</div>}\n\n        {canDelete && (\n          <button\n            className={deleteArmed ? \"world-delete-zone world-delete-zone--armed\" : \"world-delete-zone\"}\n            type=\"button\"\n            disabled={saving}\n            onClick={() => void removeCurrentItem()}\n          >\n            {deleteArmed ? \"Точно удалить? Это действие необратимо\" : \"Удалить\"}\n          </button>\n        )}\n\n        <button className=\"sheet-save\" type=\"submit\" disabled={saving}>\n          {saving ? \"Сохраняем…\" : \"Сохранить\"}\n        </button>`\n\n    s = replaceRequired(s, oldBlock, newBlock, \"WorldEditor delete button\")\n  }\n\n  write(\"src/components/world/WorldEditor.tsx\", s)\n}\n\n// 7) World page: dispatch deletes to correct table.\n{\n  let s = read(\"src/pages/World.tsx\")\n\n  if (!s.includes(\"      deleteItem={async (mode) => {\")) {\n    const anchor = `      createUpdate={world.createUpdate}\n      updateUpdate={world.updateUpdate}`\n\n    const replacement = `      createUpdate={world.createUpdate}\n      updateUpdate={world.updateUpdate}\n      deleteItem={async (mode) => {\n        if (mode.type === \"world-section-edit\") {\n          return world.deleteWorldSection(mode.section.id)\n        }\n        if (mode.type === \"article-edit\") {\n          return world.deleteWorldArticle(mode.article.id)\n        }\n        if (mode.type === \"location-edit\") {\n          return world.deleteLocation(mode.location.id)\n        }\n        if (mode.type === \"location-section-edit\") {\n          return world.deleteLocationSection(mode.section.id)\n        }\n        if (mode.type === \"location-link-edit\") {\n          return world.deleteLocationLink(mode.link.id)\n        }\n        if (mode.type === \"achievement-edit\") {\n          return world.deleteAchievement(mode.achievement.id)\n        }\n        if (mode.type === \"update-edit\") {\n          return world.deleteUpdate(mode.update.id)\n        }\n        return { ok: false, error: \"Этот объект нельзя удалить.\" }\n      }}\n      onDeleted={() => setView({ type: \"main\" })}`\n\n    s = replaceRequired(s, anchor, replacement, \"World delete dispatcher\")\n  }\n\n  write(\"src/pages/World.tsx\", s)\n}\n\n// 8) Chat settings: delete game room only.\n{\n  let s = read(\"src/components/chat/ChatRoomSettings.tsx\")\n\n  if (!s.includes(\"  onDeleted: () => void\")) {\n    s = replaceRequired(\n      s,\n      \"  onClose: () => void\\n  onSaved: (title: string) => void\",\n      \"  onClose: () => void\\n  onSaved: (title: string) => void\\n  onDeleted: () => void\",\n      \"ChatRoomSettings prop\",\n    )\n  }\n\n  if (!s.includes(\"  onDeleted,\\n}: Props)\")) {\n    s = replaceRequired(\n      s,\n      \"  onClose,\\n  onSaved,\\n}: Props)\",\n      \"  onClose,\\n  onSaved,\\n  onDeleted,\\n}: Props)\",\n      \"ChatRoomSettings destructure\",\n    )\n  }\n\n  if (!s.includes(\"const [deleteArmed, setDeleteArmed]\")) {\n    s = replaceRequired(\n      s,\n      '  const [error, setError] = useState(\"\")',\n      '  const [error, setError] = useState(\"\")\\n  const [deleteArmed, setDeleteArmed] = useState(false)',\n      \"Chat delete state\",\n    )\n  }\n\n  if (!s.includes(\"async function removeRoom()\")) {\n    const anchor = \"  return (\"\n    const block = `  async function removeRoom() {\n    if (!deleteArmed) {\n      setDeleteArmed(true)\n      return\n    }\n\n    setSaving(true)\n    setError(\"\")\n\n    const { error: deleteError } = await supabase\n      .from(\"chat_rooms\")\n      .delete()\n      .eq(\"id\", roomId)\n      .eq(\"category\", \"game\")\n\n    setSaving(false)\n\n    if (deleteError) {\n      setError(deleteError.message)\n      return\n    }\n\n    onDeleted()\n  }\n\n`\n    if (!s.includes(anchor)) throw new Error(\"Не найден return ChatRoomSettings.\")\n    s = s.replace(anchor, block + anchor)\n  }\n\n  if (!s.includes(\"chat-room-delete\")) {\n    const oldBlock = `        {notice && <div className=\"chat-settings-notice\">{notice}</div>}\n        {error && <div className=\"auth-error\">{error}</div>}\n\n        <button className=\"sheet-save\" type=\"button\" disabled={saving} onClick={() => void save()}>\n          {saving ? \"Сохраняем…\" : \"Сохранить настройки\"}\n        </button>`\n\n    const newBlock = `        {notice && <div className=\"chat-settings-notice\">{notice}</div>}\n        {error && <div className=\"auth-error\">{error}</div>}\n\n        <button\n          className={deleteArmed ? \"chat-room-delete chat-room-delete--armed\" : \"chat-room-delete\"}\n          type=\"button\"\n          disabled={saving}\n          onClick={() => void removeRoom()}\n        >\n          {deleteArmed ? \"Точно удалить игровой чат и его сообщения?\" : \"Удалить игровой чат\"}\n        </button>\n\n        <button className=\"sheet-save\" type=\"button\" disabled={saving} onClick={() => void save()}>\n          {saving ? \"Сохраняем…\" : \"Сохранить настройки\"}\n        </button>`\n\n    s = replaceRequired(s, oldBlock, newBlock, \"Chat delete button\")\n  }\n\n  write(\"src/components/chat/ChatRoomSettings.tsx\", s)\n}\n\n// 9) ChatRoom: after room deletion return to chat list.\n{\n  let s = read(\"src/pages/ChatRoom.tsx\")\n\n  if (!s.includes(\"          onDeleted={() => {\")) {\n    s = replaceRequired(\n      s,\n      '          onClose={() => setSettingsOpen(false)}\\n          onSaved={(nextTitle) => setRoomTitle(nextTitle)}',\n      '          onClose={() => setSettingsOpen(false)}\\n          onSaved={(nextTitle) => setRoomTitle(nextTitle)}\\n          onDeleted={() => {\\n            setSettingsOpen(false)\\n            onBack()\\n          }}',\n      \"ChatRoom onDeleted\",\n    )\n  }\n\n  write(\"src/pages/ChatRoom.tsx\", s)\n}\n\n// 10) Styles.\n{\n  let s = read(\"src/chat-v11.css\")\n  if (!s.includes(\"/* v11.3 manager-only delete controls */\")) {\n    s += `\n\n/* v11.3 manager-only delete controls */\n.manager-delete-wide,\n.world-delete-zone,\n.chat-room-delete{\n  width:100%;\n  min-height:40px;\n  margin-top:10px;\n  border:1px solid #4a2929;\n  border-radius:12px;\n  background:#1b1213;\n  color:#f0a3a3;\n  font-size:10px;\n  font-weight:800;\n}\n.manager-delete-wide--armed,\n.world-delete-zone--armed,\n.chat-room-delete--armed{\n  border-color:#7f1d1d;\n  background:#2a1113;\n  color:#fecaca;\n}\n.manager-delete-wide:disabled,\n.world-delete-zone:disabled,\n.chat-room-delete:disabled{\n  opacity:.45;\n}\n`\n  }\n\n  write(\"src/chat-v11.css\", s)\n}\n\nconsole.log(\"\")\nconsole.log(\"Готово: v11.3 применён.\")\nconsole.log(\"Supabase уже обновлён — SQL запускать не нужно.\")\nconsole.log(\"Теперь выполни: npm run build\")\n"
const embeddedLongPress = "import { useCallback, useRef } from \"react\"\nimport type {\n  MouseEvent as ReactMouseEvent,\n  PointerEvent as ReactPointerEvent,\n} from \"react\"\n\nexport function useLongPressItem<T>(\n  onLongPress: (item: T) => void,\n  delay = 520,\n) {\n  const timerRef = useRef<number | null>(null)\n  const startRef = useRef<{ x: number; y: number } | null>(null)\n  const suppressClickRef = useRef(false)\n\n  const clearTimer = useCallback(() => {\n    if (timerRef.current !== null) {\n      window.clearTimeout(timerRef.current)\n      timerRef.current = null\n    }\n  }, [])\n\n  return useCallback(\n    (item: T) => ({\n      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {\n        if (event.pointerType === \"mouse\" && event.button !== 0) return\n\n        clearTimer()\n        suppressClickRef.current = false\n        startRef.current = { x: event.clientX, y: event.clientY }\n\n        timerRef.current = window.setTimeout(() => {\n          timerRef.current = null\n          suppressClickRef.current = true\n          navigator.vibrate?.(18)\n          onLongPress(item)\n        }, delay)\n      },\n      onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {\n        const start = startRef.current\n        if (!start) return\n\n        const distance = Math.hypot(\n          event.clientX - start.x,\n          event.clientY - start.y,\n        )\n\n        if (distance > 12) clearTimer()\n      },\n      onPointerUp: () => {\n        clearTimer()\n        startRef.current = null\n      },\n      onPointerCancel: () => {\n        clearTimer()\n        startRef.current = null\n      },\n      onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => {\n        if (event.pointerType === \"mouse\") clearTimer()\n      },\n      onContextMenu: (event: ReactMouseEvent<HTMLElement>) => {\n        event.preventDefault()\n        clearTimer()\n        suppressClickRef.current = true\n        onLongPress(item)\n      },\n      onClickCapture: (event: ReactMouseEvent<HTMLElement>) => {\n        if (!suppressClickRef.current) return\n        event.preventDefault()\n        event.stopPropagation()\n        suppressClickRef.current = false\n      },\n    }),\n    [clearTimer, delay, onLongPress],\n  )\n}\n"
const embeddedActionSheet = "type Action = {\n  label: string\n  detail?: string\n  destructive?: boolean\n  disabled?: boolean\n  onSelect: () => void\n}\n\ntype Props = {\n  title: string\n  subtitle?: string\n  error?: string\n  actions: Action[]\n  onClose: () => void\n}\n\nexport default function ActionMenuSheet({\n  title,\n  subtitle,\n  error,\n  actions,\n  onClose,\n}: Props) {\n  return (\n    <div className=\"sheet-backdrop\" onMouseDown={onClose}>\n      <div\n        className=\"bottom-sheet long-press-action-sheet\"\n        onMouseDown={(event) => event.stopPropagation()}\n      >\n        <div className=\"sheet-handle\" />\n\n        <div className=\"character-editor-head\">\n          <div>\n            <h3 className=\"sheet-title\">{title}</h3>\n            {subtitle && <p className=\"sheet-copy\">{subtitle}</p>}\n          </div>\n          <button className=\"sheet-close\" type=\"button\" onClick={onClose}>\n            ×\n          </button>\n        </div>\n\n        <div className=\"long-press-action-list\">\n          {actions.map((action) => (\n            <button\n              type=\"button\"\n              key={action.label}\n              className={\n                action.destructive\n                  ? \"long-press-action long-press-action--danger\"\n                  : \"long-press-action\"\n              }\n              disabled={action.disabled}\n              onClick={action.onSelect}\n            >\n              <span>\n                <strong>{action.label}</strong>\n                {action.detail && <small>{action.detail}</small>}\n              </span>\n              <span>›</span>\n            </button>\n          ))}\n        </div>\n\n        {error && <div className=\"auth-error\">{error}</div>}\n      </div>\n    </div>\n  )\n}\n"

function read(rel) {
  const full = path.join(root, rel)
  if (!fs.existsSync(full)) {
    throw new Error(`Не найден ${rel}. Запусти скрипт из корня MEGANOTRPG.`)
  }
  return fs.readFileSync(full, "utf8")
}

function write(rel, content) {
  const full = path.join(root, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, "utf8")
  console.log(`✓ ${rel}`)
}

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(
      `Не найден блок «${label}». Ничего вручную не меняй — пришли мне эту ошибку.`,
    )
  }
  return source.replace(search, replacement)
}

// v11.4 cumulative: if the previous manager-delete/permission UI patch
// was not applied locally yet, apply it automatically first.
{
  const css = read("src/chat-v11.css")
  if (!css.includes("/* v11.3 manager-only delete controls */")) {
    const previousPatch = path.join(root, ".apply_v11_3_embedded.mjs")
    fs.writeFileSync(previousPatch, embeddedV113, "utf8")

    try {
      console.log("Сначала автоматически применяю v11.3…")
      execFileSync(process.execPath, [previousPatch], {
        cwd: root,
        stdio: "inherit",
      })
    } finally {
      if (fs.existsSync(previousPatch)) fs.unlinkSync(previousPatch)
    }
  }
}

write("src/hooks/useLongPressItem.ts", embeddedLongPress)
write("src/components/common/ActionMenuSheet.tsx", embeddedActionSheet)

// App: allow opening a chat directly with settings already open.
{
  let s = read("src/App.tsx")

  s = s.replace(
    '  | { type: "chat"; id: string }',
    '  | { type: "chat"; id: string; openSettings?: boolean }',
  )

  if (!s.includes("openSettingsInitially={overlay.openSettings}")) {
    s = replaceRequired(
      s,
      `        <ChatRoom
          roomId={overlay.id}
          onBack={() => setOverlay(null)}`,
      `        <ChatRoom
          roomId={overlay.id}
          openSettingsInitially={overlay.openSettings}
          onBack={() => setOverlay(null)}`,
      "ChatRoom openSettingsInitially",
    )
  }

  if (!s.includes("onOpenRoom={(id, options)")) {
    s = replaceRequired(
      s,
      '<Chats onOpenRoom={(id) => setOverlay({ type: "chat", id })} />',
      `<Chats
            onOpenRoom={(id, options) =>
              setOverlay({
                type: "chat",
                id,
                openSettings: options?.settings,
              })
            }
          />`,
      "Chats onOpenRoom options",
    )
  }

  write("src/App.tsx", s)
}

// useRooms: manager delete for long-press chat menu.
{
  let s = read("src/hooks/useRooms.ts")

  if (!s.includes("const deleteGameRoom = useCallback")) {
    const anchor = "  return {\n    rooms,"
    const block = `  const deleteGameRoom = useCallback(
    async (roomId: string): Promise<Result> => {
      const { error: deleteError } = await supabase
        .from("chat_rooms")
        .delete()
        .eq("id", roomId)
        .eq("category", "game")

      if (deleteError) {
        return { ok: false, error: deleteError.message }
      }

      await loadRooms()
      return { ok: true }
    },
    [loadRooms],
  )

`
    if (!s.includes(anchor)) throw new Error("Не найден return useRooms.")
    s = s.replace(anchor, block + anchor)
  }

  if (!s.includes("    deleteGameRoom,\n  }")) {
    s = replaceRequired(
      s,
      "    createGameRoom,\n  }",
      "    createGameRoom,\n    deleteGameRoom,\n  }",
      "useRooms deleteGameRoom return",
    )
  }

  write("src/hooks/useRooms.ts", s)
}

// Chats: long press on a game room => open/settings/delete.
{
  let s = read("src/pages/Chats.tsx")

  if (!s.includes('import ActionMenuSheet from "../components/common/ActionMenuSheet"')) {
    s = replaceRequired(
      s,
      'import CharacterAvatar from "../components/characters/CharacterAvatar"',
      `import CharacterAvatar from "../components/characters/CharacterAvatar"
import ActionMenuSheet from "../components/common/ActionMenuSheet"
import { useLongPressItem } from "../hooks/useLongPressItem"`,
      "Chats long press imports",
    )
  }

  s = s.replace(
    "type Props = { onOpenRoom: (id: string) => void }",
    `type Props = {
  onOpenRoom: (id: string, options?: { settings?: boolean }) => void
}`,
  )

  const oldRoomListStart = s.indexOf("function RoomList({")
  const oldRoomListEnd = s.indexOf("\n\nexport default function Chats", oldRoomListStart)

  if (oldRoomListStart === -1 || oldRoomListEnd === -1) {
    throw new Error("Не найден компонент RoomList.")
  }

  const newRoomList = `function RoomList({
  items,
  onOpenRoom,
  canManage,
  onMenu,
}: {
  items: ChatRoom[]
  onOpenRoom: (id: string, options?: { settings?: boolean }) => void
  canManage: boolean
  onMenu: (room: ChatRoom) => void
}) {
  const bindLongPress = useLongPressItem<ChatRoom>((room) => {
    if (canManage && room.category === "game") onMenu(room)
  })

  return (
    <div className="chat-section surface">
      {items.length === 0 && <div className="empty-row">Здесь пока нет чатов</div>}
      {items.map((room) => {
        const hasManagerMenu = canManage && room.category === "game"

        return (
          <button
            key={room.id}
            type="button"
            className="chat-row"
            {...(hasManagerMenu ? bindLongPress(room) : {})}
            onClick={() => onOpenRoom(room.id)}
          >
            <div className={\`avatar chat-room-avatar chat-room-avatar--\${room.category}\`}>
              {room.category === "flood" ? "F" : room.title.slice(0, 1)}
            </div>
            <div className="chat-row__content">
              <div className="chat-row__top">
                <span className="chat-row__title">{room.title}</span>
                <span className="chat-row__time">{room.time}</span>
              </div>
              <div className="chat-row__preview">{room.preview}</div>
              {hasManagerMenu && (
                <div className="long-press-hint">Зажми для действий</div>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}`

  s = s.slice(0, oldRoomListStart) + newRoomList + s.slice(oldRoomListEnd)

  if (!s.includes("    deleteGameRoom,")) {
    s = replaceRequired(
      s,
      "    reload,\n    createGameRoom,",
      "    reload,\n    createGameRoom,\n    deleteGameRoom,",
      "Chats deleteGameRoom destructure",
    )
  }

  if (!s.includes("const [menuRoom, setMenuRoom]")) {
    s = replaceRequired(
      s,
      '  const [saving, setSaving] = useState(false)',
      `  const [saving, setSaving] = useState(false)
  const [menuRoom, setMenuRoom] = useState<ChatRoom | null>(null)
  const [menuError, setMenuError] = useState("")
  const [menuBusy, setMenuBusy] = useState(false)`,
      "Chats menu state",
    )
  }

  if (!s.includes("async function removeMenuRoom()")) {
    const anchor = "  return (\n    <>"
    const block = `  async function removeMenuRoom() {
    if (!menuRoom) return

    setMenuBusy(true)
    setMenuError("")
    const result = await deleteGameRoom(menuRoom.id)
    setMenuBusy(false)

    if (!result.ok) {
      setMenuError(result.error || "Не удалось удалить игровой чат.")
      return
    }

    setMenuRoom(null)
  }

`
    if (!s.includes(anchor)) throw new Error("Не найден return Chats.")
    s = s.replace(anchor, block + anchor)
  }

  s = s.replace(
    '<RoomList items={floodRooms} onOpenRoom={onOpenRoom} />',
    `<RoomList
            items={floodRooms}
            onOpenRoom={onOpenRoom}
            canManage={canManage}
            onMenu={setMenuRoom}
          />`,
  )

  s = s.replace(
    '<RoomList items={gameRooms} onOpenRoom={onOpenRoom} />',
    `<RoomList
            items={gameRooms}
            onOpenRoom={onOpenRoom}
            canManage={canManage}
            onMenu={(room) => {
              setMenuError("")
              setMenuRoom(room)
            }}
          />`,
  )

  if (!s.includes("menuRoom && (\n        <ActionMenuSheet")) {
    const closeFragment = s.lastIndexOf("    </>\n  )\n}")
    if (closeFragment === -1) throw new Error("Не найден конец Chats.")

    const menu = `
      {menuRoom && (
        <ActionMenuSheet
          title={menuRoom.title}
          subtitle="Меню игрового чата"
          error={menuError}
          onClose={() => {
            if (!menuBusy) setMenuRoom(null)
          }}
          actions={[
            {
              label: "Открыть чат",
              detail: "Обычный вход в диалог",
              onSelect: () => {
                const id = menuRoom.id
                setMenuRoom(null)
                onOpenRoom(id)
              },
            },
            {
              label: "Настройки",
              detail: "Игроки, права, отдых и название",
              onSelect: () => {
                const id = menuRoom.id
                setMenuRoom(null)
                onOpenRoom(id, { settings: true })
              },
            },
            {
              label: menuBusy ? "Удаляем…" : "Удалить чат",
              detail: "Удалятся и сообщения этой комнаты",
              destructive: true,
              disabled: menuBusy,
              onSelect: () => void removeMenuRoom(),
            },
          ]}
        />
      )}

`
    s = s.slice(0, closeFragment) + menu + s.slice(closeFragment)
  }

  write("src/pages/Chats.tsx", s)
}

// ChatRoom: clickable author/avatar and direct settings opening.
{
  let s = read("src/pages/ChatRoom.tsx")

  if (!s.includes("  openSettingsInitially?: boolean")) {
    s = replaceRequired(
      s,
      `type Props = {
  roomId: string
  onBack: () => void`,
      `type Props = {
  roomId: string
  openSettingsInitially?: boolean
  onBack: () => void`,
      "ChatRoom props",
    )
  }

  if (!s.includes("  openSettingsInitially = false,")) {
    s = replaceRequired(
      s,
      `export default function ChatRoom({
  roomId,
  onBack,`,
      `export default function ChatRoom({
  roomId,
  openSettingsInitially = false,
  onBack,`,
      "ChatRoom destructure",
    )
  }

  s = s.replace(
    "  const [settingsOpen, setSettingsOpen] = useState(false)",
    "  const [settingsOpen, setSettingsOpen] = useState(openSettingsInitially)",
  )

  s = s.replace(
    `              {!own && (
                <CharacterAvatar character={avatarCharacter} size="small" />
              )}`,
    `              {!own && (
                linkedCharacter ? (
                  <button
                    className="message-avatar-button"
                    type="button"
                    onClick={() => onOpenCharacter(linkedCharacter.id)}
                    aria-label={\`Открыть \${linkedCharacter.name}\`}
                  >
                    <CharacterAvatar character={avatarCharacter} size="small" />
                  </button>
                ) : (
                  <CharacterAvatar character={avatarCharacter} size="small" />
                )
              )}`,
  )

  s = s.replace(
    `                <div className="message__author">{message.author_name}</div>`,
    `                {linkedCharacter ? (
                  <button
                    className="message__author message__author--link"
                    type="button"
                    onClick={() => onOpenCharacter(linkedCharacter.id)}
                  >
                    {message.author_name}
                  </button>
                ) : (
                  <div className="message__author">{message.author_name}</div>
                )}`,
  )

  s = s.replace(
    `              {own && (
                <CharacterAvatar character={avatarCharacter} size="small" />
              )}`,
    `              {own && (
                linkedCharacter ? (
                  <button
                    className="message-avatar-button"
                    type="button"
                    onClick={() => onOpenCharacter(linkedCharacter.id)}
                    aria-label={\`Открыть \${linkedCharacter.name}\`}
                  >
                    <CharacterAvatar character={avatarCharacter} size="small" />
                  </button>
                ) : (
                  <CharacterAvatar character={avatarCharacter} size="small" />
                )
              )}`,
  )

  write("src/pages/ChatRoom.tsx", s)
}

// Characters: regular players see their own characters plus only ACTIVE characters
// of other players. Managers keep seeing everything. Long press opens manager actions.
{
  let s = read("src/pages/Characters.tsx")

  if (!s.includes('import ActionMenuSheet from "../components/common/ActionMenuSheet"')) {
    s = replaceRequired(
      s,
      'import CharacterAvatar from "../components/characters/CharacterAvatar"',
      `import CharacterAvatar from "../components/characters/CharacterAvatar"
import ActionMenuSheet from "../components/common/ActionMenuSheet"
import { useLongPressItem } from "../hooks/useLongPressItem"`,
      "Characters long press imports",
    )
  }

  s = s.replace("    myCharacters,\n", "")

  // Remove v11.3 two-tap delete UI/state; deletion moves into long-press menu.
  s = s.replace('  const [deleteArmed, setDeleteArmed] = useState(false)\n', "")
  s = s.replace("    setDeleteArmed(false)\n", "")

  const oldRemove = `  async function removeCharacter() {
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
  s = s.replace(oldRemove, "")

  const oldDeleteButton = `            {editor.type === "edit" && (
              <button
                className={deleteArmed ? "manager-delete-wide manager-delete-wide--armed" : "manager-delete-wide"}
                type="button"
                disabled={saving}
                onClick={() => void removeCharacter()}
              >
                {deleteArmed ? "Точно удалить персонажа?" : "Удалить персонажа"}
              </button>
            )}

`
  s = s.replace(oldDeleteButton, "")

  if (!s.includes("const [menuCharacter, setMenuCharacter]")) {
    s = replaceRequired(
      s,
      '  const [formError, setFormError] = useState("")',
      `  const [formError, setFormError] = useState("")
  const [menuCharacter, setMenuCharacter] = useState<Character | null>(null)
  const [menuError, setMenuError] = useState("")
  const [menuBusy, setMenuBusy] = useState(false)`,
      "Characters menu state",
    )
  }

  if (!s.includes("const bindCharacterLongPress = useLongPressItem")) {
    const anchor = "  const telegramMembers = useMemo("
    const block = `  const bindCharacterLongPress = useLongPressItem<Character>((character) => {
    if (!canManage) return
    setMenuError("")
    setMenuCharacter(character)
  })

`
    if (!s.includes(anchor)) throw new Error("Не найден telegramMembers.")
    s = s.replace(anchor, block + anchor)
  }

  if (!s.includes("async function removeMenuCharacter()")) {
    const anchor = "  function memberLabel(member: CampaignMember) {"
    const block = `  async function removeMenuCharacter() {
    if (!menuCharacter) return

    setMenuBusy(true)
    setMenuError("")
    const result = await deleteCharacter(menuCharacter.id)
    setMenuBusy(false)

    if (!result.ok) {
      setMenuError(result.error || "Не удалось удалить персонажа.")
      return
    }

    setMenuCharacter(null)
  }

`
    if (!s.includes(anchor)) throw new Error("Не найден memberLabel.")
    s = s.replace(anchor, block + anchor)
  }

  // Long press binding on the character card.
  if (!s.includes("{...(canManage ? bindCharacterLongPress(character) : {})}")) {
    s = replaceRequired(
      s,
      `      <article
        className={\`character-social-card surface \${isActive ? "character-social-card--active" : ""}\`}
        key={character.id}
      >`,
      `      <article
        {...(canManage ? bindCharacterLongPress(character) : {})}
        className={\`character-social-card surface \${isActive ? "character-social-card--active" : ""}\`}
        key={character.id}
      >`,
      "Characters card long press",
    )
  }

  // Remove the always-visible manager buttons: they now live in the long-press menu.
  const managerActions = `        {canManage && (
          <div className="gm-character-actions">
            <button type="button" onClick={() => openEdit(character)}>
              ✎ Редактировать
            </button>
            {member && !isActive && (
              <button
                type="button"
                onClick={() => void makeActive(character)}
                disabled={saving}
              >
                Сделать активным
              </button>
            )}
          </div>
        )}

`
  s = s.replace(managerActions, "")

  // Add a read-only note for another player's active character.
  if (!s.includes("Активный персонаж другого игрока")) {
    const ownNote = `        {!canManage && character.assigned_user_id === user.id && (
          <div className="player-character-note">
            {isActive
              ? "Этот персонаж назначен тебе активным"
              : "Персонаж прикреплён к тебе. Активного выбирает GM или владелец"}
          </div>
        )}`

    const noteReplacement = `${ownNote}

        {!canManage &&
          character.assigned_user_id !== user.id &&
          isActive && (
            <div className="player-character-note">
              Активный персонаж другого игрока · доступен полный просмотр
            </div>
          )}`

    s = replaceRequired(s, ownNote, noteReplacement, "note for other active character")
  }

  s = s.replace(
    '{canManage ? "Персонажи кампании" : "Мои персонажи"}',
    '{canManage ? "Персонажи кампании" : "Персонажи кампании"}',
  )

  s = s.replace(
    ': "Здесь только персонажи, прикреплённые к твоему Telegram-профилю"}',
    ': "Твои персонажи и только активные персонажи других игроков"}',
  )

  s = s.replace(
    "(canManage ? characters : myCharacters).length",
    "characters.length",
  )
  s = s.replace(
    "(canManage ? characters : myCharacters).map(renderCard)",
    "characters.map(renderCard)",
  )

  s = s.replace(
    ': "К тебе пока не прикреплён персонаж."}',
    ': "Пока нет доступных персонажей."}',
  )

  if (!s.includes("menuCharacter && (\n        <ActionMenuSheet")) {
    const closeFragment = s.lastIndexOf("    </>\n  )\n}")
    if (closeFragment === -1) throw new Error("Не найден конец Characters.")

    const menu = `
      {menuCharacter && (
        <ActionMenuSheet
          title={menuCharacter.name}
          subtitle="Зажатие карточки · действия GM/владельца"
          error={menuError}
          onClose={() => {
            if (!menuBusy) setMenuCharacter(null)
          }}
          actions={[
            {
              label: "Открыть персонажа",
              detail: "Посмотреть лист, инвентарь, заклинания и дневник",
              onSelect: () => {
                const id = menuCharacter.id
                setMenuCharacter(null)
                onOpenCharacter(id)
              },
            },
            {
              label: "Редактировать",
              detail: "Имя, уровень, привязка игрока и описание",
              onSelect: () => {
                const character = menuCharacter
                setMenuCharacter(null)
                openEdit(character)
              },
            },
            ...(menuCharacter.assigned_user_id &&
            members.find(
              (member) =>
                member.user_id === menuCharacter.assigned_user_id &&
                member.active_character_id !== menuCharacter.id,
            )
              ? [
                  {
                    label: "Сделать активным",
                    detail: "Игроки будут видеть именно этого персонажа",
                    onSelect: () => {
                      const character = menuCharacter
                      setMenuCharacter(null)
                      void makeActive(character)
                    },
                  },
                ]
              : []),
            {
              label: menuBusy ? "Удаляем…" : "Удалить персонажа",
              detail: "Удалятся лист, инвентарь, заклинания и дневник",
              destructive: true,
              disabled: menuBusy,
              onSelect: () => void removeMenuCharacter(),
            },
          ]}
        />
      )}

`
    s = s.slice(0, closeFragment) + menu + s.slice(closeFragment)
  }

  write("src/pages/Characters.tsx", s)
}

// Styles for clickable chat identities + long-press menus.
{
  let s = read("src/chat-v11.css")

  if (!s.includes("/* v11.4 social character visibility */")) {
    s += `

/* v11.4 social character visibility */
.message-avatar-button{
  flex:0 0 auto;
  width:auto;
  height:auto;
  padding:0;
  border:0;
  background:transparent;
  border-radius:999px;
}
.message__author--link{
  width:max-content;
  max-width:100%;
  padding:0;
  border:0;
  background:transparent;
  color:#c4b5fd;
  font:inherit;
  font-weight:800;
  text-align:left;
  text-decoration:underline;
  text-decoration-color:#4b3b63;
  text-underline-offset:2px;
}
.long-press-hint{
  margin-top:3px;
  color:#5f5966;
  font-size:7px;
}
.long-press-action-sheet{
  max-height:72dvh;
  overflow-y:auto;
}
.long-press-action-list{
  margin-top:10px;
  display:flex;
  flex-direction:column;
  gap:6px;
}
.long-press-action{
  width:100%;
  min-height:52px;
  padding:8px 11px;
  border:1px solid #2d2933;
  border-radius:13px;
  background:#141416;
  color:#e4e4e7;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  text-align:left;
}
.long-press-action>span:first-child{
  min-width:0;
  display:flex;
  flex-direction:column;
}
.long-press-action strong{
  font-size:11px;
}
.long-press-action small{
  margin-top:2px;
  color:#77717e;
  font-size:8px;
  line-height:1.35;
}
.long-press-action>span:last-child{
  color:#615b68;
  font-size:20px;
}
.long-press-action--danger{
  border-color:#4b292d;
  background:#1a1214;
  color:#fecaca;
}
.long-press-action--danger small{
  color:#a9797d;
}
.long-press-action:disabled{
  opacity:.45;
}
.character-social-card{
  -webkit-touch-callout:none;
  user-select:none;
}
.chat-row{
  -webkit-touch-callout:none;
}
`
  }

  write("src/chat-v11.css", s)
}

console.log("")
console.log("Готово: v11.4 применён.")
console.log("Серверная видимость активных персонажей уже включена в Supabase.")
console.log("Теперь: npm run build")
