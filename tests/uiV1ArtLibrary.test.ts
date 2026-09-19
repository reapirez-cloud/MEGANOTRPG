import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const app = fs.readFileSync("src/ui-v1-isolated/UiV1App.tsx", "utf8")
const art = fs.readFileSync("src/ui-v1-isolated/ArtSection.tsx", "utf8")
const data = fs.readFileSync("src/ui-v1-isolated/useUiV1ArtData.ts", "utf8")
const scope = fs.readFileSync("src/ui-v1-isolated/useUiV1SectionData.ts", "utf8")
const migration = fs.readFileSync(
  "supabase/migrations/20260915183000_ui_v1_art_library.sql",
  "utf8",
)

const integrityMigration = fs.readFileSync(
  "supabase/migrations/20260919133000_art_library_integrity_v1.sql",
  "utf8",
)

test("UI 1.0 art hub uses workshop-style text destinations without random preview art", () => {
  assert.match(app, /<ArtSection subsection=\{route\.subsection\}/)
  assert.match(art, /WorkshopPanel/)
  assert.match(art, /title: "Комиксы"/)
  assert.match(art, /title: "Мир"/)
  assert.match(art, /title: "Персонажи мира"/)
  assert.match(art, /title: "Локации"/)
  assert.match(art, /title: "Персонажи игроков"/)
  assert.doesNotMatch(art, /WorkshopPanel[\s\S]{0,260}<CampaignImage/)
})

test("system materials and generations are owner-only in UI and database", () => {
  assert.match(scope, /isOwner: boolean/)
  assert.match(art, /title: "Системные материалы"[\s\S]*ownerOnly: true/)
  assert.match(art, /title: "Генерации"[\s\S]*ownerOnly: true/)
  assert.match(migration, /private\.is_campaign_owner/)
  assert.match(migration, /collection = 'system'/)
  assert.match(migration, /list_campaign_generated_media_admin_v1/)
  assert.match(migration, /delete_generated_media_admin_v1/)
})

test("generated media can be hard-deleted immediately but attached media is protected", () => {
  assert.match(data, /delete_generated_media_admin_v1/)
  assert.match(data, /storage\.from\(bucket\)\.remove/)
  assert.match(migration, /attached_media_cannot_be_deleted/)
  assert.match(art, /Удалить сразу/)
  assert.match(art, /Сначала отвяжи изображение от контента/)
})

test("art cards reuse Snake for management actions", () => {
  assert.match(art, /SnakeTrigger/)
  assert.match(art, /entity=\{\{ type: "campaign-art"/)
  assert.match(art, /entity=\{\{ type: "generated-media"/)
  assert.match(art, /kind: "confirm"/)
})


test("generation admin RPC exposes only real generated assets and rejects manual media deletion", () => {
  assert.match(integrityMigration, /a\.source_job_id is not null/)
  assert.match(integrityMigration, /a\.provider_key <> 'manual-upload'/)
  assert.match(integrityMigration, /generated_media_required/)
  assert.match(integrityMigration, /model_key = 'meganot-original-class-icon'/)
  assert.match(integrityMigration, /collection,\s*asset_id[\s\S]*'system'/)
})

test("art library supports Snake multiselect and one-pass batch deletion", () => {
  assert.match(art, /selectedIds/)
  assert.match(art, /Добавить к выделению/)
  assert.match(art, /Удалить выбранные/)
  assert.match(art, /data-selected/)
  assert.match(data, /deleteArts/)
  assert.match(data, /deleteGeneratedMany/)
})
