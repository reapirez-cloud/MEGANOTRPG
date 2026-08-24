import { useMemo, useState } from "react"
import type { Dispatch, FormEvent, SetStateAction } from "react"

import { useAuth } from "../context/AuthContext"
import { useCharacters } from "../context/CharacterContext"
import { useCharacterSheet } from "../hooks/useCharacterSheet"
import CharacterAvatar from "../components/characters/CharacterAvatar"
import CharacterSheetEditor from "../components/characters/CharacterSheetEditor"
import InventoryItemEditor from "../components/characters/InventoryItemEditor"
import SpellEditor from "../components/characters/SpellEditor"
import FeatureEditor from "../components/characters/FeatureEditor"
import type {
  CharacterFeature,
  CharacterSheet,
  CharacterSpell,
  DiaryPost,
  InventoryItem,
} from "../types/characterSheet"

type Props = { characterId: string; onBack: () => void }
type Tab = "diary" | "inventory" | "sheet" | "spells"
type Editor =
  | { type: "avatar" }
  | { type: "sheet" }
  | { type: "inventory"; item: InventoryItem | null }
  | { type: "spell"; spell: CharacterSpell | null }
  | { type: "feature"; feature: CharacterFeature | null }
  | null

const abilities = [
  ["strength", "СИЛ", "Сила"],
  ["dexterity", "ЛОВ", "Ловкость"],
  ["constitution", "ТЕЛ", "Телосложение"],
  ["intelligence", "ИНТ", "Интеллект"],
  ["wisdom", "МДР", "Мудрость"],
  ["charisma", "ХАР", "Харизма"],
] as const

const skills = [
  ["acrobatics", "Акробатика", "dexterity"],
  ["animal_handling", "Уход за животными", "wisdom"],
  ["arcana", "Магия", "intelligence"],
  ["athletics", "Атлетика", "strength"],
  ["deception", "Обман", "charisma"],
  ["history", "История", "intelligence"],
  ["insight", "Проницательность", "wisdom"],
  ["intimidation", "Запугивание", "charisma"],
  ["investigation", "Анализ", "intelligence"],
  ["medicine", "Медицина", "wisdom"],
  ["nature", "Природа", "intelligence"],
  ["perception", "Восприятие", "wisdom"],
  ["performance", "Выступление", "charisma"],
  ["persuasion", "Убеждение", "charisma"],
  ["religion", "Религия", "intelligence"],
  ["sleight_of_hand", "Ловкость рук", "dexterity"],
  ["stealth", "Скрытность", "dexterity"],
  ["survival", "Выживание", "wisdom"],
] as const

const featureLabels: Record<CharacterFeature["kind"], string> = {
  feat: "Фит",
  class_feature: "Классовая особенность",
  racial_trait: "Расовая особенность",
  feature: "Особенность",
  other: "Другое",
}

function modifier(score: number) {
  return Math.floor((score - 10) / 2)
}

