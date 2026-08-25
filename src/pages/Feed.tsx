import { useMemo, useRef, useState } from "react"
import type { FormEvent } from "react"

import CampaignImage from "../components/common/CampaignImage"
import CharacterAvatar from "../components/characters/CharacterAvatar"
import { useAuth } from "../context/AuthContext"
import { useCharacters } from "../context/CharacterContext"
import { useFeed } from "../hooks/useFeed"
import { uploadCampaignImage } from "../lib/mediaUpload"
import type { FeedComment, FeedItem, FeedSource } from "../types/feed"

type Props = {
  onOpenCharacter: (id: string) => void
  onOpenGallery: () => void
}

const sourceLabels: Record<FeedSource, string> = {
  diary: "Дневник",
  art: "Галерея",
  achievement: "Достижение",
  update: "Вести мира",
  moment: "Момент",
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export default function Feed({ onOpenCharacter, onOpenGallery }: Props) {
  const { user, profile } = useAuth()
  const {
    campaignId,
    campaignTitle,
    characters,
    members,
    activeCharacter,
    canManage,
  } = useCharacters()
  const feed = useFeed(campaignId)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [actionError, setActionError] = useState("")
  const [openComments, setOpenComments] = useState<string | null>(null)
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  const characterMap = useMemo(
    () => new Map(characters.map((character) => [character.id, character])),
    [characters],
  )
  const memberMap = useMemo(
    () => new Map(members.map((member) => [member.user_id, member])),
    [members],
  )

  const activeRoster = useMemo(
    () =>
      members
        .map((member) =>
          member.active_character_id
            ? characterMap.get(member.active_character_id)
            : undefined,
        )
        .filter((character): character is NonNullable<typeof character> => Boolean(character)),
    [characterMap, members],
  )

  function authorFor(item: FeedItem) {
    const character = item.character_id
      ? characterMap.get(item.character_id) ?? null
      : null
    const member = item.created_by
      ? memberMap.get(item.created_by)
      : character?.assigned_user_id
        ? memberMap.get(character.assigned_user_id)
        : null
    return {
      character,
      label: character?.name || (member?.is_owner ? "Владелец" : member?.role === "gm" ? "GM" : member?.display_name) || campaignTitle,
      sublabel: character && member ? member.display_name : sourceLabels[item.source_type],
    }
  }

  function commentAuthor(comment: FeedComment) {
    const character = comment.character_id
      ? characterMap.get(comment.character_id)
      : null
    const member = memberMap.get(comment.user_id)
    return character?.name || member?.display_name || "Игрок"
  }

  async function publish(event: FormEvent) {
    event.preventDefault()
    if (publishing || (!draft.trim() && !mediaFile)) return
    setPublishing(true)
    setActionError("")

    let mediaUrl: string | null = null
    if (mediaFile) {
      const upload = await uploadCampaignImage(mediaFile, "feed", campaignId)
      if (!upload.ok) {
        setPublishing(false)
        setActionError(upload.error)
        return
      }
      mediaUrl = upload.url
    }

    const result = await feed.createMoment(draft, mediaUrl)
    setPublishing(false)
    if (!result.ok) {
      setActionError(result.error || "Не удалось опубликовать момент.")
      return
    }
    setDraft("")
    setMediaFile(null)
    setComposerOpen(false)
  }

  async function submitComment(itemId: string) {
    const body = commentDrafts[itemId]?.trim()
    if (!body) return
    setActionError("")
    const result = await feed.addComment(itemId, body)
    if (!result.ok) {
      setActionError(result.error || "Не удалось добавить комментарий.")
      return
    }
    setCommentDrafts((current) => ({ ...current, [itemId]: "" }))
  }

  async function deleteItem(itemId: string) {
    setActionError("")
    const result = await feed.deleteItem(itemId)
    setOpenMenu(null)
    if (!result.ok) setActionError(result.error || "Не удалось удалить публикацию.")
  }

  return (
    <div className="feed-page">
      <section className="story-rail" aria-label="Активные персонажи">
        <button className="story story--create" type="button" onClick={() => setComposerOpen(true)}>
          <span className="story__avatar"><CharacterAvatar character={activeCharacter} size="large" /><em>+</em></span>
          <small>Момент</small>
        </button>
        {activeRoster.map((character) => (
          <button className="story" type="button" key={character.id} onClick={() => onOpenCharacter(character.id)}>
            <span className="story__avatar"><CharacterAvatar character={character || null} size="large" /></span>
            <small>{character.name}</small>
          </button>
        ))}
        <button className="story story--gallery" type="button" onClick={onOpenGallery}>
          <span className="story__avatar story__gallery-icon">✦</span>
          <small>Арты</small>
        </button>
      </section>

      <button className="feed-composer-prompt surface" type="button" onClick={() => setComposerOpen(true)}>
        <CharacterAvatar character={activeCharacter} size="small" />
        <span>{activeCharacter ? `Что случилось с ${activeCharacter.name}?` : `Что нового, ${profile.display_name}?`}</span>
        <em>＋</em>
      </button>

      {(actionError || feed.error) && <div className="auth-error feed-error">{actionError || feed.error}</div>}

      {feed.loading && <div className="center-state"><span className="status-spinner" /><span>Собираем хронику…</span></div>}

      {!feed.loading && feed.items.length === 0 && (
        <div className="feed-empty surface">
          <span>✦</span>
          <strong>История начинается здесь</strong>
          <p>Опубликуй первый момент, запись дневника или арт кампании.</p>
          <button type="button" onClick={() => setComposerOpen(true)}>Создать публикацию</button>
        </div>
      )}

      <section className="feed-list" aria-label="Лента кампании">
        {feed.items.map((item) => {
          const author = authorFor(item)
          const liked = item.reactions.some((reaction) => reaction.user_id === user.id)
          const canDelete = canManage || item.created_by === user.id
          const commentsOpen = openComments === item.id

          return (
            <article className="feed-card surface" key={item.id}>
              <header className="feed-card__header">
                <button
                  className="feed-author"
                  type="button"
                  onClick={() => author.character && onOpenCharacter(author.character.id)}
                  disabled={!author.character}
                >
                  <CharacterAvatar character={author.character} size="small" />
                  <span><strong>{author.label}</strong><small>{author.sublabel} · {formatDate(item.published_at)}</small></span>
                </button>
                {canDelete && (
                  <div className="item-menu-wrap">
                    <button className="item-menu-button" type="button" aria-label="Действия" onClick={() => setOpenMenu(openMenu === item.id ? null : item.id)}>•••</button>
                    {openMenu === item.id && (
                      <div className="item-menu-popover">
                        <button type="button" onClick={() => void deleteItem(item.id)}>Удалить публикацию</button>
                      </div>
                    )}
                  </div>
                )}
              </header>

              {item.media_url && <CampaignImage className="feed-card__media" value={item.media_url} alt={item.title || "Публикация"} loading="lazy" />}

              <div className="feed-card__content">
                <span className={`feed-source feed-source--${item.source_type}`}>{sourceLabels[item.source_type]}</span>
                {item.title && <h2>{item.title}</h2>}
                {item.body && <p>{item.body}</p>}
              </div>

              <div className="feed-card__actions">
                <button className={liked ? "feed-action feed-action--liked" : "feed-action"} type="button" onClick={() => void feed.toggleReaction(item.id)} aria-label={liked ? "Убрать реакцию" : "Нравится"}>
                  <span>{liked ? "♥" : "♡"}</span>{item.reactions.length > 0 && <small>{item.reactions.length}</small>}
                </button>
                <button className="feed-action" type="button" onClick={() => setOpenComments(commentsOpen ? null : item.id)}>
                  <span>◌</span>{item.comments.length > 0 && <small>{item.comments.length}</small>}
                </button>
              </div>

              {item.reactions.length > 0 && <p className="feed-likes">Нравится: {item.reactions.length}</p>}

              {(commentsOpen || item.comments.length > 0) && (
                <div className="feed-comments">
                  {item.comments.map((comment) => (
                    <div className="feed-comment" key={comment.id}>
                      <p><strong>{commentAuthor(comment)}</strong> {comment.body}</p>
                      {(canManage || comment.user_id === user.id) && <button type="button" onClick={() => void feed.deleteComment(comment.id)}>Удалить</button>}
                    </div>
                  ))}
                  {commentsOpen && (
                    <form onSubmit={(event) => { event.preventDefault(); void submitComment(item.id) }}>
                      <input value={commentDrafts[item.id] || ""} onChange={(event) => setCommentDrafts((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Добавить комментарий…" maxLength={2000} />
                      <button type="submit" disabled={!commentDrafts[item.id]?.trim()}>Отправить</button>
                    </form>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </section>

      {feed.hasMore && <button className="feed-load-more" type="button" onClick={() => void feed.loadMore()} disabled={feed.loadingMore}>{feed.loadingMore ? "Загружаем…" : "Показать более ранние"}</button>}

      {composerOpen && (
        <div className="sheet-backdrop" onMouseDown={() => setComposerOpen(false)}>
          <form className="bottom-sheet feed-composer-sheet" onSubmit={publish} onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="character-editor-head">
              <div><h3 className="sheet-title">Новый момент</h3><p className="sheet-copy">Публикация появится в общей хронике кампании.</p></div>
              <button className="sheet-close" type="button" onClick={() => setComposerOpen(false)}>×</button>
            </div>
            <div className="composer-identity"><CharacterAvatar character={activeCharacter} size="small" /><span><strong>{activeCharacter?.name || (canManage ? profile.display_name : "Без активного персонажа")}</strong><small>{campaignTitle}</small></span></div>
            <textarea className="app-textarea feed-composer-textarea" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Что произошло?" maxLength={5000} autoFocus />
            {mediaFile && <div className="composer-file"><span>▧ {mediaFile.name}</span><button type="button" onClick={() => setMediaFile(null)}>Убрать</button></div>}
            <input ref={fileRef} className="media-hidden-input" type="file" accept="image/*" onChange={(event) => { setMediaFile(event.target.files?.[0] || null); event.currentTarget.value = "" }} />
            <div className="composer-actions"><button className="media-file-button" type="button" onClick={() => fileRef.current?.click()}>▧ Добавить фото</button><button className="sheet-save" type="submit" disabled={publishing || (!draft.trim() && !mediaFile)}>{publishing ? "Публикуем…" : "Опубликовать"}</button></div>
          </form>
        </div>
      )}
    </div>
  )
}
