import { useMemo, useState } from "react"
import type { Dispatch, FormEvent, SetStateAction } from "react"

import { useAuth } from "../context/AuthContext"
import { useCharacters } from "../context/CharacterContext"
import { useCharacterSheet } from "../hooks/useCharacterSheet"
import { useCampaignMedia } from "../hooks/useCampaignMedia"
import CharacterAvatar from "../components/characters/CharacterAvatar"
import ImageUploadField from "../components/common/ImageUploadField"
import CharacterSheetEditor from "../components/characters/CharacterSheetEditor"
import CharacterResourcesEditor from "../components/characters/CharacterResourcesEditor"
import InventoryItemEditor from "../components/characters/InventoryItemEditor"
import SpellEditor from "../components/characters/SpellEditor"
import FeatureEditor from "../components/characters/FeatureEditor"
import CharacterInventory from "../components/characters/CharacterInventory"
import CampaignImage from "../components/common/CampaignImage"
import ContextActionSheet, {
  type ContextAction,
} from "../components/common/ContextActionSheet"
import { uploadCampaignImage } from "../lib/mediaUpload"
import { useLongPressItem } from "../hooks/useLongPressItem"
import type {
  CharacterFeature,
  CharacterArt,
  CharacterSheet,
  CharacterSpell,
  CharacterSpellOption,
  DiaryComment,
  DiaryPost,
  InventoryItem,
} from "../types/characterSheet"

type Props = { characterId: string; onBack: () => void; embedded?: boolean }
type Tab = "diary" | "arts" | "inventory" | "equipment" | "sheet" | "spells"
type Editor =
  | { type: "avatar" }
  | { type: "sheet" }
  | { type: "resources" }
  | { type: "inventory"; item: InventoryItem | null }
  | { type: "spell"; spell: CharacterSpell | null }
  | { type: "spell-option"; option: CharacterSpellOption | null }
  | { type: "feature"; feature: CharacterFeature | null }
  | { type: "art"; art: CharacterArt }
  | null

type ProfileMenu =
  | { type: "art"; item: CharacterArt }
  | { type: "spell"; item: CharacterSpell }
  | { type: "spell-option"; item: CharacterSpellOption }

type DiaryMenu =
  | { type: "post"; item: DiaryPost }
  | { type: "comment"; item: DiaryComment }

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

