import { useEffect, useMemo, useRef, useState } from "react"

import { useAIViewContextLayer } from "../ai/AIProvider"
import CampaignImage from "../components/common/CampaignImage"
import type { SnakeAction } from "../snake-engine"
import { WorkshopPanel } from "./GMWorkshopCommon"
import { SnakeTrigger, useSnake } from "./SnakeProvider"
import {
  useUiV1ArtData,
  type ArtCollection,
  type UiV1ArtItem,
  type UiV1GeneratedAsset,
} from "./useUiV1ArtData"

type ArtSectionId =
  | "comics"
  | "world"
  | "npcs"
  | "locations"
  | "players"
  | "system"
  | "generations"

const sections: Array<{
  id: ArtSectionId
  collection?: ArtCollection
  title: string
  detail: string
  ownerOnly?: boolean
}> = [
  { id: "comics", collection: "comics", title: "Комиксы", detail: "Многостраничные истории и игровые эпизоды" },
  { id: "world", collection: "world", title: "Мир", detail: "Сцены, события и атмосферные арты кампании" },
  { id: "npcs", collection: "npc", title: "Персонажи мира", detail: "NPC и другие жители мира" },
  { id: "locations", collection: "location", title: "Локации", detail: "Места, зоны и окружение" },
  { id: "players", collection: "player", title: "Персонажи игроков", detail: "Арты героев партии" },
  { id: "system", collection: "system", title: "Системные материалы", detail: "Приватные референсы для системы и ИИ", ownerOnly: true },
  { id: "generations", title: "Генерации", detail: "Необработанные результаты генератора", ownerOnly: true },
]

function go(path: string) {
  window.location.hash = "#/" + path
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date).replace(".", "")
}

