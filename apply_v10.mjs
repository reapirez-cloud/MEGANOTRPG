import fs from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const touched = []

function read(rel) {
  const full = path.join(ROOT, rel)
  if (!fs.existsSync(full)) throw new Error("Не найден " + rel + ". Запусти скрипт из корня MEGANOTRPG, где лежит package.json.")
  return fs.readFileSync(full, "utf8")
}

function write(rel, content) {
  const full = path.join(ROOT, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, "utf8")
  touched.push(rel)
}

function ensureImport(source, importLine, afterLine) {
  if (source.includes(importLine)) return source
  if (!source.includes(afterLine)) throw new Error("Не удалось добавить импорт: " + importLine)
  return source.replace(afterLine, afterLine + "\n" + importLine)
}

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error("Не найден блок «" + label + "». Файл отличается от ожидаемой версии.")
  return source.replace(search, replacement)
}

const mediaUpload = "import { supabase } from \"./supabase\"\n\nconst BUCKET = \"campaign-media\"\nconst MAX_IMAGE_BYTES = 10 * 1024 * 1024\n\nexport type UploadImageResult =\n  | { ok: true; url: string }\n  | { ok: false; error: string }\n\nfunction extensionFor(file: File) {\n  const fromName = file.name\n    .split(\".\")\n    .pop()\n    ?.toLowerCase()\n    .replace(/[^a-z0-9]/g, \"\")\n\n  if (fromName && fromName.length <= 5) return fromName\n\n  const mimeMap: Record<string, string> = {\n    \"image/jpeg\": \"jpg\",\n    \"image/png\": \"png\",\n    \"image/webp\": \"webp\",\n    \"image/gif\": \"gif\",\n    \"image/heic\": \"heic\",\n    \"image/heif\": \"heif\",\n  }\n\n  return mimeMap[file.type] || \"jpg\"\n}\n\nexport async function uploadCampaignImage(\n  file: File,\n  folder: string,\n): Promise<UploadImageResult> {\n  if (!file.type.startsWith(\"image/\")) {\n    return { ok: false, error: \"Выбери файл изображения.\" }\n  }\n\n  if (file.size > MAX_IMAGE_BYTES) {\n    return { ok: false, error: \"Изображение слишком большое. Максимум 10 МБ.\" }\n  }\n\n  const { data: userData, error: userError } = await supabase.auth.getUser()\n  if (userError || !userData.user) {\n    return { ok: false, error: \"Не удалось определить текущего пользователя.\" }\n  }\n\n  const safeFolder = folder.replace(/[^a-z0-9_-]/gi, \"-\") || \"misc\"\n  const id =\n    globalThis.crypto?.randomUUID?.() ||\n    `${Date.now()}-${Math.random().toString(16).slice(2)}`\n  const objectPath = `${userData.user.id}/${safeFolder}/${id}.${extensionFor(file)}`\n\n  const { error: uploadError } = await supabase.storage\n    .from(BUCKET)\n    .upload(objectPath, file, {\n      cacheControl: \"3600\",\n      upsert: false,\n      contentType: file.type || undefined,\n    })\n\n  if (uploadError) {\n    return { ok: false, error: uploadError.message }\n  }\n\n  const { data } = supabase.storage.from(BUCKET).getPublicUrl(objectPath)\n  if (!data.publicUrl) {\n    return { ok: false, error: \"Файл загрузился, но ссылка не была создана.\" }\n  }\n\n  return { ok: true, url: data.publicUrl }\n}\n"
const imageUploadField = "import { useState } from \"react\"\n\nimport { uploadCampaignImage } from \"../../lib/mediaUpload\"\n\ntype Props = {\n  value: string\n  onChange: (value: string) => void\n  folder: string\n  label?: string\n  hint?: string\n}\n\nexport default function ImageUploadField({\n  value,\n  onChange,\n  folder,\n  label = \"Арт\",\n  hint = \"Можно выбрать изображение прямо из галереи телефона.\",\n}: Props) {\n  const [uploading, setUploading] = useState(false)\n  const [error, setError] = useState(\"\")\n\n  async function choose(file: File | null) {\n    if (!file) return\n    setUploading(true)\n    setError(\"\")\n    const result = await uploadCampaignImage(file, folder)\n    setUploading(false)\n\n    if (!result.ok) {\n      setError(result.error)\n      return\n    }\n\n    onChange(result.url)\n  }\n\n  return (\n    <div className=\"image-upload-field\">\n      <div className=\"image-upload-field__head\">\n        <label className=\"field-label\">{label}</label>\n        <small>{hint}</small>\n      </div>\n\n      {value && (\n        <div className=\"image-upload-preview\">\n          <img src={value} alt=\"\" />\n        </div>\n      )}\n\n      <div className=\"image-upload-actions\">\n        <label\n          className={`media-file-button ${\n            uploading ? \"media-file-button--disabled\" : \"\"\n          }`}\n        >\n          <input\n            type=\"file\"\n            accept=\"image/*\"\n            disabled={uploading}\n            onChange={(event) => {\n              const file = event.target.files?.[0] || null\n              event.currentTarget.value = \"\"\n              void choose(file)\n            }}\n          />\n          {uploading\n            ? \"Загружаем…\"\n            : value\n              ? \"Заменить с телефона\"\n              : \"Выбрать с телефона\"}\n        </label>\n\n        {value && (\n          <button\n            className=\"media-clear-button\"\n            type=\"button\"\n            onClick={() => {\n              setError(\"\")\n              onChange(\"\")\n            }}\n            disabled={uploading}\n          >\n            Убрать\n          </button>\n        )}\n      </div>\n\n      <details className=\"media-url-details\">\n        <summary>Или вставить ссылку</summary>\n        <input\n          className=\"app-input\"\n          value={value}\n          onChange={(event) => onChange(event.target.value)}\n          placeholder=\"https://...\"\n        />\n      </details>\n\n      {error && <div className=\"auth-error\">{error}</div>}\n    </div>\n  )\n}\n"
const artPage = "import { useCallback, useEffect, useRef, useState } from \"react\"\n\nimport { useAuth } from \"../context/AuthContext\"\nimport { useCharacters } from \"../context/CharacterContext\"\nimport { uploadCampaignImage } from \"../lib/mediaUpload\"\nimport { supabase } from \"../lib/supabase\"\n\ntype ArtItem = {\n  id: string\n  campaign_id: string\n  uploaded_by: string | null\n  title: string\n  image_url: string\n  created_at: string\n}\n\nexport default function Art() {\n  const { user } = useAuth()\n  const { campaignId, canManage } = useCharacters()\n  const fileRef = useRef<HTMLInputElement | null>(null)\n  const [items, setItems] = useState<ArtItem[]>([])\n  const [selected, setSelected] = useState<ArtItem | null>(null)\n  const [loading, setLoading] = useState(true)\n  const [uploading, setUploading] = useState(false)\n  const [error, setError] = useState(\"\")\n\n  const load = useCallback(async () => {\n    if (!campaignId) return\n    setLoading(true)\n    setError(\"\")\n\n    const { data, error: loadError } = await supabase\n      .from(\"campaign_art_items\")\n      .select(\"id, campaign_id, uploaded_by, title, image_url, created_at\")\n      .eq(\"campaign_id\", campaignId)\n      .order(\"created_at\", { ascending: false })\n\n    if (loadError) {\n      setError(loadError.message)\n      setLoading(false)\n      return\n    }\n\n    setItems((data || []) as ArtItem[])\n    setLoading(false)\n  }, [campaignId])\n\n  useEffect(() => {\n    void load()\n  }, [load])\n\n  async function addArt(file: File | null) {\n    if (!file || !campaignId) return\n    setUploading(true)\n    setError(\"\")\n\n    const upload = await uploadCampaignImage(file, \"gallery\")\n    if (!upload.ok) {\n      setError(upload.error)\n      setUploading(false)\n      return\n    }\n\n    const title = file.name.replace(/\\.[^.]+$/, \"\").slice(0, 120) || \"Арт\"\n    const { error: insertError } = await supabase\n      .from(\"campaign_art_items\")\n      .insert({\n        campaign_id: campaignId,\n        uploaded_by: user.id,\n        title,\n        image_url: upload.url,\n      })\n\n    setUploading(false)\n\n    if (insertError) {\n      setError(insertError.message)\n      return\n    }\n\n    await load()\n  }\n\n  async function removeArt(item: ArtItem) {\n    setError(\"\")\n    const { error: deleteError } = await supabase\n      .from(\"campaign_art_items\")\n      .delete()\n      .eq(\"id\", item.id)\n\n    if (deleteError) {\n      setError(deleteError.message)\n      return\n    }\n\n    setSelected(null)\n    await load()\n  }\n\n  return (\n    <>\n      <div className=\"page-stack\">\n        <section className=\"section\">\n          <div className=\"section-head\">\n            <div>\n              <h3 className=\"section-title\">Галерея кампании</h3>\n              <p className=\"item-meta\">Загружай арты прямо с телефона</p>\n            </div>\n\n            <button\n              className=\"section-link media-add-art\"\n              type=\"button\"\n              onClick={() => fileRef.current?.click()}\n              disabled={uploading}\n            >\n              {uploading ? \"Загрузка…\" : \"+ Добавить\"}\n            </button>\n            <input\n              ref={fileRef}\n              className=\"media-hidden-input\"\n              type=\"file\"\n              accept=\"image/*\"\n              onChange={(event) => {\n                const file = event.target.files?.[0] || null\n                event.currentTarget.value = \"\"\n                void addArt(file)\n              }}\n            />\n          </div>\n\n          {error && <div className=\"auth-error\">{error}</div>}\n          {loading && (\n            <div className=\"center-state\">\n              <span className=\"status-spinner\" />\n              <span>Загружаем арты…</span>\n            </div>\n          )}\n\n          {!loading && items.length === 0 && (\n            <div className=\"character-empty surface\">\n              Артов пока нет. Нажми «+ Добавить» и выбери картинку на телефоне.\n            </div>\n          )}\n\n          {!loading && items.length > 0 && (\n            <div className=\"art-grid art-grid--real\" aria-label=\"Галерея артов\">\n              {items.map((art) => (\n                <button\n                  type=\"button\"\n                  className=\"art-tile art-tile--real\"\n                  key={art.id}\n                  aria-label={art.title}\n                  onClick={() => setSelected(art)}\n                >\n                  <img src={art.image_url} alt={art.title} loading=\"lazy\" />\n                </button>\n              ))}\n            </div>\n          )}\n        </section>\n      </div>\n\n      {selected && (\n        <div className=\"sheet-backdrop\" onMouseDown={() => setSelected(null)}>\n          <div\n            className=\"bottom-sheet art-viewer-sheet\"\n            onMouseDown={(event) => event.stopPropagation()}\n          >\n            <div className=\"sheet-handle\" />\n            <div className=\"character-editor-head\">\n              <div>\n                <h3 className=\"sheet-title\">{selected.title || \"Арт\"}</h3>\n                <p className=\"sheet-copy\">Галерея кампании</p>\n              </div>\n              <button\n                className=\"sheet-close\"\n                type=\"button\"\n                onClick={() => setSelected(null)}\n              >\n                ×\n              </button>\n            </div>\n            <img\n              className=\"art-viewer-image\"\n              src={selected.image_url}\n              alt={selected.title}\n            />\n            {(selected.uploaded_by === user.id || canManage) && (\n              <button\n                className=\"danger-mini-button art-delete-button\"\n                type=\"button\"\n                onClick={() => void removeArt(selected)}\n              >\n                Удалить из галереи\n              </button>\n            )}\n          </div>\n        </div>\n      )}\n    </>\n  )\n}\n"
const cssAppend = "\n\n/* v10 media upload + real campaign gallery */\n.image-upload-field{margin-top:10px;padding:11px;border:1px solid #302b37;border-radius:15px;background:#141416}\n.image-upload-field__head{display:flex;align-items:flex-end;justify-content:space-between;gap:10px}\n.image-upload-field__head .field-label{margin:0}\n.image-upload-field__head small{max-width:190px;color:#77717e;font-size:8px;line-height:1.35;text-align:right}\n.image-upload-preview{width:100%;height:170px;margin-top:9px;overflow:hidden;border:1px solid #2e2a33;border-radius:13px;background:#0c0c0e}\n.image-upload-preview img{width:100%;height:100%;display:block;object-fit:cover}\n.image-upload-actions{margin-top:9px;display:flex;gap:7px}\n.media-file-button,.media-clear-button{min-height:38px;padding:0 12px;border-radius:11px;font-size:10px;font-weight:750;display:flex;align-items:center;justify-content:center}\n.media-file-button{flex:1;border:1px solid #4b3765;background:#21172d;color:#d8b4fe;cursor:pointer}\n.media-file-button input,.media-hidden-input{display:none}\n.media-file-button--disabled{opacity:.55;pointer-events:none}\n.media-clear-button{border:1px solid #3a3030;background:#1b1515;color:#d5a3a3}\n.media-url-details{margin-top:8px}\n.media-url-details summary{color:#746d7d;font-size:9px;cursor:pointer}\n.media-url-details .app-input{margin-top:7px}\n.world-all-link{min-height:30px;padding:0 9px;border:1px solid #49355f;border-radius:10px;background:#1a1520;color:#c4b5fd;font-size:9px;font-weight:800;white-space:nowrap}\n.art-grid--real{align-items:stretch}\n.art-tile--real{position:relative;overflow:hidden;background:#111114}\n.art-tile--real img{width:100%;height:100%;display:block;object-fit:cover}\n.media-add-art:disabled{opacity:.55}\n.art-viewer-sheet{max-height:88dvh;overflow-y:auto}\n.art-viewer-image{width:100%;max-height:65dvh;margin-top:10px;border-radius:15px;display:block;object-fit:contain;background:#0b0b0d}\n.art-delete-button{width:100%;margin-top:10px;min-height:40px}\n@media(max-width:390px){.image-upload-preview{height:150px}.world-all-link{padding:0 7px;font-size:8px}.image-upload-field__head small{max-width:150px}}\n"

