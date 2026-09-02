import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const profile = fs.readFileSync("src/pages/CharacterProfileV2.tsx", "utf8")
const detail = fs.readFileSync("src/components/characters/CharacterDetailSheet.tsx", "utf8")
const styles = fs.readFileSync("src/components/characters/CharacterSocial.css", "utf8")
const sheetHook = fs.readFileSync("src/hooks/useCharacterSheet.ts", "utf8")

test("stage 6 social presentation is loaded by the shared character detail layer", () => {
  assert.match(detail, /import "\.\/CharacterSocial\.css"/)
  assert.match(styles, /Character Profile v5 — Stage 6 social\/media composition/)
})

test("Diary is recomposed as an editorial chronology with one authored composer", () => {
  assert.match(profile, /className="character-tab-section v2-diary"/)
  assert.match(profile, /className="v2-diary-compose surface"/)
  assert.match(profile, /className="v2-diary-list"/)
  assert.match(styles, /\.v2-diary-list::before/)
  assert.match(styles, /\.v2-diary-post::before/)
  assert.match(styles, /\.v2-diary-post > p/)
  assert.match(styles, /\.v2-comments \{/)
  assert.match(styles, /\.v2-comment-compose \{/)
})

test("Diary keeps long press for actions while comments remain an explicit interaction", () => {
  assert.match(profile, /bindDiaryLongPress\(\{ type: "post", item: post \}\)/)
  assert.match(profile, /bindDiaryLongPress\(\{ type: "comment", item: comment \}\)/)
  assert.match(profile, /className="v2-comments-toggle"/)
  assert.match(profile, /diaryMenu && <ContextActionSheet/)
})

test("Gallery becomes a media-first adaptive grid and keeps shared Detail plus long-press actions", () => {
  assert.match(profile, /className="character-art-grid"/)
  assert.match(profile, /onClick=\{\(\) => setSelectedArt\(art\)\}/)
  assert.match(profile, /bindArtLongPress\(\{ item: art \}\)/)
  assert.match(profile, /selectedArt && <CharacterDetailSheet/)
  assert.match(profile, /artMenu && <ContextActionSheet/)
  assert.match(styles, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/)
  assert.match(styles, /\.character-art-grid > button:first-child[\s\S]*?grid-column:\s*span 2/)
  assert.match(styles, /content:\s*attr\(aria-label\)/)
  assert.match(styles, /@media \(max-width: 560px\)[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/)
})

test("Diary and Gallery reuse the shared empty/error language instead of local placeholders", () => {
  assert.match(profile, /Дневник не обновился/)
  assert.match(profile, /В дневнике пока пусто/)
  assert.match(profile, /Галерея не обновилась/)
  assert.match(profile, /Галерея пуста/)
  assert.ok((profile.match(/<CharacterSectionState/g) || []).length >= 7)
})

test("stage 6 changes presentation only and leaves social/media persistence in the existing sheet adapter", () => {
  assert.doesNotMatch(styles, /supabase|character-engine|GENA|Oracle|Cheburashka|Shapoklyak|resource_states/i)
  assert.doesNotMatch(detail, /supabase|character-engine|GENA|Oracle|resource_states/i)
  assert.match(sheetHook, /Diary and gallery are social\/media records, not canonical game mechanics/)
  assert.match(sheetHook, /const addDiaryPost = useCallback/)
  assert.match(sheetHook, /const addArt = useCallback/)
  assert.match(profile, /data\.addDiaryPost/)
  assert.match(profile, /data\.addArt/)
})
