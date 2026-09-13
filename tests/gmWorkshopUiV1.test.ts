import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const app = fs.readFileSync("src/ui-v1-isolated/UiV1App.tsx", "utf8")
const entry = fs.readFileSync("src/ui-v1-isolated/main.tsx", "utf8")
const shell = fs.readFileSync("src/ui-v1-isolated/GMWorkshop.tsx", "utf8")
const main = fs.readFileSync("src/ui-v1-isolated/GMWorkshopMain.tsx", "utf8")
const draft = fs.readFileSync("src/ui-v1-isolated/GMWorkshopDraft.tsx", "utf8")
const party = fs.readFileSync("src/ui-v1-isolated/GMWorkshopParty.tsx", "utf8")
const characters = fs.readFileSync("src/ui-v1-isolated/GMWorkshopCharacters.tsx", "utf8")
const library = fs.readFileSync("src/ui-v1-isolated/GMWorkshopLibrary.tsx", "utf8")
const materials = fs.readFileSync("src/ui-v1-isolated/GMWorkshopMaterials.tsx", "utf8")
const data = fs.readFileSync("src/ui-v1-isolated/useGMWorkshopData.ts", "utf8")
const actions = fs.readFileSync("src/ui-v1-isolated/gmWorkshopSnakeActions.ts", "utf8")
const styles = fs.readFileSync("src/ui-v1-isolated/gm-workshop.css", "utf8")
const workspaceData = fs.readFileSync("src/ui-v1-isolated/useWorkspaceData.ts", "utf8")
const sectionData = fs.readFileSync("src/ui-v1-isolated/useUiV1SectionData.ts", "utf8")
const migration = fs.readFileSync(
  "supabase/migrations/20260913150723_gm_workshop_character_drafts_v1.sql",
  "utf8",
)

test("UI 1.0 management route is the real GM Workshop and uses destination panels instead of legacy tabs", () => {
  assert.match(app, /<GMWorkshop/)
  assert.match(app, /const workshopSections: WorkshopSection\[\] = \["draft", "party", "characters", "library", "materials"\]/)
  assert.match(app, /path\.startsWith\("workspace\/manage\/"\)/)
  assert.match(app, /"workspace\/manage\/" \+ section/)
  assert.match(entry, /\.\/gm-workshop\.css/)
  assert.match(shell, /GMWorkshopMain/)
  assert.match(main, /title="Черновик"/)
  assert.match(main, /title="Партия"/)
  assert.match(main, /title="Персонажи"/)
  assert.match(main, /title="Библиотека"/)
  assert.match(main, /title="Материалы"/)
  assert.ok(main.indexOf('title="Черновик"') < main.indexOf('title="Партия"'))
  assert.doesNotMatch(
    main + draft + party + characters + library + materials,
    /role="tab"|gm-primary-nav|gm-subrail/,
  )
})

test("GM draft is a canonical hidden lifecycle, not the old private-character toggle", () => {
  assert.match(migration, /publication_state text/)
  assert.match(migration, /check \(publication_state in \('draft','campaign'\)\)/)
  assert.match(migration, /c\.publication_state = 'draft'[\s\S]*private\.can_manage_campaign/)
  assert.match(migration, /set_character_publication_state_v1/)
  assert.match(migration, /assigned_user_id = null/)
  assert.match(migration, /visibility_mode = 'private'/)
  assert.match(data, /publication_state: "draft"/)
  assert.match(data, /oracle\.characters\.setPublicationState/)
  assert.match(workspaceData, /\.eq\("publication_state", "campaign"\)/)
  assert.match(sectionData, /\.eq\("publication_state", "campaign"\)/)
  assert.doesNotMatch(draft, /Только я/)
})

test("PC assignment and active identity remain separate commands", () => {
  assert.match(data, /assignCharacter/)
  assert.match(data, /oracle\.characters\.update/)
  assert.match(data, /setActiveCharacter/)
  assert.match(data, /oracle\.characters\.setActive/)
  assert.match(party, /Персонаж назначен\. Активность выбирается отдельно/)
  assert.match(party, /Сделать активным/)
  assert.match(migration, /publication_state = 'campaign'/)
  assert.match(migration, /Dead character cannot be active/)
})

test("Party exposes every published PC and reuses Snake for assignment, unlink and active state", () => {
  assert.match(party, /Все персонажи игроков/)
  assert.match(party, /publishedPc\.map/)
  assert.match(party, /SnakeTrigger/)
  assert.match(party, /createWorkshopCharacterActions/)
  assert.match(party, /createWorkshopPcUnassignAction/)
  assert.match(party, />\s*Отвязать\s*</)
  assert.match(actions, /id: "unassign"/)
  assert.match(actions, /id: "active"/)
  assert.match(actions, /operations\.setActiveCharacter/)
  assert.match(actions, /assignedMember\.userId/)
})

test("published NPC visibility supports immediate visibility or encounter discovery", () => {
  assert.match(actions, /label: "При встрече"/)
  assert.match(actions, /label: "Видно сразу"/)
  assert.match(data, /setNpcVisibility/)
  assert.match(data, /oracle\.characters\.setVisibility/)
  assert.match(migration, /character_npc_discoveries/)
  assert.match(migration, /visibility_mode = 'discover'/)
  assert.match(migration, /visibility_mode = 'always'/)
})

test("character catalog is one searchable PC plus NPC workspace with filters and recent destinations", () => {
  assert.match(characters, /Найти персонажа, класс, игрока/)
  assert.match(characters, /Все персонажи/)
  assert.match(characters, /Персонажи игроков/)
  assert.match(characters, /Персонажи мира/)
  assert.match(characters, /Свободные/)
  assert.match(characters, /Мёртвые/)
  assert.match(characters, /Недавние/)
  assert.match(characters, /campaignCharacters/)
  assert.doesNotMatch(characters, /characterKind|setCharacterKind/)
})

test("library authors reusable definitions and issues runtime copies through owner engines", () => {
  assert.match(data, /oracle\.definitions\.create/)
  assert.match(data, /oracle\.definitions\.revise/)
  assert.match(data, /oracle\.definitions\.setStatus/)
  assert.match(data, /oracle\.inventory\.create/)
  assert.match(data, /oracle\.characters\.createSpell/)
  assert.match(data, /oracle\.characters\.createFeature/)
  assert.match(data, /linked_definition_ids/)
  assert.match(actions, /Выдать персонажу/)
  assert.match(actions, /Привязать к предмету/)
  assert.match(library, /Найти в библиотеке/)
})

test("private GM materials preserve notes folders uploads and Storage cleanup", () => {
  assert.match(data, /uploadCampaignFile/)
  assert.match(data, /deleteCampaignMediaObject/)
  assert.match(data, /createNote/)
  assert.match(data, /updateNote/)
  assert.match(data, /createFolder/)
  assert.match(data, /renameFolder/)
  assert.match(materials, /\+ Заметка/)
  assert.match(materials, /\+ Папка/)
  assert.match(materials, /\+ Файл/)
  assert.match(materials, /type="file"/)
  assert.match(materials, /window\.open\(material\.fileUrl/)
  assert.match(styles, /\.u1-gm-material-upload/)
})