function signed(value: number) {
  return value >= 0 ? `+${value}` : String(value)
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export default function CharacterProfile({ characterId, onBack }: Props) {
  const { user } = useAuth()
  const {
    characters,
    members,
    canManage,
    refresh,
    updateOwnCharacterAvatar,
  } = useCharacters()
  const data = useCharacterSheet(characterId)

  const character = useMemo(
    () => characters.find((item) => item.id === characterId) ?? null,
    [characterId, characters],
  )

  const [tab, setTab] = useState<Tab>("diary")
  const [editor, setEditor] = useState<Editor>(null)
  const [avatarUrl, setAvatarUrl] = useState("")
  const [avatarError, setAvatarError] = useState("")
  const [avatarSaving, setAvatarSaving] = useState(false)
  const [diaryDraft, setDiaryDraft] = useState("")
  const [diaryError, setDiaryError] = useState("")
  const [expandedSpell, setExpandedSpell] = useState<string | null>(null)
  const [openComments, setOpenComments] = useState<string | null>(null)
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})

  if (!character) {
    return (
      <div className="screen">
        <header className="screen-header">
          <button className="icon-button" type="button" onClick={onBack}>←</button>
          <h1 className="screen-header__title">Персонаж</h1>
          <span />
        </header>
        <div className="center-state">Персонаж не найден или у тебя нет доступа.</div>
      </div>
    )
  }

  const currentCharacter = character
  const member = currentCharacter.assigned_user_id
    ? members.find((item) => item.user_id === currentCharacter.assigned_user_id)
    : null
  const active = member?.active_character_id === currentCharacter.id
  const fullName = member ? `${currentCharacter.name} (${member.display_name})` : currentCharacter.name
  const isAssignedPlayer = currentCharacter.assigned_user_id === user.id
  const canEditAvatar = canManage || isAssignedPlayer
  const canEditSpells = canManage || isAssignedPlayer
  const canWriteDiary = canManage || isAssignedPlayer
  const sheet = data.sheet
  const spellTabVisible = Boolean(sheet?.spellcasting_enabled || data.spells.length > 0 || canManage)

  async function saveAvatar(event: FormEvent) {
    event.preventDefault()
    setAvatarSaving(true)
    setAvatarError("")
    const result = await updateOwnCharacterAvatar(currentCharacter.id, avatarUrl)
    setAvatarSaving(false)
    if (!result.ok) {
      setAvatarError(result.error || "Не удалось сохранить арт.")
      return
    }
    await refresh()
    setEditor(null)
  }

  async function publishDiary(event: FormEvent) {
    event.preventDefault()
    if (!diaryDraft.trim()) return
    setDiaryError("")
    const result = await data.addDiaryPost(diaryDraft)
    if (!result.ok) {
      setDiaryError(result.error || "Не удалось опубликовать запись.")
      return
    }
    setDiaryDraft("")
  }

  async function addComment(postId: string) {
    const body = commentDrafts[postId]?.trim()
    if (!body) return
    const result = await data.addComment(postId, body)
    if (result.ok) {
      setCommentDrafts((current) => ({ ...current, [postId]: "" }))
    } else {
      setDiaryError(result.error || "Не удалось добавить комментарий.")
    }
  }

  function commentsFor(postId: string) {
    return data.comments.filter((comment) => comment.post_id === postId)
  }

  function authorName(userId: string) {
    return members.find((item) => item.user_id === userId)?.display_name || "Игрок"
  }

  return (
    <div className="screen character-profile-screen">
      <header className="screen-header">
        <button className="icon-button" type="button" onClick={onBack} aria-label="Назад">
          <svg viewBox="0 0 24 24" fill="none"><path d="m15 5-7 7 7 7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <h1 className="screen-header__title">{fullName}</h1>
        <span />
      </header>

      <div className="profile-scroll character-profile-scroll">
        <section className="character-sheet-hero surface">
          <div
            className="character-sheet-hero__art"
            style={currentCharacter.avatar_url ? { backgroundImage: `linear-gradient(180deg, transparent 30%, rgba(10,10,12,.94)), url(${currentCharacter.avatar_url})` } : undefined}
          >
            {!currentCharacter.avatar_url && <div className="character-sheet-hero__fallback">{currentCharacter.name.slice(0, 1).toUpperCase()}</div>}
            {canEditAvatar && (
              <button
                className="character-art-edit"
                type="button"
                onClick={() => {
                  setAvatarUrl(currentCharacter.avatar_url || "")
                  setAvatarError("")
                  setEditor({ type: "avatar" })
                }}
              >
                ✎ Арт
              </button>
            )}
          </div>

          <div className="character-sheet-hero__body">
            <div className="profile-name-row">
              <h2 className="profile-name">{currentCharacter.name}</h2>
              {active && <span className="active-badge">Активен</span>}
            </div>
            {member && <p className="profile-player-name">Игрок: {member.display_name}</p>}
            <p className="character-sheet-hero__class">{currentCharacter.character_class} · {currentCharacter.level} уровень</p>
            {currentCharacter.bio && <p className="character-sheet-hero__bio">{currentCharacter.bio}</p>}
          </div>
        </section>

        <nav className="profile-tabs character-sheet-tabs">
          <button className={`profile-tab ${tab === "diary" ? "profile-tab--active" : ""}`} type="button" onClick={() => setTab("diary")}>Дневник</button>
          <button className={`profile-tab ${tab === "inventory" ? "profile-tab--active" : ""}`} type="button" onClick={() => setTab("inventory")}>Инвентарь</button>
          <button className={`profile-tab ${tab === "sheet" ? "profile-tab--active" : ""}`} type="button" onClick={() => setTab("sheet")}>Лист</button>
          {spellTabVisible && <button className={`profile-tab ${tab === "spells" ? "profile-tab--active" : ""}`} type="button" onClick={() => setTab("spells")}>Заклинания</button>}
        </nav>

        {data.loading && <div className="center-state"><span className="status-spinner" /><span>Загружаем лист…</span></div>}
        {data.error && <div className="auth-error">{data.error}</div>}

        {!data.loading && tab === "diary" && (
          <DiaryTab
            characterName={fullName}
            avatar={currentCharacter}
            posts={data.posts}
            canWrite={canWriteDiary}
            canManage={canManage}
            currentUserId={user.id}
            draft={diaryDraft}
            setDraft={setDiaryDraft}
            publish={publishDiary}
            error={diaryError}
            commentsFor={commentsFor}
            openComments={openComments}
            setOpenComments={setOpenComments}
            commentDrafts={commentDrafts}
            setCommentDrafts={setCommentDrafts}
            addComment={addComment}
            authorName={authorName}
            deletePost={data.deleteDiaryPost}
            deleteComment={data.deleteComment}
          />
        )}

        {!data.loading && tab === "inventory" && (
          <section className="character-tab-section">
            <div className="section-head">
              <div><h3 className="section-title">Инвентарь</h3><p className="item-meta">Предметы, снаряжение и их арты</p></div>
              {canManage && <button className="section-link" type="button" onClick={() => setEditor({ type: "inventory", item: null })}>+ Предмет</button>}
            </div>

            <div className="inventory-list">
              {data.inventory.length === 0 && <div className="character-empty surface">Инвентарь пока пуст.</div>}
              {data.inventory.map((item) => (
                <article className="inventory-card surface" key={item.id}>
                  <div className="inventory-card__art">
                    {item.image_url ? <img src={item.image_url} alt="" /> : <span>◆</span>}
                  </div>
                  <div className="inventory-card__body">
                    <div className="inventory-card__top"><strong>{item.name}</strong><span>×{item.quantity}</span></div>
                    <div className="inventory-card__meta">
                      {item.equipped && <em>Экипировано</em>}
                      {item.weight != null && <span>{item.weight} ф.</span>}
                    </div>
                    {item.description && <p>{item.description}</p>}
                  </div>
                  {canManage && <button className="card-edit-icon" type="button" onClick={() => setEditor({ type: "inventory", item })}>✎</button>}
                </article>
              ))}
            </div>
          </section>
        )}

        {!data.loading && tab === "sheet" && sheet && (
          <SheetTab
            sheet={sheet}
            features={data.features}
            canManage={canManage}
            onEditSheet={() => setEditor({ type: "sheet" })}
            onAddFeature={() => setEditor({ type: "feature", feature: null })}
            onEditFeature={(feature) => setEditor({ type: "feature", feature })}
          />
        )}

        {!data.loading && tab === "spells" && (
          <section className="character-tab-section">
            <div className="section-head">
              <div><h3 className="section-title">Заклинания</h3><p className="item-meta">{sheet?.spellcasting_enabled ? "Список может менять сам игрок" : "Заклинания отключены в листе"}</p></div>
              {canEditSpells && sheet?.spellcasting_enabled && <button className="section-link" type="button" onClick={() => setEditor({ type: "spell", spell: null })}>+ Заклинание</button>}
            </div>

            {sheet?.spellcasting_enabled && (
              <div className="spellcasting-summary surface">
                <div><span>Характеристика</span><strong>{sheet.spellcasting_ability || "—"}</strong></div>
                <div><span>СЛ</span><strong>{sheet.spell_save_dc ?? "—"}</strong></div>
                <div><span>Атака</span><strong>{sheet.spell_attack_bonus == null ? "—" : signed(sheet.spell_attack_bonus)}</strong></div>
              </div>
            )}

            {!sheet?.spellcasting_enabled && !canManage && <div className="character-empty surface">Этот персонаж не использует заклинания.</div>}

            {Array.from(new Set(data.spells.map((spell) => spell.spell_level))).sort((a, b) => a - b).map((level) => (
              <div className="spell-level-block" key={level}>
                <h4>{level === 0 ? "Заговоры" : `${level} уровень`}</h4>
                {data.spells.filter((spell) => spell.spell_level === level).map((spell) => (
                  <article className="spell-card surface" key={spell.id}>
                    <button className="spell-card__main" type="button" onClick={() => setExpandedSpell(expandedSpell === spell.id ? null : spell.id)}>
                      <div className="spell-card__rune">{level === 0 ? "∞" : level}</div>
                      <div className="spell-card__copy">
                        <div><strong>{spell.name}</strong>{spell.prepared && <em>Подготовлено</em>}</div>
                        <small>{[spell.school, spell.casting_time, spell.spell_range].filter(Boolean).join(" · ") || "Без параметров"}</small>
                      </div>
                      <span>{expandedSpell === spell.id ? "⌃" : "⌄"}</span>
                    </button>
                    {expandedSpell === spell.id && (
                      <div className="spell-card__details">
                        <div className="spell-tag-row">{spell.concentration && <span>Концентрация</span>}{spell.ritual && <span>Ритуал</span>}{spell.components && <span>{spell.components}</span>}{spell.duration && <span>{spell.duration}</span>}</div>
                        {spell.description && <p>{spell.description}</p>}
                        {spell.source && <small>Источник: {spell.source}</small>}
                        {canEditSpells && <button className="inline-edit-button" type="button" onClick={() => setEditor({ type: "spell", spell })}>✎ Изменить</button>}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ))}

            {data.spells.length === 0 && sheet?.spellcasting_enabled && <div className="character-empty surface">Список заклинаний пока пуст.</div>}
          </section>
        )}
      </div>

      {editor?.type === "avatar" && (
        <div className="sheet-backdrop" onMouseDown={() => setEditor(null)}>
          <form className="bottom-sheet compact-editor-sheet" onSubmit={saveAvatar} onMouseDown={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="character-editor-head"><div><h3 className="sheet-title">Арт персонажа</h3><p className="sheet-copy">Игрок может менять только арт своего персонажа. Пока используем ссылку; загрузку файла подключим через Storage.</p></div><button className="sheet-close" type="button" onClick={() => setEditor(null)}>×</button></div>
            <label className="field-label">Ссылка на изображение</label>
            <input className="app-input" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://..." autoFocus />
            {avatarError && <div className="auth-error">{avatarError}</div>}
            <button className="sheet-save" type="submit" disabled={avatarSaving}>{avatarSaving ? "Сохраняем…" : "Сохранить арт"}</button>
          </form>
        </div>
      )}

      {editor?.type === "sheet" && sheet && <CharacterSheetEditor sheet={sheet} onClose={() => setEditor(null)} onSave={data.updateSheet} />}
      {editor?.type === "inventory" && (
        <InventoryItemEditor
          item={editor.item}
          onClose={() => setEditor(null)}
          onSave={(input) => editor.item ? data.updateInventoryItem(editor.item.id, input) : data.addInventoryItem(input)}
          onDelete={editor.item ? () => data.deleteInventoryItem(editor.item!.id) : undefined}
        />
      )}
      {editor?.type === "spell" && (
        <SpellEditor
          spell={editor.spell}
          onClose={() => setEditor(null)}
          onSave={(input) => editor.spell ? data.updateSpell(editor.spell.id, input) : data.addSpell(input)}
          onDelete={editor.spell ? () => data.deleteSpell(editor.spell!.id) : undefined}
        />
      )}
      {editor?.type === "feature" && (
        <FeatureEditor
          feature={editor.feature}
          onClose={() => setEditor(null)}
          onSave={(input) => editor.feature ? data.updateFeature(editor.feature.id, input) : data.addFeature(input)}
          onDelete={editor.feature ? () => data.deleteFeature(editor.feature!.id) : undefined}
        />
      )}
    </div>
  )
}

function SheetTab({
  sheet,
  features,
  canManage,
  onEditSheet,
  onAddFeature,
  onEditFeature,
}: {
  sheet: CharacterSheet
  features: CharacterFeature[]
  canManage: boolean
  onEditSheet: () => void
  onAddFeature: () => void
  onEditFeature: (feature: CharacterFeature) => void
}) {
  const saveSet = new Set(sheet.saving_throw_proficiencies || [])

  return (
    <section className="character-tab-section">
      <div className="section-head">
        <div><h3 className="section-title">Лист персонажа</h3><p className="item-meta">Полный компактный D&D-лист</p></div>
        {canManage && <button className="section-link" type="button" onClick={onEditSheet}>✎ Лист</button>}
      </div>

      <div className="sheet-identity surface">
        <div><span>Раса / вид</span><strong>{sheet.race || "—"}</strong></div>
        <div><span>Предыстория</span><strong>{sheet.background || "—"}</strong></div>
        <div><span>Мировоззрение</span><strong>{sheet.alignment || "—"}</strong></div>
        <div><span>Опыт</span><strong>{sheet.experience}</strong></div>
      </div>

      <div className="combat-stat-grid">
        <div className="combat-stat surface"><span>КД</span><strong>{sheet.armor_class}</strong></div>
        <div className="combat-stat surface"><span>HP</span><strong>{sheet.current_hp}<small>/{sheet.max_hp}</small></strong>{sheet.temp_hp > 0 && <em>+{sheet.temp_hp} врем.</em>}</div>
        <div className="combat-stat surface"><span>Скорость</span><strong>{sheet.speed}</strong><small>фт.</small></div>
        <div className="combat-stat surface"><span>Мастерство</span><strong>{signed(sheet.proficiency_bonus)}</strong></div>
      </div>

      <div className="ability-grid">
        {abilities.map(([key, short, label]) => {
          const score = sheet[key]
          return <div className="ability-card surface" key={key}><span>{short}</span><strong>{signed(modifier(score))}</strong><small>{score} · {label}</small></div>
        })}
      </div>

      <div className="sheet-two-column">
        <article className="sheet-panel surface">
          <h4>Спасброски</h4>
          {abilities.map(([key, , label]) => {
            const bonus = modifier(sheet[key]) + (saveSet.has(key) ? sheet.proficiency_bonus : 0)
            return <div className="sheet-line" key={key}><span className={saveSet.has(key) ? "sheet-dot sheet-dot--active" : "sheet-dot"} /> <span>{label}</span><strong>{signed(bonus)}</strong></div>
          })}
        </article>

        <article className="sheet-panel surface">
          <h4>Быстро</h4>
          <div className="sheet-line"><span>Инициатива</span><strong>{signed(sheet.initiative_bonus)}</strong></div>
          <div className="sheet-line"><span>Пасс. восприятие</span><strong>{sheet.passive_perception}</strong></div>
          <div className="sheet-line"><span>Кости хитов</span><strong>{sheet.hit_dice || "—"}</strong></div>
          <div className="sheet-line"><span>Смерть</span><strong>{sheet.death_save_successes}✓ · {sheet.death_save_failures}✕</strong></div>
        </article>
      </div>

      <article className="sheet-panel surface">
        <h4>Навыки</h4>
        <div className="skills-grid">
          {skills.map(([key, label, ability]) => {
            const rank = sheet.skill_proficiencies?.[key] || 0
            const bonus = modifier(sheet[ability]) + sheet.proficiency_bonus * rank
            return <div className="skill-row" key={key}><span className={rank > 0 ? `skill-rank skill-rank--${rank}` : "skill-rank"}>{rank === 2 ? "◆" : rank === 1 ? "●" : "○"}</span><span>{label}</span><strong>{signed(bonus)}</strong></div>
          })}
        </div>
      </article>

      {sheet.spellcasting_enabled && (
        <article className="sheet-panel surface">
          <h4>Магия</h4>
          <div className="magic-stat-row"><div><span>Характеристика</span><strong>{sheet.spellcasting_ability || "—"}</strong></div><div><span>СЛ</span><strong>{sheet.spell_save_dc ?? "—"}</strong></div><div><span>Атака</span><strong>{sheet.spell_attack_bonus == null ? "—" : signed(sheet.spell_attack_bonus)}</strong></div></div>
        </article>
      )}

      <div className="sheet-text-grid">
        <TextPanel title="Владения" text={sheet.proficiencies} />
        <TextPanel title="Языки" text={sheet.languages} />
        <TextPanel title="Чувства" text={sheet.senses} />
        <TextPanel title="Черты личности" text={sheet.personality_traits} />
        <TextPanel title="Идеалы" text={sheet.ideals} />
        <TextPanel title="Привязанности" text={sheet.bonds} />
        <TextPanel title="Слабости" text={sheet.flaws} />
        <TextPanel title="Предыстория" text={sheet.backstory} wide />
        <TextPanel title="Заметки" text={sheet.notes} wide />
      </div>

      <div className="section-head feature-head">
        <div><h3 className="section-title">Фиты и особенности</h3><p className="item-meta">Классовые, расовые и прочие особенности</p></div>
        {canManage && <button className="section-link" type="button" onClick={onAddFeature}>+ Добавить</button>}
      </div>

      <div className="feature-list">
        {features.length === 0 && <div className="character-empty surface">Особенности пока не заполнены.</div>}
        {features.map((feature) => (
          <article className="feature-card surface" key={feature.id}>
            <div className="feature-card__top"><div><span>{featureLabels[feature.kind]}</span><strong>{feature.name}</strong></div>{canManage && <button className="card-edit-icon" type="button" onClick={() => onEditFeature(feature)}>✎</button>}</div>
            {feature.description && <p>{feature.description}</p>}
          </article>
        ))}
      </div>
    </section>
  )
}

function TextPanel({ title, text, wide = false }: { title: string; text: string; wide?: boolean }) {
  return <article className={`sheet-text-panel surface ${wide ? "sheet-text-panel--wide" : ""}`}><h4>{title}</h4><p>{text || "—"}</p></article>
}

function DiaryTab({
  characterName,
  avatar,
  posts,
  canWrite,
  canManage,
  currentUserId,
  draft,
  setDraft,
  publish,
  error,
  commentsFor,
  openComments,
  setOpenComments,
  commentDrafts,
  setCommentDrafts,
  addComment,
  authorName,
  deletePost,
  deleteComment,
}: {
  characterName: string
  avatar: { name: string; avatar_url: string | null }
  posts: DiaryPost[]
  canWrite: boolean
  canManage: boolean
  currentUserId: string
  draft: string
  setDraft: (value: string) => void
  publish: (event: FormEvent) => Promise<void>
  error: string
  commentsFor: (postId: string) => ReturnType<typeof useCharacterSheet>["comments"]
  openComments: string | null
  setOpenComments: (value: string | null) => void
  commentDrafts: Record<string, string>
  setCommentDrafts: Dispatch<SetStateAction<Record<string, string>>>
  addComment: (postId: string) => Promise<void>
  authorName: (userId: string) => string
  deletePost: (postId: string) => Promise<{ ok: boolean; error?: string }>
  deleteComment: (commentId: string) => Promise<{ ok: boolean; error?: string }>
}) {
  return (
    <section className="character-tab-section diary-real-feed">
      {canWrite && (
        <form className="diary-composer surface" onSubmit={(event) => void publish(event)}>
          <CharacterAvatar character={avatar} size="small" />
          <div><textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Запись в дневник от лица персонажа…" maxLength={5000} /><button type="submit" disabled={!draft.trim()}>Опубликовать</button></div>
        </form>
      )}

      {error && <div className="auth-error">{error}</div>}
      {posts.length === 0 && <div className="character-empty surface">В дневнике пока нет записей.</div>}

      {posts.map((post) => {
        const postComments = commentsFor(post.id)
        const commentsOpen = openComments === post.id
        const canDeletePost = canManage || post.created_by === currentUserId

        return (
          <article className="diary-post surface diary-post--real" key={post.id}>
            <div className="diary-post__top">
              <CharacterAvatar character={avatar} size="small" />
              <div className="diary-post__identity"><div className="item-title">{characterName}</div><div className="item-meta">{formatTime(post.created_at)}</div></div>
              {canDeletePost && <button className="diary-delete" type="button" onClick={() => void deletePost(post.id)}>Удалить</button>}
            </div>
            <p className="diary-post__body">{post.body}</p>
            <button className="diary-comments-toggle" type="button" onClick={() => setOpenComments(commentsOpen ? null : post.id)}>◯ {postComments.length} {postComments.length === 1 ? "комментарий" : "комментариев"}</button>

            {commentsOpen && (
              <div className="diary-comments">
                {postComments.map((comment) => (
                  <div className="diary-comment" key={comment.id}>
                    <div><strong>{authorName(comment.created_by)}</strong><span>{formatTime(comment.created_at)}</span></div>
                    <p>{comment.body}</p>
                    {(canManage || comment.created_by === currentUserId) && <button type="button" onClick={() => void deleteComment(comment.id)}>Удалить</button>}
                  </div>
                ))}
                <div className="diary-comment-composer">
                  <input value={commentDrafts[post.id] || ""} onChange={(e) => setCommentDrafts((current) => ({ ...current, [post.id]: e.target.value }))} placeholder="Комментарий…" maxLength={1500} />
                  <button type="button" onClick={() => void addComment(post.id)} disabled={!commentDrafts[post.id]?.trim()}>↑</button>
                </div>
              </div>
            )}
          </article>
        )
      })}
    </section>
  )
}
