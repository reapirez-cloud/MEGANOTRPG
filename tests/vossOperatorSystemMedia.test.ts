import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const edge = fs.readFileSync("supabase/functions/voss-agent/index.ts", "utf8")
const reads = fs.readFileSync("supabase/functions/voss-agent/read-tools.ts", "utf8")
const images = fs.readFileSync("supabase/functions/voss-agent/image-tools.ts", "utf8")
const artData = fs.readFileSync("src/ui-v1-isolated/useUiV1ArtData.ts", "utf8")
const migration = fs.readFileSync(
  "supabase/migrations/20260915190000_voss_operator_system_media.sql",
  "utf8",
)

test("Freddy is the manager app operator while player Voss stays in-world", () => {
  assert.match(edge, /В разговоре с игроком ты Рейнар Восс, а не оператор приложения/)
  assert.match(edge, /Ты Фредди, дворецкий-оператор MEGANOT/)
  assert.match(edge, /Код приложения, Git-ветки, CI, Vercel, миграции и исходники ты не изменяешь/)
  assert.doesNotMatch(edge, /VOSS_DEVELOPER_TOOLS/)
  assert.match(edge, /toolsAvailable: false/)
})

test("player and GM conversations never receive admin-only System Materials tools", () => {
  assert.match(
    edge,
    /grantedCapabilities\.has\("system\.admin"\) && authority === "admin"[\s\S]*VOSS_ADMIN_TOOLS[\s\S]*VOSS_OWNER_READ_TOOLS[\s\S]*VOSS_OWNER_MEDIA_TOOLS/,
  )
  assert.match(
    edge,
    /grantedCapabilities\.has\("media\.write"\)[\s\S]*authority === "admin"[\s\S]*VOSS_OWNER_MEDIA_TOOLS/,
  )
  assert.match(reads, /if \(!context\.isOwner\) return \{ error: "owner_required" \}/)
  assert.match(images, /if \(!ctx\.isOwner\) return \{ error: "owner_required" \}/)
  assert.match(edge, /client: authority === "admin" \? admin : userClient/)
  assert.match(edge, /Не сообщай даже косвенно содержание или существование скрытых GM\/admin-данных/)
})

test("System Materials uploads become permanent reusable media assets", () => {
  assert.match(migration, /add column if not exists asset_id uuid/)
  assert.match(migration, /register_system_media_v1/)
  assert.match(migration, /'manual-upload'/)
  assert.match(migration, /'system-library'/)
  assert.match(migration, /saved_at/)
  assert.match(migration, /expires_at/)
  assert.match(artData, /register_system_media_v1/)
  assert.match(artData, /delete_system_media_v1/)
})

test("owner can search, visually inspect and attach existing System Materials", () => {
  assert.match(reads, /name: "search_system_media"/)
  assert.match(reads, /name: "inspect_system_media"/)
  assert.match(reads, /__vision_asset/)
  assert.match(edge, /toolName === "inspect_system_media"/)
  assert.match(edge, /bytesToBase64\(bytes\)/)
  assert.match(images, /name: "attach_system_media"/)
  assert.match(images, /attach_system_media_v1/)
  assert.match(migration, /create or replace function public\.attach_system_media_v1/)
})

test("System Materials cannot be physically deleted while bound elsewhere", () => {
  assert.match(migration, /system_media_in_use/)
  assert.match(migration, /and not \([\s\S]*target_field = 'source'/)
  assert.match(artData, /Сначала отвяжи его от объектов/)
})