write("src/lib/mediaUpload.ts", mediaUpload)
write("src/components/common/ImageUploadField.tsx", imageUploadField)
write("src/pages/Art.tsx", artPage)

// Мир: делаем переходы к полным спискам заметными и однозначными.
{
  let s = read("src/pages/World.tsx")
  if (!s.includes('{ type: "achievements" }') || !s.includes('{ type: "updates" }')) {
    throw new Error("В World.tsx ещё нет экранов полного списка достижений/событий. Сначала нужна версия v9.")
  }

  s = s.replace(
    /<button\s+className="section-link"\s+type="button"\s+onClick=\{\(\) => setView\(\{ type: "achievements" \}\)\}\s*>\s*Все(?: достижения)?(?: →)?\s*<\/button>/,
    '<button className="world-all-link" type="button" onClick={() => setView({ type: "achievements" })}>\n                Все достижения →\n              </button>',
  )

  s = s.replace(
    /<button\s+className="section-link"\s+type="button"\s+onClick=\{\(\) => setView\(\{ type: "updates" \}\)\}\s*>\s*Все(?: события)?(?: →)?\s*<\/button>/,
    '<button className="world-all-link" type="button" onClick={() => setView({ type: "updates" })}>\n                Все события →\n              </button>',
  )

  write("src/pages/World.tsx", s)
}

