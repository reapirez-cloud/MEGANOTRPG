import { useState } from "react"

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
  const [folderId, setFolderId] = useState<string | null | "root">(null)
  const [query, setQuery] = useState("")
  const needle = query.trim().toLocaleLowerCase("ru-RU")

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
        {data.folders.map((folder) => (
          <button
            type="button"
            key={folder.id}
            data-active={folderId === folder.id || undefined}
            onClick={() => setFolderId(folder.id)}
          >
            {folder.name}
          </button>
        ))}
      </div>

      <div className="u1-gm-list">
        {visible.map((material) => {
          const action: SnakeAction = {
            id: "delete-material",
            label: "Удалить",
            tone: "danger",
            surface: {
              kind: "confirm",
              eyebrow: "Материалы",
              title: "Удалить «" + material.title + "»?",
              body: "Материал будет удалён из личного рабочего пространства GM.",
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
          }

          return (
            <SnakeTrigger
              key={material.id}
              entity={{ type: "gm-material", id: material.id }}
              actions={[action]}
            >
              <article className="u1-gm-material-row">
                <span>
                  <strong>{material.title}</strong>
                  <small>
                    {material.kind === "note"
                      ? "Заметка"
                      : material.originalName || "Файл"}
                  </small>
                  {material.body && <p>{material.body}</p>}
                </span>
              </article>
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