export default function CharacterProfile({ characterId, onBack, embedded = false }: Props) {
  const { user } = useAuth()
  const {
    characters,
    members,
    campaignId,
    canManage,
    refresh,
    updateOwnCharacterAvatar,
  } = useCharacters()
  const data = useCharacterSheet(characterId, campaignId)

  const character = useMemo(
    () => characters.find((item) => item.id === characterId) ?? null,
    [characterId, characters],
  )
  const heroImageUrl = useCampaignMedia(character?.avatar_url)

  const [tab, setTab] = useState<Tab>("diary")
  const [editor, setEditor] = useState<Editor>(null)
  const [avatarUrl, setAvatarUrl] = useState("")
  const [avatarError, setAvatarError] = useState("")
  const [avatarSaving, setAvatarSaving] = useState(false)
  const [diaryDraft, setDiaryDraft] = useState("")
  const [diaryMediaFile, setDiaryMediaFile] = useState<File | null>(null)
  const [diaryPublishing, setDiaryPublishing] = useState(false)
  const [diaryError, setDiaryError] = useState("")
  const [expandedSpell, setExpandedSpell] = useState<string | null>(null)
  const [spellActionId, setSpellActionId] = useState<string | null>(null)
  const [spellError, setSpellError] = useState("")
  const [openComments, setOpenComments] = useState<string | null>(null)
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [artUploading, setArtUploading] = useState(false)
  const [artError, setArtError] = useState("")
  const [selectedArt, setSelectedArt] = useState<CharacterArt | null>(null)
  const [artTitle, setArtTitle] = useState("")
  const [artCaption, setArtCaption] = useState("")
  const [artSaving, setArtSaving] = useState(false)
  const [profileMenu, setProfileMenu] = useState<ProfileMenu | null>(null)
  const bindProfileLongPress = useLongPressItem<ProfileMenu>((target) => {
    setProfileMenu(target)
  })

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
  const canEditSheet = canManage || isAssignedPlayer
  const canChooseSpells = canManage || isAssignedPlayer
  const canUseInventory = canManage || isAssignedPlayer
  const canWriteDiary = canManage || isAssignedPlayer
  const sheet = data.sheet
  const learnedSpellNames = new Set(
    data.spells.map((spell) => spell.name.trim().toLocaleLowerCase("ru-RU")),
  )
  const availableSpellOptions = data.spellOptions.filter(
    (option) => !learnedSpellNames.has(option.name.trim().toLocaleLowerCase("ru-RU")),
  )
  const visibleSpellOptions = canManage ? data.spellOptions : availableSpellOptions
  const spellTabVisible = Boolean(
    sheet?.spellcasting_enabled || data.spells.length > 0 || data.spellOptions.length > 0 || canManage,
  )

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
    if (!diaryDraft.trim() && !diaryMediaFile) return
    setDiaryError("")
    setDiaryPublishing(true)
    let mediaUrl: string | null = null
    if (diaryMediaFile) {
      const upload = await uploadCampaignImage(
        diaryMediaFile,
        "character-diary",
        campaignId,
      )
      if (!upload.ok) {
        setDiaryPublishing(false)
        setDiaryError(upload.error)
        return
      }
      mediaUrl = upload.url
    }
    const result = await data.addDiaryPost(diaryDraft, mediaUrl)
    setDiaryPublishing(false)
    if (!result.ok) {
      setDiaryError(result.error || "Не удалось опубликовать запись.")
      return
    }
    setDiaryDraft("")
    setDiaryMediaFile(null)
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

  async function addCharacterArt(file: File | null) {
    if (!file) return
    setArtUploading(true)
    setArtError("")
    const upload = await uploadCampaignImage(file, "character-art", campaignId)
    if (!upload.ok) {
      setArtUploading(false)
      setArtError(upload.error)
      return
    }
    const title = file.name.replace(/\.[^.]+$/, "").slice(0, 120) || currentCharacter.name
    const result = await data.addArt(title, upload.url)
    setArtUploading(false)
    if (!result.ok) setArtError(result.error || "Не удалось добавить арт.")
  }

  function openArtEditor(art: CharacterArt) {
    setSelectedArt(null)
    setArtTitle(art.title)
    setArtCaption(art.caption)
    setArtError("")
    setEditor({ type: "art", art })
  }

  async function saveCharacterArt(event: FormEvent) {
    event.preventDefault()
    if (editor?.type !== "art") return
    setArtSaving(true)
    setArtError("")
    const result = await data.updateArt(editor.art.id, artTitle, artCaption)
    setArtSaving(false)
    if (!result.ok) {
      setArtError(result.error || "Не удалось сохранить арт.")
      return
    }
    setSelectedArt((current) => current?.id === editor.art.id
      ? { ...current, title: artTitle.trim() || "Арт персонажа", caption: artCaption.trim() }
      : current)
    setEditor(null)
  }

  async function removeCharacterArt(art: CharacterArt) {
    if (!window.confirm(`Удалить арт «${art.title || currentCharacter.name}»?`)) return
    setArtError("")
    const result = await data.deleteArt(art.id)
    if (!result.ok) {
      setArtError(result.error || "Не удалось удалить арт.")
      return
    }
    setSelectedArt(null)
  }

  function authorName(userId: string) {
    return members.find((item) => item.user_id === userId)?.display_name || "Игрок"
  }

  async function learnSpell(optionId: string) {
    setSpellActionId(`learn:${optionId}`)
    setSpellError("")
    const result = await data.learnSpell(optionId)
    setSpellActionId(null)
    if (!result.ok) setSpellError(result.error || "Не удалось добавить заклинание.")
  }

  async function toggleSpellPrepared(spell: CharacterSpell) {
    setSpellActionId(`prepare:${spell.id}`)
    setSpellError("")
    const result = await data.setSpellPrepared(spell.id, !spell.prepared)
    setSpellActionId(null)
    if (!result.ok) setSpellError(result.error || "Не удалось изменить подготовку.")
  }

  async function forgetSpell(spell: CharacterSpell) {
    if (!window.confirm(`Убрать «${spell.name}» из изученных заклинаний?`)) return
    setSpellActionId(`forget:${spell.id}`)
    setSpellError("")
    const result = await data.deleteSpell(spell.id)
    setSpellActionId(null)
    if (!result.ok) setSpellError(result.error || "Не удалось убрать заклинание.")
  }

  async function removeSpellOption(option: CharacterSpellOption) {
    if (!window.confirm(`Убрать «${option.name}» из доступных заклинаний?`)) return
    setSpellError("")
    const result = await data.deleteSpellOption(option.id)
    if (!result.ok) setSpellError(result.error || "Не удалось убрать доступ к заклинанию.")
  }

  function profileActions(target: ProfileMenu): ContextAction[] {
    if (target.type === "art") {
      const art = target.item
      const canEditArt = canManage || art.uploaded_by === user.id
      return [
        {
          id: "open",
          label: "Открыть арт",
          detail: "Посмотреть изображение целиком",
          icon: "↗",
          onSelect: () => setSelectedArt(art),
        },
        ...(canEditArt
          ? [
              {
                id: "edit",
                label: "Редактировать",
                detail: "Название и подпись",
                icon: "✎",
                onSelect: () => openArtEditor(art),
              },
              {
                id: "delete",
                label: "Удалить арт",
                detail: "Изображение исчезнет из галереи персонажа",
                icon: "×",
                danger: true,
                onSelect: () => removeCharacterArt(art),
              },
            ]
          : []),
      ]
    }

    if (target.type === "spell-option") {
      const option = target.item
      const learned = learnedSpellNames.has(option.name.trim().toLocaleLowerCase("ru-RU"))
      return [
        ...(!learned && canChooseSpells
          ? [{
              id: "learn",
              label: "Добавить заклинание",
              detail: "Перенести в изученные заклинания персонажа",
              icon: "+",
              onSelect: () => learnSpell(option.id),
            }]
          : []),
        ...(canManage
          ? [
              {
                id: "edit",
                label: "Редактировать доступ",
                detail: "Параметры заклинания в списке ГМ",
                icon: "✎",
                onSelect: () => setEditor({ type: "spell-option", option }),
              },
              {
                id: "delete",
                label: "Убрать из доступных",
                detail: "Игрок больше не сможет изучить его из этого списка",
                icon: "×",
                danger: true,
                onSelect: () => removeSpellOption(option),
              },
            ]
          : []),
      ]
    }

    const spell = target.item
    return [
      {
        id: "open",
        label: expandedSpell === spell.id ? "Свернуть описание" : "Открыть описание",
        detail: "Параметры, источник и эффект",
        icon: "↗",
        onSelect: () => setExpandedSpell(expandedSpell === spell.id ? null : spell.id),
      },
      ...(canChooseSpells
        ? [{
            id: "prepared",
            label: spell.prepared ? "Убрать из подготовленных" : "Подготовить",
            detail: "Изменить состояние заклинания",
            icon: spell.prepared ? "↓" : "↑",
            onSelect: () => toggleSpellPrepared(spell),
          }]
        : []),
      ...(canManage
        ? [{
            id: "edit",
            label: "Редактировать параметры",
            detail: "Уровень, школа, компоненты и описание",
            icon: "✎",
            onSelect: () => setEditor({ type: "spell", spell }),
          }]
        : []),
      ...(canChooseSpells
        ? [{
            id: "delete",
            label: "Убрать заклинание",
            detail: "Заклинание исчезнет из изученных",
            icon: "×",
            danger: true,
            onSelect: () => forgetSpell(spell),
          }]
        : []),
    ]
  }

  return (
    <div className={`screen character-profile-screen ${embedded ? "character-profile-screen--embedded" : ""}`}>
      {!embedded && <header className="screen-header">
        <button className="icon-button" type="button" onClick={onBack} aria-label="Назад">
          <svg viewBox="0 0 24 24" fill="none"><path d="m15 5-7 7 7 7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <h1 className="screen-header__title">{fullName}</h1>
        <span />
      </header>}

      <div className="profile-scroll character-profile-scroll">
        <section className="character-sheet-hero surface">
          <div
            className="character-sheet-hero__art"
            style={heroImageUrl ? { backgroundImage: `linear-gradient(180deg, transparent 30%, rgba(10,10,12,.94)), url(${heroImageUrl})` } : undefined}
          >
            {!heroImageUrl && <div className="character-sheet-hero__fallback">{currentCharacter.name.slice(0, 1).toUpperCase()}</div>}
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
          <button className={`profile-tab ${tab === "arts" ? "profile-tab--active" : ""}`} type="button" onClick={() => setTab("arts")}>Арты</button>
          <button className={`profile-tab ${tab === "inventory" ? "profile-tab--active" : ""}`} type="button" onClick={() => setTab("inventory")}>Инвентарь</button>
          <button className={`profile-tab ${tab === "equipment" ? "profile-tab--active" : ""}`} type="button" onClick={() => setTab("equipment")}>Экипировка</button>
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
            mediaFile={diaryMediaFile}
            setMediaFile={setDiaryMediaFile}
            publishing={diaryPublishing}
            publish={publishDiary}
            error={diaryError}
            commentsFor={commentsFor}
            openComments={openComments}
            setOpenComments={setOpenComments}
            commentDrafts={commentDrafts}
            setCommentDrafts={setCommentDrafts}
            addComment={addComment}
            authorName={authorName}
            updatePost={data.updateDiaryPost}
            deletePost={data.deleteDiaryPost}
            deleteComment={data.deleteComment}
          />
        )}

        {!data.loading && tab === "arts" && (
          <section className="character-tab-section character-art-tab">
            <div className="section-head">
              <div><h3 className="section-title">Галерея персонажа</h3><p className="item-meta">Портреты, сцены и памятные моменты</p></div>
              {(canManage || isAssignedPlayer) && (
                <label className="section-link character-art-upload">
                  {artUploading ? "Загрузка…" : "+ Арт"}
                  <input type="file" accept="image/*" disabled={artUploading} onChange={(event) => { void addCharacterArt(event.target.files?.[0] || null); event.currentTarget.value = "" }} />
                </label>
              )}
            </div>
            {artError && <div className="auth-error">{artError}</div>}
            {data.arts.length === 0 && <div className="character-empty surface">У персонажа пока нет артов.</div>}
            <div className="character-art-grid">
              {data.arts.map((art) => (
                <button
                  type="button"
                  key={art.id}
                  onClick={() => setSelectedArt(art)}
                  aria-label={art.title}
                  {...bindProfileLongPress({ type: "art", item: art })}
                  style={{ touchAction: "pan-y" }}
                >
                  <CampaignImage value={art.image_url} alt={art.title} loading="lazy" />
                </button>
              ))}
            </div>
          </section>
        )}

        {!data.loading && tab === "inventory" && (
          <CharacterInventory
            mode="inventory"
            items={data.inventory}
            canManage={canManage}
            canEquip={canUseInventory}
              onCreate={() => setEditor({ type: "inventory", item: null })}
              onEdit={(item) => setEditor({ type: "inventory", item })}
              onDelete={data.deleteInventoryItem}
              onSetEquipped={data.setInventoryEquipped}
          />
        )}

        {!data.loading && tab === "equipment" && (
          <CharacterInventory
            mode="equipment"
            items={data.inventory}
            canManage={canManage}
            canEquip={canUseInventory}
              onCreate={() => setEditor({ type: "inventory", item: null })}
              onEdit={(item) => setEditor({ type: "inventory", item })}
              onDelete={data.deleteInventoryItem}
              onSetEquipped={data.setInventoryEquipped}
          />
        )}

        {!data.loading && tab === "sheet" && sheet && (
          <SheetTab
            sheet={sheet}
            features={data.features}
            canManage={canManage}
            canEdit={canEditSheet}
            onEditSheet={() => setEditor({ type: "sheet" })}
            onEditResources={() => setEditor({ type: "resources" })}
            onAddFeature={() => setEditor({ type: "feature", feature: null })}
            onEditFeature={(feature) => setEditor({ type: "feature", feature })}
            onDeleteFeature={data.deleteFeature}
          />
        )}

        {!data.loading && tab === "spells" && (
          <section className="character-tab-section">
            <div className="section-head">
              <div><h3 className="section-title">Заклинания</h3><p className="item-meta">{sheet?.spellcasting_enabled ? "ГМ открывает доступ — игрок выбирает и готовит" : "Магия сейчас отключена"}</p></div>
              {canManage && sheet?.spellcasting_enabled && <button className="section-link" type="button" onClick={() => setEditor({ type: "spell-option", option: null })}>+ Выдать доступ</button>}
            </div>

            {spellError && <div className="auth-error">{spellError}</div>}

            {!sheet?.spellcasting_enabled && canManage && (
              <div className="spell-enable-card surface">
                <div><strong>Персонаж использует заклинания?</strong><p>Открой раздел и выдай список доступных заклинаний. Игрок сам выберет нужные.</p></div>
                <button type="button" onClick={() => void data.setSpellcastingEnabled(true)}>Включить</button>
              </div>
            )}

            {sheet?.spellcasting_enabled && (
              <>
                <div className="spellcasting-summary surface">
                  <div><span>Характеристика</span><strong>{sheet.spellcasting_ability || "—"}</strong></div>
                  <div><span>СЛ</span><strong>{sheet.spell_save_dc ?? "—"}</strong></div>
                  <div><span>Атака</span><strong>{sheet.spell_attack_bonus == null ? "—" : signed(sheet.spell_attack_bonus)}</strong></div>
                </div>

                <div className="character-resource-card surface">
                  <div className="character-resource-card__head">
                    <div>
                      <strong>Ячейки</strong>
                      <small>Осталось / максимум</small>
                    </div>
                    {canManage && (
                      <button
                        className="section-link"
                        type="button"
                        onClick={() => setEditor({ type: "resources" })}
                      >
                        ⚙ Ресурсы
                      </button>
                    )}
                  </div>

                  <div className="character-slot-strip">
                    {Array.from({ length: 9 }, (_, index) => index + 1)
                      .map((level) => {
                        const slot = sheet.spell_slots?.[String(level)]
                        const max = Math.max(0, Number(slot?.max || 0))
                        const used = Math.max(0, Number(slot?.used || 0))
                        return {
                          level,
                          max,
                          remaining: Math.max(0, max - used),
                        }
                      })
                      .filter((slot) => slot.max > 0)
                      .map((slot) => (
                        <span key={slot.level}>
                          <small>{slot.level} ур.</small>
                          <strong>{slot.remaining}/{slot.max}</strong>
                        </span>
                      ))}
                  </div>

                  {!Object.values(sheet.spell_slots || {}).some(
                    (slot) => Number(slot?.max || 0) > 0,
                  ) && (
                    <div className="resource-empty-note">
                      Ячейки ещё не назначены.
                      {canManage ? " Нажми «Ресурсы»." : ""}
                    </div>
                  )}
                </div>

                {canManage && (
                  <button className="spell-disable-link" type="button" onClick={() => void data.setSpellcastingEnabled(false)}>Отключить раздел заклинаний</button>
                )}
              </>
            )}

            {!sheet?.spellcasting_enabled && !canManage && <div className="character-empty surface">ГМ пока не открыл этому персонажу доступ к магии.</div>}

            {sheet?.spellcasting_enabled && visibleSpellOptions.length > 0 && (
              <div className="spell-options-block">
                <div className="section-head feature-head">
                  <div>
                    <h3 className="section-title">Доступно для изучения</h3>
                    <p className="item-meta">{canManage ? "Список, который видит игрок" : "Выбери заклинания из списка ГМ"}</p>
                  </div>
                </div>
                <div className="spell-option-list">
                  {visibleSpellOptions.map((option) => {
                    const learned = learnedSpellNames.has(option.name.trim().toLocaleLowerCase("ru-RU"))
                    const learning = spellActionId === `learn:${option.id}`
                    return (
                      <article
                        className="spell-option-card surface"
                        key={option.id}
                        {...bindProfileLongPress({ type: "spell-option", item: option })}
                        style={{ touchAction: "pan-y" }}
                      >
                        <div className="spell-card__rune">{option.spell_level === 0 ? "∞" : option.spell_level}</div>
                        <div className="spell-option-card__copy">
                          <strong>{option.name}</strong>
                          <small>{[option.school, option.source].filter(Boolean).join(" · ") || (option.spell_level === 0 ? "Заговор" : `${option.spell_level} уровень`)}</small>
                        </div>
                        {learned ? (
                          <span className="spell-option-learned">Изучено</span>
                        ) : canChooseSpells ? (
                          <button type="button" disabled={learning} onClick={() => void learnSpell(option.id)}>{learning ? "…" : "Добавить"}</button>
                        ) : null}
                        {canManage && <button className="card-edit-icon" type="button" aria-label={`Изменить доступ к ${option.name}`} onClick={() => setEditor({ type: "spell-option", option })}>✎</button>}
                      </article>
                    )
                  })}
                </div>
              </div>
            )}

            {Array.from(new Set(data.spells.map((spell) => spell.spell_level))).sort((a, b) => a - b).map((level) => (
              <div className="spell-level-block" key={level}>
                <h4>{level === 0 ? "Заговоры" : `${level} уровень`}</h4>
                {data.spells.filter((spell) => spell.spell_level === level).map((spell) => (
                  <article
                    className="spell-card surface"
                    key={spell.id}
                    {...bindProfileLongPress({ type: "spell", item: spell })}
                    style={{ touchAction: "pan-y" }}
                  >
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
                        {canChooseSpells && (
                          <div className="spell-card__actions">
                            <button className="inline-edit-button" type="button" disabled={spellActionId === `prepare:${spell.id}`} onClick={() => void toggleSpellPrepared(spell)}>
                              {spell.prepared ? "Убрать из подготовленных" : "Подготовить"}
                            </button>
                            <button className="danger-mini-button" type="button" disabled={spellActionId === `forget:${spell.id}`} onClick={() => void forgetSpell(spell)}>Убрать</button>
                            {canManage && <button className="inline-edit-button" type="button" onClick={() => setEditor({ type: "spell", spell })}>✎ Параметры</button>}
                          </div>
                        )}
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
            <div className="character-editor-head"><div><h3 className="sheet-title">Арт персонажа</h3><p className="sheet-copy">Выбери картинку прямо с телефона. После загрузки нажми «Сохранить арт».</p></div><button className="sheet-close" type="button" onClick={() => setEditor(null)}>×</button></div>
            <ImageUploadField
              value={avatarUrl}
              onChange={setAvatarUrl}
              folder="character-avatars"
              campaignId={campaignId}
              label="Изображение персонажа"
            />
            {avatarError && <div className="auth-error">{avatarError}</div>}
            <button className="sheet-save" type="submit" disabled={avatarSaving}>{avatarSaving ? "Сохраняем…" : "Сохранить арт"}</button>
          </form>
        </div>
      )}

      {selectedArt && (
        <div className="sheet-backdrop" onMouseDown={() => setSelectedArt(null)}>
          <div className="bottom-sheet art-viewer-sheet" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="character-editor-head"><div><h3 className="sheet-title">{selectedArt.title || currentCharacter.name}</h3><p className="sheet-copy">Галерея персонажа</p></div><button className="sheet-close" type="button" onClick={() => setSelectedArt(null)}>×</button></div>
            <CampaignImage className="art-viewer-image" value={selectedArt.image_url} alt={selectedArt.title} />
            {selectedArt.caption && <p className="sheet-copy">{selectedArt.caption}</p>}
            {(canManage || selectedArt.uploaded_by === user.id) && (
              <div className="spell-card__actions">
                <button className="inline-edit-button" type="button" onClick={() => openArtEditor(selectedArt)}>✎ Редактировать</button>
                <button className="danger-mini-button art-viewer-delete" type="button" onClick={() => void removeCharacterArt(selectedArt)}>Удалить арт</button>
              </div>
            )}
          </div>
        </div>
      )}

      {editor?.type === "art" && (
        <div className="sheet-backdrop" onMouseDown={() => setEditor(null)}>
          <form className="bottom-sheet compact-editor-sheet" onSubmit={saveCharacterArt} onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="character-editor-head">
              <div><h3 className="sheet-title">Редактировать арт</h3><p className="sheet-copy">Название и подпись в галерее персонажа</p></div>
              <button className="sheet-close" type="button" onClick={() => setEditor(null)}>×</button>
            </div>
            <label className="editor-label">Название<input value={artTitle} onChange={(event) => setArtTitle(event.target.value)} maxLength={120} /></label>
            <label className="editor-label">Подпись<textarea value={artCaption} onChange={(event) => setArtCaption(event.target.value)} maxLength={1200} /></label>
            {artError && <div className="auth-error">{artError}</div>}
            <button className="sheet-save" type="submit" disabled={artSaving}>{artSaving ? "Сохраняем…" : "Сохранить"}</button>
          </form>
        </div>
      )}

      {editor?.type === "sheet" && sheet && <CharacterSheetEditor sheet={sheet} systemEditable={canManage} onClose={() => setEditor(null)} onSave={data.updateSheet} />}
      {editor?.type === "resources" && sheet && (
        <CharacterResourcesEditor
          sheet={sheet}
          onClose={() => setEditor(null)}
          onSave={data.updateSheet}
        />
      )}
      {editor?.type === "inventory" && (
        <InventoryItemEditor
          item={editor.item}
          campaignId={campaignId}
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
      {editor?.type === "spell-option" && (
        <SpellEditor
          spell={editor.option}
          purpose="option"
          onClose={() => setEditor(null)}
          onSave={(input) => editor.option ? data.updateSpellOption(editor.option.id, input) : data.addSpellOption(input)}
          onDelete={editor.option ? () => data.deleteSpellOption(editor.option!.id) : undefined}
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
      {profileMenu && (
        <ContextActionSheet
          title={profileMenu.type === "art"
            ? profileMenu.item.title || currentCharacter.name
            : profileMenu.item.name}
          subtitle="Долгое нажатие открывает доступные действия"
          actions={profileActions(profileMenu)}
          onClose={() => setProfileMenu(null)}
        />
      )}
    </div>
  )
}

function SheetTab({
  sheet,
  features,
  canManage,
  canEdit,
  onEditSheet,
  onEditResources,
  onAddFeature,
  onEditFeature,
  onDeleteFeature,
}: {
  sheet: CharacterSheet
  features: CharacterFeature[]
  canManage: boolean
  canEdit: boolean
  onEditSheet: () => void
  onEditResources: () => void
  onAddFeature: () => void
  onEditFeature: (feature: CharacterFeature) => void
  onDeleteFeature: (featureId: string) => Promise<{ ok: boolean; error?: string }>
}) {
  const saveSet = new Set(sheet.saving_throw_proficiencies || [])
  const [featureMenu, setFeatureMenu] = useState<CharacterFeature | null>(null)
  const [featureError, setFeatureError] = useState("")
  const bindFeatureLongPress = useLongPressItem<CharacterFeature>((feature) => {
    setFeatureMenu(feature)
  })

  async function removeFeature(feature: CharacterFeature) {
    if (!window.confirm(`Удалить особенность «${feature.name}»?`)) return
    setFeatureError("")
    const result = await onDeleteFeature(feature.id)
    if (!result.ok) setFeatureError(result.error || "Не удалось удалить особенность.")
  }

  function featureActions(feature: CharacterFeature): ContextAction[] {
    if (!canManage) return []
    return [
      {
        id: "edit",
        label: "Редактировать",
        detail: "Название, тип и описание",
        icon: "✎",
        onSelect: () => onEditFeature(feature),
      },
      {
        id: "delete",
        label: "Удалить особенность",
        detail: "Она исчезнет из листа персонажа",
        icon: "×",
        danger: true,
        onSelect: () => removeFeature(feature),
      },
    ]
  }

  return (
    <>
    <section className="character-tab-section">
      <div className="section-head">
        <div><h3 className="section-title">Лист персонажа</h3><p className="item-meta">Полный компактный D&D-лист</p></div>
        {canEdit && (
          <div className="section-actions">
            {canManage && <button className="section-link" type="button" onClick={onEditResources}>♥ Ресурсы</button>}
            <button className="section-link" type="button" onClick={onEditSheet}>{canManage ? "✎ Лист" : "✎ Моя часть"}</button>
          </div>
        )}
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
        {featureError && <div className="auth-error">{featureError}</div>}
        {features.length === 0 && <div className="character-empty surface">Особенности пока не заполнены.</div>}
        {features.map((feature) => (
          <article
            className="feature-card surface"
            key={feature.id}
            {...(canManage ? bindFeatureLongPress(feature) : {})}
            style={{ touchAction: "pan-y" }}
          >
            <div className="feature-card__top"><div><span>{featureLabels[feature.kind]}</span><strong>{feature.name}</strong></div>{canManage && <button className="card-edit-icon" type="button" onClick={() => onEditFeature(feature)}>✎</button>}</div>
            {feature.description && <p>{feature.description}</p>}
          </article>
        ))}
      </div>
    </section>
    {featureMenu && (
      <ContextActionSheet
        title={featureMenu.name}
        subtitle="Долгое нажатие открывает действия с особенностью"
        actions={featureActions(featureMenu)}
        onClose={() => setFeatureMenu(null)}
      />
    )}
    </>
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
  mediaFile,
  setMediaFile,
  publishing,
  publish,
  error,
  commentsFor,
  openComments,
  setOpenComments,
  commentDrafts,
  setCommentDrafts,
  addComment,
  authorName,
  updatePost,
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
  mediaFile: File | null
  setMediaFile: (value: File | null) => void
  publishing: boolean
  publish: (event: FormEvent) => Promise<void>
  error: string
  commentsFor: (postId: string) => ReturnType<typeof useCharacterSheet>["comments"]
  openComments: string | null
  setOpenComments: (value: string | null) => void
  commentDrafts: Record<string, string>
  setCommentDrafts: Dispatch<SetStateAction<Record<string, string>>>
  addComment: (postId: string) => Promise<void>
  authorName: (userId: string) => string
  updatePost: (postId: string, body: string) => Promise<{ ok: boolean; error?: string }>
  deletePost: (postId: string) => Promise<{ ok: boolean; error?: string }>
  deleteComment: (commentId: string) => Promise<{ ok: boolean; error?: string }>
}) {
  const [diaryMenu, setDiaryMenu] = useState<DiaryMenu | null>(null)
  const [editingPost, setEditingPost] = useState<DiaryPost | null>(null)
  const [editBody, setEditBody] = useState("")
  const [editSaving, setEditSaving] = useState(false)
  const [actionError, setActionError] = useState("")
  const bindDiaryLongPress = useLongPressItem<DiaryMenu>((target) => {
    setDiaryMenu(target)
  })

  function openPostEditor(post: DiaryPost) {
    setEditBody(post.body)
    setActionError("")
    setEditingPost(post)
  }

  async function savePost(event: FormEvent) {
    event.preventDefault()
    if (!editingPost || (!editBody.trim() && !editingPost.media_url)) return
    setEditSaving(true)
    setActionError("")
    const result = await updatePost(editingPost.id, editBody)
    setEditSaving(false)
    if (!result.ok) {
      setActionError(result.error || "Не удалось сохранить запись.")
      return
    }
    setEditingPost(null)
  }

  async function removePost(post: DiaryPost) {
    if (!window.confirm("Удалить эту запись из дневника?")) return
    setActionError("")
    const result = await deletePost(post.id)
    if (!result.ok) setActionError(result.error || "Не удалось удалить запись.")
  }

  async function removeComment(comment: DiaryComment) {
    if (!window.confirm("Удалить комментарий?")) return
    setActionError("")
    const result = await deleteComment(comment.id)
    if (!result.ok) setActionError(result.error || "Не удалось удалить комментарий.")
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      setActionError("Не удалось скопировать текст.")
    }
  }

  function diaryActions(target: DiaryMenu): ContextAction[] {
    if (target.type === "comment") {
      const comment = target.item
      const canDelete = canManage || comment.created_by === currentUserId
      return [
        {
          id: "copy",
          label: "Копировать комментарий",
          detail: "Сохранить текст в буфер обмена",
          icon: "▣",
          onSelect: () => copyText(comment.body),
        },
        ...(canDelete
          ? [{
              id: "delete",
              label: "Удалить комментарий",
              detail: "Комментарий исчезнет из дневника",
              icon: "×",
              danger: true,
              onSelect: () => removeComment(comment),
            }]
          : []),
      ]
    }

    const post = target.item
    const canEditPost = canManage || post.created_by === currentUserId
    const commentsOpen = openComments === post.id
    return [
      {
        id: "comments",
        label: commentsOpen ? "Скрыть комментарии" : "Открыть комментарии",
        detail: `${commentsFor(post.id).length} в обсуждении`,
        icon: "◯",
        onSelect: () => setOpenComments(commentsOpen ? null : post.id),
      },
      ...(post.body
        ? [{
            id: "copy",
            label: "Копировать запись",
            detail: "Сохранить текст в буфер обмена",
            icon: "▣",
            onSelect: () => copyText(post.body),
          }]
        : []),
      ...(canEditPost
        ? [
            {
              id: "edit",
              label: "Редактировать запись",
              detail: "Изменить текст дневника",
              icon: "✎",
              onSelect: () => openPostEditor(post),
            },
            {
              id: "delete",
              label: "Удалить запись",
              detail: "Запись исчезнет из дневника и ленты",
              icon: "×",
              danger: true,
              onSelect: () => removePost(post),
            },
          ]
        : []),
    ]
  }

  return (
    <section className="character-tab-section diary-real-feed">
      {canWrite && (
        <form className="diary-composer surface" onSubmit={(event) => void publish(event)}>
          <CharacterAvatar character={avatar} size="small" />
          <div>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Запись в дневник от лица персонажа…" maxLength={5000} />
            {mediaFile && <span className="diary-media-name">▧ {mediaFile.name}<button type="button" onClick={() => setMediaFile(null)}>×</button></span>}
            <div className="diary-composer__actions">
              <label className="diary-media-button">▧ Фото<input type="file" accept="image/*" onChange={(event) => { setMediaFile(event.target.files?.[0] || null); event.currentTarget.value = "" }} /></label>
              <button type="submit" disabled={publishing || (!draft.trim() && !mediaFile)}>{publishing ? "Публикуем…" : "Опубликовать"}</button>
            </div>
          </div>
        </form>
      )}

      {error && <div className="auth-error">{error}</div>}
      {actionError && <div className="auth-error">{actionError}</div>}
      {posts.length === 0 && <div className="character-empty surface">В дневнике пока нет записей.</div>}

      {posts.map((post) => {
        const postComments = commentsFor(post.id)
        const commentsOpen = openComments === post.id
        return (
          <article
            className="diary-post surface diary-post--real"
            key={post.id}
            {...bindDiaryLongPress({ type: "post", item: post })}
            style={{ touchAction: "pan-y" }}
          >
            <div className="diary-post__top">
              <CharacterAvatar character={avatar} size="small" />
              <div className="diary-post__identity"><div className="item-title">{characterName}</div><div className="item-meta">{formatTime(post.created_at)}</div></div>
              <button className="diary-delete" type="button" aria-label="Действия с записью" onClick={() => setDiaryMenu({ type: "post", item: post })}>•••</button>
            </div>
            {post.media_url && <CampaignImage className="diary-post__media" value={post.media_url} alt="Иллюстрация к записи" loading="lazy" />}
            {post.title && <h3 className="diary-post__title">{post.title}</h3>}
            {post.body && <p className="diary-post__body">{post.body}</p>}
            <button className="diary-comments-toggle" type="button" onClick={() => setOpenComments(commentsOpen ? null : post.id)}>◯ {postComments.length} {postComments.length === 1 ? "комментарий" : "комментариев"}</button>

            {commentsOpen && (
              <div className="diary-comments">
                {postComments.map((comment) => (
                  <div
                    className="diary-comment"
                    key={comment.id}
                    {...bindDiaryLongPress({ type: "comment", item: comment })}
                    style={{ touchAction: "pan-y" }}
                  >
                    <div><strong>{authorName(comment.created_by)}</strong><span>{formatTime(comment.created_at)}</span></div>
                    <p>{comment.body}</p>
                    <button type="button" aria-label="Действия с комментарием" onClick={() => setDiaryMenu({ type: "comment", item: comment })}>•••</button>
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

      {diaryMenu && (
        <ContextActionSheet
          title={diaryMenu.type === "post" ? "Запись дневника" : "Комментарий"}
          subtitle="Долгое нажатие открывает доступные действия"
          actions={diaryActions(diaryMenu)}
          onClose={() => setDiaryMenu(null)}
        />
      )}

      {editingPost && (
        <div className="sheet-backdrop" onMouseDown={() => setEditingPost(null)}>
          <form className="bottom-sheet compact-editor-sheet" onSubmit={savePost} onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="character-editor-head">
              <div><h3 className="sheet-title">Редактировать запись</h3><p className="sheet-copy">Изменения сразу появятся в дневнике и хронике</p></div>
              <button className="sheet-close" type="button" onClick={() => setEditingPost(null)}>×</button>
            </div>
            <label className="editor-label">Текст<textarea value={editBody} onChange={(event) => setEditBody(event.target.value)} maxLength={5000} rows={7} /></label>
            {actionError && <div className="auth-error">{actionError}</div>}
            <button className="sheet-save" type="submit" disabled={editSaving || (!editBody.trim() && !editingPost.media_url)}>{editSaving ? "Сохраняем…" : "Сохранить"}</button>
          </form>
        </div>
      )}
    </section>
  )
}