// Локации: заменяем URL-поле на выбор изображения с телефона.
{
  let s = read("src/components/world/WorldEditor.tsx")
  s = ensureImport(s, 'import ImageUploadField from "../common/ImageUploadField"', 'import type { FormEvent } from "react"')
  if (!s.includes('folder="locations"')) {
    const oldBlock = "        {showImage && (\n          <>\n            <label className=\"field-label\" htmlFor=\"world-image\">\n              Арт\n            </label>\n            <input\n              id=\"world-image\"\n              className=\"app-input\"\n              value={imageUrl}\n              onChange={(event) => setImageUrl(event.target.value)}\n              placeholder=\"Пока ссылка; потом Storage\"\n            />\n          </>\n        )}"
    const newBlock = "        {showImage && (\n          <ImageUploadField\n            value={imageUrl}\n            onChange={setImageUrl}\n            folder=\"locations\"\n            label=\"Арт локации\"\n            hint=\"Выбери изображение из галереи телефона или камеры.\"\n          />\n        )}"
    s = replaceRequired(s, oldBlock, newBlock, "арт локации")
  }
  write("src/components/world/WorldEditor.tsx", s)
}

// Предметы.
{
  let s = read("src/components/characters/InventoryItemEditor.tsx")
  s = ensureImport(s, 'import ImageUploadField from "../common/ImageUploadField"', 'import type { FormEvent } from "react"')
  if (!s.includes('folder="items"')) {
    const oldBlock = "        <label className=\"field-label\">Арт предмета</label>\n        <input className=\"app-input\" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder=\"Ссылка на изображение\" />"
    const newBlock = "        <ImageUploadField\n          value={imageUrl}\n          onChange={setImageUrl}\n          folder=\"items\"\n          label=\"Арт предмета\"\n        />"
    s = replaceRequired(s, oldBlock, newBlock, "арт предмета")
  }
  write("src/components/characters/InventoryItemEditor.tsx", s)
}

