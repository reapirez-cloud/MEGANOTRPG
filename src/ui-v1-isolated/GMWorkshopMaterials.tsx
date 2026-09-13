import { useMemo, useRef, useState } from "react"

import type { SnakeAction } from "../snake-engine"
import { SnakeTrigger, useSnake } from "./SnakeProvider"
import { openSourceAction } from "./GMWorkshopCommon"
import { useGMWorkshopData } from "./useGMWorkshopData"

export default function GMWorkshopMaterials({
  data,
}: {
  data: ReturnType<typeof useGMWorkshopData>
}) {
  const snake = useSnake()
  const uploadRef = useRef<HTMLInputElement | null>(null)
  const [folderId, setFolderId] = useState<string | null | "root">(null)
  const [query, setQuery] = useState("")
  const needle = query.trim().toLocaleLowerCase("ru-RU")
  const currentFolderId =
    typeof folderId === "string" && folderId !== "root" ? folderId : null

  const folderMeta = useMemo(() => {
    const byId = new Map(data.folders.map((folder) => [folder.id, folder]))
    const depthOf = (id: string) => {
      let depth = 0
      let current = byId.get(id)
      const seen = new Set<string>()
      while (current?.parentId && !seen.has(current.parentId)) {
        seen.add(current.parentId)
        depth += 1
        current = byId.get(current.parentId)
      }
      return depth
    }
    return data.folders
      .map((folder) => ({ folder, depth: depthOf(folder.id) }))
      .sort((a, b) =>
        a.depth - b.depth ||
        a.folder.name.localeCompare(b.folder.name, "ru")
      )
  }, [data.folders])

  const visible = data.materials.filter((material) => {
    if (folderId === "root" && material.folderId) return false
    if (
      folderId &&
      folderId !== "root" &&
      material.folderId !== folderId
    ) return false
    if (!needle) return true

    return (material.title + " " + material.body)
      .toLocaleLowerCase("ru-RU")
      .includes(needle)
  })

  function createNote() {
    const action: SnakeAction = {
      id: "create-note",
      label: "Новая заметка",
      surface: {
        kind: "editor",
        eyebrow: "Материалы · только GM",
        title: "Новая заметка",
        size: { width: "wide", height: "tall" },
        fields: [
          { id: "title", label: "Название", type: "text", required: true },
          { id: "body", label: "Текст", type: "textarea" },
        ],
        submitLabel: "Сохранить",
      },
      execute: async ({ input }) => {
        const response = await data.operations.createNote(
          String(input?.title || ""),
          String(input?.body || ""),
          typeof folderId === "string" && folderId !== "root"
            ? folderId
            : null,
        )

        return response.ok
          ? { type: "success", notice: "Заметка сохранена." }
          : {
              type: "error",
              message: response.error || "Не удалось сохранить заметку.",
            }
      },
    }

    openSourceAction(
      snake,
      { type: "gm-materials", id: "notes" },
      action,
    )
  }

  function createFolder() {
    const action: SnakeAction = {
      id: "create-folder",
      label: "Новая папка",
      surface: {
        kind: "editor",
        eyebrow: "Материалы · только GM",
        title: "Новая папка",
        fields: [
          { id: "name", label: "Название", type: "text", required: true },
        ],
        submitLabel: "Создать",
      },
      execute: async ({ input }) => {
        const response = await data.operations.createFolder(
          String(input?.name || ""),
          currentFolderId,
        )
        return response.ok
          ? { type: "success", notice: "Папка создана." }
          : {
              type: "error",
              message: response.error || "Не удалось создать папку.",
            }
      },
    }

    openSourceAction(
      snake,
      { type: "gm-materials", id: "folders" },
      action,
    )
  }

  function openNoteEditor(material: ReturnType<typeof useGMWorkshopData>["materials"][number]) {
    const action: SnakeAction = {
      id: "edit-note",
      label: "Редактировать заметку",
      surface: {
        kind: "editor",
        eyebrow: "Материалы · только GM",
        title: material.title,
        size: { width: "wide", height: "tall" },
        fields: [
          { id: "title", label: "Название", type: "text", required: true },
          { id: "body", label: "Текст", type: "textarea" },
        ],
        initialValues: {
          title: material.title,
          body: material.body,
        },
        submitLabel: "Сохранить",
      },
      execute: async ({ input }) => {
        const response = await data.operations.updateNote(
          material.id,
          String(input?.title || ""),
          String(input?.body || ""),
        )

        return response.ok
          ? { type: "success", notice: "Заметка обновлена." }
          : {
              type: "error",
              message: response.error || "Не удалось обновить заметку.",
            }
      },
    }

    openSourceAction(
      snake,
      { type: "gm-material", id: material.id },
      action,
    )
  }

  function folderActions(folder: ReturnType<typeof useGMWorkshopData>["folders"][number]): SnakeAction[] {
    const descendants = new Set<string>()
    const stack = data.folders
      .filter((item) => item.parentId === folder.id)
      .map((item) => item.id)
    while (stack.length) {
      const id = stack.pop()!
      if (descendants.has(id)) continue
      descendants.add(id)
      stack.push(...data.folders.filter((item) => item.parentId === id).map((item) => item.id))
    }

    const moveTargets = data.folders.filter(
      (candidate) =>
        candidate.id !== folder.id &&
        !descendants.has(candidate.id),
    )

    return [
      {
        id: "open-folder",
        label: "Открыть папку",
        execute: () => {
          setFolderId(folder.id)
          return { type: "success" }
        },
      },
      {
        id: "rename-folder",
        label: "Переименовать",
        surface: {
          kind: "editor",
          eyebrow: "Материалы · только GM",
          title: folder.name,
          fields: [
            { id: "name", label: "Название", type: "text", required: true },
          ],
          initialValues: { name: folder.name },
          submitLabel: "Сохранить",
        },
        execute: async ({ input }) => {
          const response = await data.operations.renameFolder(
            folder.id,
            String(input?.name || ""),
          )

          return response.ok
            ? { type: "success", notice: "Папка переименована." }
            : {
                type: "error",
                message: response.error || "Не удалось переименовать папку.",
              }
        },
      },
      {
        id: "move-folder",
        label: "Переместить",
        surface: {
          kind: "picker",
          eyebrow: "Материалы · папка",
          title: "Куда переместить «" + folder.name + "»?",
          items: [
            {
              id: "__root__",
              label: "Без родительской папки",
              description: "Верхний уровень",
            },
            ...moveTargets.map((target) => ({
              id: target.id,
              label: target.name,
              description: target.parentId ? "Вложенная папка" : "Верхний уровень",
            })),
          ],
          initialSelection: folder.parentId || "__root__",
          submitLabel: "Переместить",
        },
        execute: async ({ input }) => {
          const selected = typeof input?.selection === "string"
            ? input.selection
            : "__root__"
          const response = await data.operations.moveFolder(
            folder.id,
            selected === "__root__" ? null : selected,
          )
          return response.ok
            ? { type: "success", notice: "Папка перемещена." }
            : {
                type: "error",
                message: response.error || "Не удалось переместить папку.",
              }
        },
      },
      {
        id: "delete-folder",
        label: "Удалить папку",
        tone: "danger",
        surface: {
          kind: "confirm",
          eyebrow: "Материалы",
          title: "Удалить «" + folder.name + "»?",
          body: "Материалы останутся и перейдут в «Без папки».",
          confirmLabel: "Удалить",
        },
        execute: async () => {
          const response = await data.operations.deleteFolder(folder.id)
          if (response.ok && folderId === folder.id) setFolderId("root")

          return response.ok
            ? { type: "success", notice: "Папка удалена." }
            : {
                type: "error",
                message: response.error || "Не удалось удалить папку.",
              }
        },
      },
    ]
  }

  async function uploadFile(file: File | null) {
    if (!file) return

    const response = await data.operations.uploadMaterial(
      file,
      typeof folderId === "string" && folderId !== "root"
        ? folderId
        : null,
    )

    if (!response.ok) {
      snake.openSurface({
        kind: "notice",
        eyebrow: "Материалы",
        title: "Файл не загружен",
        body: response.error || "Не удалось загрузить файл.",
        tone: "error",
      })
    }
  }

  return (
    <div className="u1-gm-workshop__section">
      <label className="u1-gm-search">
        <span>⌕</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Найти заметку или материал…"
        />
      </label>

      <div className="u1-gm-material-tools">
        <button type="button" onClick={createNote}>+ Заметка</button>
        <button type="button" onClick={createFolder}>+ Папка</button>
        <button type="button" onClick={() => uploadRef.current?.click()}>+ Файл</button>
        <input
          ref={uploadRef}
          className="u1-gm-material-upload"
          type="file"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0] || null
            event.target.value = ""
            void uploadFile(file)
          }}
        />
      </div>

      <div className="u1-gm-folder-rail">
        <button
          type="button"
          data-active={folderId === null || undefined}
          onClick={() => setFolderId(null)}
        >
          Все
        </button>
        <button
          type="button"
          data-active={folderId === "root" || undefined}
          onClick={() => setFolderId("root")}
        >
          Без папки
        </button>
        {folderMeta.map(({ folder, depth }) => (
          <SnakeTrigger
            key={folder.id}
            entity={{ type: "gm-folder", id: folder.id }}
            actions={folderActions(folder)}
          >
            <button
              type="button"
              data-active={folderId === folder.id || undefined}
              onClick={() => setFolderId(folder.id)}
            >
              {"↳".repeat(depth)}{depth ? " " : ""}{folder.name}
            </button>
          </SnakeTrigger>
        ))}
      </div>

      <div className="u1-gm-list">
        {visible.map((material) => {
          const actions: SnakeAction[] = [
            material.kind === "upload"
              ? {
                  id: "open-material",
                  label: "Открыть файл",
                  enabled: Boolean(material.fileUrl),
                  disabledReason: "У файла нет доступного адреса.",
                  execute: () => {
                    if (!material.fileUrl) {
                      return { type: "error" as const, message: "Файл недоступен." }
                    }
                    window.open(material.fileUrl, "_blank", "noopener,noreferrer")
                    return { type: "success" as const }
                  },
                }
              : {
                  id: "open-material",
                  label: "Открыть заметку",
                  surface: {
                    kind: "detail",
                    eyebrow: "Материалы · только GM",
                    title: material.title,
                    body: material.body || "Пустая заметка.",
                  },
                },
            ...(material.kind === "note"
              ? [{
                  id: "edit-note",
                  label: "Редактировать",
                  execute: () => {
                    openNoteEditor(material)
                    return { type: "success" as const }
                  },
                }]
              : []),
            {
              id: "move-material",
              label: "Переместить",
              surface: {
                kind: "picker",
                eyebrow: "Материалы",
                title: "Куда переместить «" + material.title + "»?",
                items: [
                  {
                    id: "__root__",
                    label: "Без папки",
                    description: "Корень рабочего пространства",
                  },
                  ...folderMeta.map(({ folder, depth }) => ({
                    id: folder.id,
                    label: "↳".repeat(depth) + (depth ? " " : "") + folder.name,
                  })),
                ],
                initialSelection: material.folderId || "__root__",
                submitLabel: "Переместить",
              },
              execute: async ({ input }) => {
                const selected = typeof input?.selection === "string"
                  ? input.selection
                  : "__root__"
                const response = await data.operations.moveMaterial(
                  material.id,
                  selected === "__root__" ? null : selected,
                )
                return response.ok
                  ? { type: "success", notice: "Материал перемещён." }
                  : {
                      type: "error",
                      message: response.error || "Не удалось переместить материал.",
                    }
              },
            },
            {
              id: "delete-material",
              label: "Удалить",
              tone: "danger",
              surface: {
                kind: "confirm",
                eyebrow: "Материалы",
                title: "Удалить «" + material.title + "»?",
                body: material.kind === "upload"
                  ? "Запись и файл в приватном Storage будут удалены."
                  : "Заметка будет удалена из личного рабочего пространства GM.",
                confirmLabel: "Удалить",
              },
              execute: async () => {
                const response = await data.operations.deleteMaterial(material.id)
                return response.ok
                  ? { type: "success", notice: "Материал удалён." }
                  : {
                      type: "error",
                      message:
                        response.error || "Не удалось удалить материал.",
                    }
              },
            },
          ]

          return (
            <SnakeTrigger
              key={material.id}
              entity={{ type: "gm-material", id: material.id }}
              actions={actions}
            >
              <button
                type="button"
                className="u1-gm-material-row"
                onClick={() => {
                  if (material.kind === "upload" && material.fileUrl) {
                    window.open(material.fileUrl, "_blank", "noopener,noreferrer")
                    return
                  }

                  snake.openSurface({
                    kind: "detail",
                    eyebrow: "Материалы · только GM",
                    title: material.title,
                    body: material.body || "Пустая заметка.",
                  })
                }}
              >
                <span>
                  <strong>{material.title}</strong>
                  <small>
                    {material.kind === "note"
                      ? "Заметка"
                      : material.originalName || "Файл"}
                  </small>
                  {material.body && <p>{material.body}</p>}
                </span>
                {material.kind === "upload" && <i aria-hidden="true">↗</i>}
              </button>
            </SnakeTrigger>
          )
        })}

        {!visible.length && (
          <div className="u1-gm-empty">Здесь пока пусто.</div>
        )}
      </div>
    </div>
  )
}