function Header({
  title,
  campaignTitle,
  onBack,
  action,
}: {
  title: string
  campaignTitle: string
  onBack: () => void
  action?: React.ReactNode
}) {
  return (
    <header className="u1-gm-workshop__header u1-art-library__header">
      <button type="button" className="u1-gm-workshop__back" onClick={onBack} aria-label="Назад">←</button>
      <div>
        <span>{campaignTitle || "Кампания"}</span>
        <strong>{title}</strong>
      </div>
      {action && <span className="u1-art-library__header-action">{action}</span>}
    </header>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="u1-art-library__empty">{children}</div>
}

function artActions(
  item: UiV1ArtItem,
  canDelete: boolean,
  remove: () => Promise<{ ok: boolean; error?: string }>,
): SnakeAction[] {
  if (!canDelete) return []
  return [{
    id: "delete-art",
    label: "Удалить",
    tone: "danger",
    group: "manage",
    surface: {
      kind: "confirm",
      eyebrow: "Арты · Удаление",
      title: "Удалить «" + (item.title || "арт") + "»?",
      body: "Публикация и её файлы будут удалены сразу.",
      confirmLabel: "Удалить",
    },
    execute: async () => {
      const response = await remove()
      return response.ok
        ? { type: "success", notice: "Арт удалён." }
        : { type: "error", message: response.error || "Не удалось удалить арт." }
    },
  }]
}

function generationActions(
  asset: UiV1GeneratedAsset,
  remove: () => Promise<{ ok: boolean; error?: string }>,
): SnakeAction[] {
  const attached = asset.has_active_binding || asset.status === "attached"
  return [{
    id: "delete-generation",
    label: attached ? "Используется" : "Удалить сразу",
    tone: attached ? "normal" : "danger",
    enabled: !attached,
    disabledReason: attached ? "Сначала отвяжи изображение от контента." : undefined,
    surface: attached ? undefined : {
      kind: "confirm",
      eyebrow: "Генерации · Удаление",
      title: "Удалить генерацию без ожидания?",
      body: "Запись и файл будут удалены сразу. Отменить это действие нельзя.",
      confirmLabel: "Удалить сейчас",
    },
    execute: attached ? undefined : async () => {
      const response = await remove()
      return response.ok
        ? { type: "success", notice: "Генерация удалена." }
        : { type: "error", message: response.error || "Не удалось удалить генерацию." }
    },
  }]
}

export default function ArtSection({ subsection }: { subsection?: string }) {
  const data = useUiV1ArtData()
  const snake = useSnake()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const current = sections.find((section) => section.id === subsection)
  const allowedSections = sections.filter((section) => !section.ownerOnly || data.isOwner)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    setSelectedIds(new Set())
  }, [current?.id])

  const selectionMode = selectedIds.size > 0

  const toggleSelected = (id: string) => {
    setSelectedIds((currentSelection) => {
      const next = new Set(currentSelection)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  const collectionItems = useMemo(
    () => current?.collection
      ? data.items.filter((item) => item.collection === current.collection)
      : [],
    [current?.collection, data.items],
  )

  const selectedArtItems = useMemo(
    () => collectionItems.filter((item) => selectedIds.has(item.id)),
    [collectionItems, selectedIds],
  )

  const selectedGenerated = useMemo(
    () => data.generated.filter((asset) => selectedIds.has(asset.id)),
    [data.generated, selectedIds],
  )

  const openArt = (item: UiV1ArtItem) => {
    const comicPages = data.pages
      .filter((page) => page.art_item_id === item.id)
      .sort((a, b) => a.page_number - b.page_number)

    const mediaItems = comicPages.length
      ? comicPages.map((page) => ({
          id: page.id,
          src: page.image_url,
          title: item.title,
          caption: item.caption,
          alt: item.title,
          facts: {
            artItemId: item.id,
            kind: item.kind,
            collection: item.collection,
            pageNumber: page.page_number,
          },
        }))
      : collectionItems.map((candidate) => ({
          id: candidate.id,
          src: candidate.image_url,
          title: candidate.title,
          caption: candidate.caption,
          alt: candidate.title,
          facts: {
            artItemId: candidate.id,
            kind: candidate.kind,
            collection: candidate.collection,
          },
        }))

    const initialIndex = comicPages.length
      ? 0
      : Math.max(0, collectionItems.findIndex((candidate) => candidate.id === item.id))

    snake.openSurface(
      {
        kind: "media",
        eyebrow: item.kind === "comic" ? "Комикс" : current?.title,
        title: item.title || current?.title || "Арт",
        items: mediaItems,
        initialIndex,
      },
      { entity: { type: "campaign-art", id: item.id } },
    )
  }

  const openGeneration = (asset: UiV1GeneratedAsset) => {
    const initialIndex = Math.max(0, data.generated.findIndex((candidate) => candidate.id === asset.id))
    const mediaItems = data.generated.map((candidate) => {
      const title = candidate.purpose.split("_").join(" ")
      return {
        id: candidate.id,
        src: candidate.storage_path,
        title,
        facts: {
          purpose: candidate.purpose,
          profile: candidate.profile,
          status: candidate.status,
          width: candidate.width,
          height: candidate.height,
          variantIndex: candidate.variant_index,
          createdAt: candidate.created_at,
        },
      }
    })

    snake.openSurface(
      {
        kind: "media",
        eyebrow: "Генерации",
        title: asset.purpose.split("_").join(" "),
        items: mediaItems,
        initialIndex,
      },
      { entity: { type: "generated-media", id: asset.id } },
    )
  }

  const selectionActions = (
    id: string,
    selected: boolean,
    canSelect: boolean,
    batchDelete?: SnakeAction,
  ): SnakeAction[] => {
    if (!canSelect) return []

    const actions: SnakeAction[] = [{
      id: selected ? "unselect-art" : "select-art",
      label: selected
        ? "Снять выделение"
        : selectionMode
          ? "Добавить к выделению"
          : "Выбрать",
      group: "manage",
      execute: async () => {
        toggleSelected(id)
        return {
          type: "success",
          notice: selected ? "Снято с выделения." : "Добавлено к выделению.",
        }
      },
    }]

    if (selected && batchDelete) actions.push(batchDelete)
    return actions
  }

  const artBatchDeleteAction: SnakeAction | undefined = selectedArtItems.length
    ? {
        id: "delete-selected-art",
        label: `Удалить выбранные (${selectedArtItems.length})`,
        tone: "danger",
        group: "manage",
        surface: {
          kind: "confirm",
          eyebrow: "Арты · Групповое удаление",
          title: `Удалить выбранные арты: ${selectedArtItems.length}?`,
          body: "Удаление выполняется сразу. Системные материалы, которые используются, останутся на месте.",
          confirmLabel: "Удалить выбранные",
        },
        execute: async () => {
          const response = await data.deleteArts(selectedArtItems)
          clearSelection()
          return response.ok
            ? { type: "success", notice: `Удалено: ${response.deleted || selectedArtItems.length}.` }
            : { type: "error", message: response.error || "Не удалось удалить все выбранные арты." }
        },
      }
    : undefined

  const generatedBatchBlocked = selectedGenerated.some(
    (asset) => asset.has_active_binding || asset.status === "attached",
  )
  const generationBatchDeleteAction: SnakeAction | undefined = selectedGenerated.length
    ? {
        id: "delete-selected-generations",
        label: generatedBatchBlocked
          ? "Среди выбранных есть используемые"
          : `Удалить выбранные (${selectedGenerated.length})`,
        tone: generatedBatchBlocked ? "normal" : "danger",
        group: "manage",
        enabled: !generatedBatchBlocked,
        disabledReason: generatedBatchBlocked
          ? "Сними выделение с используемых изображений или сначала отвяжи их."
          : undefined,
        surface: generatedBatchBlocked ? undefined : {
          kind: "confirm",
          eyebrow: "Генерации · Групповое удаление",
          title: `Удалить выбранные генерации: ${selectedGenerated.length}?`,
          body: "Записи и файлы будут удалены сразу.",
          confirmLabel: "Удалить выбранные",
        },
        execute: generatedBatchBlocked ? undefined : async () => {
          const response = await data.deleteGeneratedMany(selectedGenerated)
          clearSelection()
          return response.ok
            ? { type: "success", notice: `Удалено: ${response.deleted || selectedGenerated.length}.` }
            : { type: "error", message: response.error || "Не удалось удалить все выбранные генерации." }
        },
      }
    : undefined

  useAIViewContextLayer(
    "art-library",
    data.loading
      ? null
      : {
          screen: "art-library",
          route: window.location.hash || "#/home/art",
          title: current ? "Арты · " + current.title : "Арты",
          text: current
            ? "Открыт раздел арт-библиотеки кампании."
            : "Открыт каталог арт-библиотеки кампании.",
          facts: {
            section: current?.id || "index",
            isOwner: data.isOwner,
            counts: data.counts,
            generatedCount: data.isOwner ? data.generated.length : 0,
            visibleItems: current?.id === "generations"
              ? data.generated.slice(0, 30).map((asset) => ({
                  id: asset.id,
                  purpose: asset.purpose,
                  status: asset.status,
                  createdAt: asset.created_at,
                  attached: asset.has_active_binding,
                }))
              : collectionItems.slice(0, 30).map((item) => ({
                  id: item.id,
                  title: item.title,
                  collection: item.collection,
                  createdAt: item.created_at,
                })),
          },
        },
    32,
  )

  if (data.loading) {
    return <main className="u1-art-library"><div className="u1-gm-workshop__loading">Арты открываются…</div></main>
  }

  if (!current || (current.ownerOnly && !data.isOwner)) {
    return (
      <main className="u1-art-library">
        <Header title="Арты" campaignTitle={data.campaignTitle || "Кампания"} onBack={() => go("home")} />
        {data.error ? (
          <div className="u1-gm-workshop__error">{data.error}</div>
        ) : (
          <div className="u1-gm-workshop__panels">
            {allowedSections.map((section) => (
              <WorkshopPanel
                key={section.id}
                eyebrow={section.ownerOnly ? "Только администратор" : undefined}
                title={section.title}
                meta={String(
                  section.id === "generations"
                    ? data.generated.length
                    : data.counts[section.collection || "world"],
                ).padStart(2, "0")}
                detail={section.detail}
                tone={section.ownerOnly ? "draft" : undefined}
                onClick={() => go("home/art/" + section.id)}
              />
            ))}
          </div>
        )}
      </main>
    )
  }

  const canUpload = current.collection
    ? (current.collection === "system" ? data.isOwner : data.canManage)
    : false

  return (
    <main className="u1-art-library">
      <Header
        title={current.title}
        campaignTitle={data.campaignTitle || "Кампания"}
        onBack={() => go("home/art")}
        action={selectionMode ? (
          <button
            type="button"
            className="u1-art-library__selection"
            onClick={clearSelection}
            aria-label="Снять всё выделение"
          >
            {selectedIds.size} выбрано · ×
          </button>
        ) : canUpload ? (
          <button
            type="button"
            className="u1-art-library__add"
            disabled={data.busy}
            onClick={() => fileRef.current?.click()}
            aria-label={"Добавить в " + current.title}
          >
            +
          </button>
        ) : undefined}
      />

      {current.collection && (
        <input
          ref={fileRef}
          className="u1-art-library__file"
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files || [])
            event.currentTarget.value = ""
            if (files.length) void data.upload(current.collection!, files)
          }}
        />
      )}

      {data.error && <div className="u1-art-library__error">{data.error}</div>}

      {current.id === "generations" ? (
        data.generated.length ? (
          <div className="u1-art-library__grid">
            {data.generated.map((asset) => {
              const selected = selectedIds.has(asset.id)
              const actions = [
                ...selectionActions(asset.id, selected, true, generationBatchDeleteAction),
                ...generationActions(asset, () => data.deleteGenerated(asset)),
              ]
              return (
                <SnakeTrigger key={asset.id} entity={{ type: "generated-media", id: asset.id }} actions={actions}>
                  <button
                    type="button"
                    className="u1-art-card"
                    data-selected={selected || undefined}
                    data-attached={(asset.has_active_binding || asset.status === "attached") || undefined}
                    onClick={() => selectionMode ? toggleSelected(asset.id) : openGeneration(asset)}
                  >
                    <span className="u1-art-card__media">
                      <CampaignImage value={asset.storage_path} alt="" loading="lazy" />
                    </span>
                    <span className="u1-art-card__copy">
                      <strong>{asset.purpose.split("_").join(" ")}</strong>
                      <small>{asset.status} · {asset.width}×{asset.height} · {formatTime(asset.created_at)}</small>
                    </span>
                  </button>
                </SnakeTrigger>
              )
            })}
          </div>
        ) : <Empty>Генераций пока нет.</Empty>
      ) : collectionItems.length ? (
        <div className="u1-art-library__grid">
          {collectionItems.map((item) => {
            const canDelete =
              current.collection === "system"
                ? data.isOwner
                : data.canManage || item.uploaded_by === data.userId
            const selected = selectedIds.has(item.id)
            const actions = [
              ...selectionActions(item.id, selected, canDelete, artBatchDeleteAction),
              ...artActions(item, canDelete, () => data.deleteArt(item)),
            ]
            return (
              <SnakeTrigger key={item.id} entity={{ type: "campaign-art", id: item.id }} actions={actions}>
                <button
                  type="button"
                  className="u1-art-card"
                  data-selected={selected || undefined}
                  onClick={() => {
                    if (selectionMode) {
                      if (canDelete) toggleSelected(item.id)
                      return
                    }
                    openArt(item)
                  }}
                >
                  <span className="u1-art-card__media">
                    <CampaignImage value={item.image_url} alt={item.title} loading="lazy" />
                  </span>
                  <span className="u1-art-card__copy">
                    <strong>{item.title || current.title}</strong>
                    <small>
                      {item.kind === "comic"
                        ? "Комикс · " + Math.max(1, data.pages.filter((page) => page.art_item_id === item.id).length) + " стр."
                        : formatTime(item.created_at)}
                    </small>
                  </span>
                </button>
              </SnakeTrigger>
            )
          })}
        </div>
      ) : (
        <Empty>{canUpload ? "Здесь пока пусто. Добавь первый материал через +." : "Здесь пока пусто."}</Empty>
      )}

    </main>
  )
}