// Профиль персонажа.
{
  let s = read("src/pages/CharacterProfile.tsx")
  s = ensureImport(s, 'import ImageUploadField from "../components/common/ImageUploadField"', 'import CharacterAvatar from "../components/characters/CharacterAvatar"')
  if (!s.includes('folder="character-avatars"')) {
    const oldBlock = "            <div className=\"character-editor-head\"><div><h3 className=\"sheet-title\">Арт персонажа</h3><p className=\"sheet-copy\">Игрок может менять только арт своего персонажа. Пока используем ссылку; загрузку файла подключим через Storage.</p></div><button className=\"sheet-close\" type=\"button\" onClick={() => setEditor(null)}>×</button></div>\n            <label className=\"field-label\">Ссылка на изображение</label>\n            <input className=\"app-input\" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder=\"https://...\" autoFocus />"
    const newBlock = "            <div className=\"character-editor-head\"><div><h3 className=\"sheet-title\">Арт персонажа</h3><p className=\"sheet-copy\">Выбери картинку прямо с телефона. После загрузки нажми «Сохранить арт».</p></div><button className=\"sheet-close\" type=\"button\" onClick={() => setEditor(null)}>×</button></div>\n            <ImageUploadField\n              value={avatarUrl}\n              onChange={setAvatarUrl}\n              folder=\"character-avatars\"\n              label=\"Изображение персонажа\"\n            />"
    s = replaceRequired(s, oldBlock, newBlock, "арт персонажа в профиле")
  }
  write("src/pages/CharacterProfile.tsx", s)
}

// Редактор персонажей Owner/GM.
{
  let s = read("src/pages/Characters.tsx")
  s = ensureImport(s, 'import ImageUploadField from "../components/common/ImageUploadField"', 'import CharacterAvatar from "../components/characters/CharacterAvatar"')
  if (!s.includes('folder="character-avatars"')) {
    const oldBlock = "            <label className=\"field-label\" htmlFor=\"character-avatar\">Аватар</label>\n            <input\n              id=\"character-avatar\"\n              className=\"app-input\"\n              value={avatarUrl}\n              onChange={(event) => setAvatarUrl(event.target.value)}\n              placeholder=\"Пока ссылка; потом загрузка файла\"\n            />"
    const newBlock = "            <ImageUploadField\n              value={avatarUrl}\n              onChange={setAvatarUrl}\n              folder=\"character-avatars\"\n              label=\"Арт персонажа\"\n            />"
    s = replaceRequired(s, oldBlock, newBlock, "арт в редакторе персонажа")
  }
  write("src/pages/Characters.tsx", s)
}

// Стили.
{
  let s = read("src/character-system.css")
  if (!s.includes("/* v10 media upload + real campaign gallery */")) s += cssAppend
  write("src/character-system.css", s)
}

console.log("\nГотово. v10 применён.")
console.log("Изменены/созданы файлы:")
for (const file of touched) console.log("- " + file)
console.log("\nДальше выполни: npm run build")
