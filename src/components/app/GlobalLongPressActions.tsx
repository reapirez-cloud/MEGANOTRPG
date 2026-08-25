import { useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent } from "react"

import { useCharacters } from "../../context/CharacterContext"
import { supabase } from "../../lib/supabase"

type Tab = "world" | "art" | "chats" | "characters"

type EntityKind =
  | "campaign"
  | "character"
  | "member"
  | "chat"
  | "art"
  | "world-section"
  | "world-article"
  | "location"
  | "location-section"
  | "achievement"
  | "update"

type MenuTarget = {
  kind: EntityKind
  id: string
  title: string
  element: HTMLElement
  meta?: string
  fixed?: boolean
}

type Action = {
  label: string
  detail?: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}

function textOf(element: Element | null) {
  return element?.textContent?.trim() || ""
}

function firstButton(element: HTMLElement) {
  if (element instanceof HTMLButtonElement) return element
  return element.querySelector<HTMLButtonElement>("button")
}

export default function GlobalLongPressActions({ activeTab }: { activeTab: Tab }) {
  const { canManage, campaignId, characters, members } = useCharacters()
  const db = supabase as any

  const [target, setTarget] = useState<MenuTarget | null>(null)
  const [renameTarget, setRenameTarget] = useState<MenuTarget | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const timerRef = useRef<number | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const suppressClickRef = useRef(false)

  const characterMap = useMemo(() => {
    const map = new Map<string, string>()

    for (const character of characters) {
      const member = character.assigned_user_id
        ? members.find((item) => item.user_id === character.assigned_user_id)
        : null
      const title = member
        ? `${character.name} (${member.display_name})`
        : character.name
      map.set(title, character.id)
    }

    return map
  }, [characters, members])

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  function selector() {
    if (activeTab === "characters") {
      return ".character-social-card, .member-role-row"
    }

    if (activeTab === "chats") return ".chat-row"
    if (activeTab === "art") return ".art-tile--real"

    return [
      ".world-hero-button",
      ".world-section-card",
      ".world-section-description",
      ".world-article-row",
      ".world-reading",
      ".world-location-card",
      ".world-location-detail",
      ".location-info-section",
      ".world-achievement-row",
      ".world-update-row",
    ].join(", ")
  }

  async function oneBy(
    table: string,
    column: string,
    value: string,
    select = "id",
    scopeCampaign = true,
  ): Promise<Record<string, unknown>> {
    let query = db.from(table).select(select).eq(column, value)
    if (scopeCampaign && campaignId) query = query.eq("campaign_id", campaignId)
    const { data, error: lookupError } = await query.limit(2)

    if (lookupError) throw new Error(lookupError.message)
    if (!data || data.length === 0) throw new Error("Объект не найден.")
    if (data.length > 1) {
      throw new Error("Есть несколько объектов с одинаковым названием.")
    }

    return data[0] as Record<string, unknown>
  }

  async function resolveElement(element: HTMLElement): Promise<MenuTarget> {
    if (element.matches(".world-hero-button")) {
      return {
        kind: "campaign",
        id: campaignId,
        title: textOf(element.querySelector(".hero-card__title")) || "Кампания",
        element,
        fixed: true,
      }
    }

    if (element.matches(".character-social-card")) {
      const title = textOf(
        element.querySelector(".character-social-card__name-row strong"),
      )
      const id = characterMap.get(title)
      if (!id) throw new Error("Не удалось определить персонажа.")
      return { kind: "character", id, title, element }
    }

    if (element.matches(".member-role-row")) {
      const title = textOf(element.querySelector(".member-role-copy strong"))
      const member = members.find((item) => item.display_name === title)
      if (!member) throw new Error("Не удалось определить участника.")
      return { kind: "member", id: member.user_id, title, element }
    }

    if (element.matches(".chat-row")) {
      const title = textOf(element.querySelector(".chat-row__title"))
      const row = await oneBy("chat_rooms", "title", title, "id, category")
      const category = String(row.category || "game")
      return {
        kind: "chat",
        id: String(row.id),
        title,
        element,
        meta: category,
        fixed: category === "flood",
      }
    }

    if (element.matches(".art-tile--real")) {
      const title = element.querySelector<HTMLImageElement>("img")?.alt || "Арт"
      const row = await oneBy(
        "campaign_art_items",
        "title",
        title,
        "id, image_url",
      )
      return {
        kind: "art",
        id: String(row.id),
        title,
        element,
        meta: String(row.image_url || ""),
      }
    }

    if (element.matches(".world-section-card, .world-section-description")) {
      const title = element.matches(".world-section-card")
        ? textOf(element.querySelector("strong"))
        : textOf(document.querySelector(".world-back-row h2"))
      const row = await oneBy("world_sections", "title", title)
      return { kind: "world-section", id: String(row.id), title, element }
    }

    if (element.matches(".world-article-row, .world-reading")) {
      const title = element.matches(".world-article-row")
        ? textOf(element.querySelector("strong"))
        : textOf(element.querySelector("h2"))
      const row = await oneBy("world_articles", "title", title)
      return { kind: "world-article", id: String(row.id), title, element }
    }

    if (element.matches(".world-location-card, .world-location-detail")) {
      const title = element.matches(".world-location-card")
        ? textOf(element.querySelector("strong"))
        : textOf(element.querySelector("h2"))
      const row = await oneBy("locations", "name", title)
      return { kind: "location", id: String(row.id), title, element }
    }

    if (element.matches(".location-info-section")) {
      const title = textOf(element.querySelector(".location-info-section__head h4"))
      const locationName = textOf(document.querySelector(".world-location-detail h2"))
      const location = await oneBy("locations", "name", locationName)

      const { data, error: sectionError } = await db
        .from("location_sections")
        .select("id")
        .eq("location_id", String(location.id))
        .eq("title", title)
        .limit(2)

      if (sectionError) throw new Error(sectionError.message)
      if (!data || data.length !== 1) {
        throw new Error("Не удалось определить раздел локации.")
      }

      return {
        kind: "location-section",
        id: String(data[0].id),
        title,
        element,
      }
    }

    if (element.matches(".world-achievement-row")) {
      const title = textOf(
        element.querySelector(".world-achievement-row__top strong"),
      )
      const row = await oneBy("achievements", "title", title)
      return { kind: "achievement", id: String(row.id), title, element }
    }

    if (element.matches(".world-update-row")) {
      const title = textOf(element.querySelector(".world-update-row__top strong"))
      const row = await oneBy("campaign_updates", "title", title)
      return { kind: "update", id: String(row.id), title, element }
    }

    throw new Error("Для этого элемента пока нет меню действий.")
  }

  async function openMenu(element: HTMLElement) {
    setError("")

    try {
      const resolved = await resolveElement(element)
      navigator.vibrate?.(18)
      setTarget(resolved)
    } catch (resolveError) {
      setError(
        resolveError instanceof Error
          ? resolveError.message
          : "Не удалось открыть меню.",
      )
    }
  }

  useEffect(() => {
    if (!canManage) return

    const manageableSelector = selector()

    function targetFrom(eventTarget: EventTarget | null) {
      if (!(eventTarget instanceof Element)) return null
      if (
        eventTarget.closest(
          ".sheet-backdrop, input, textarea, select, .composer, .bottom-nav",
        )
      ) {
        return null
      }
      return eventTarget.closest(manageableSelector) as HTMLElement | null
    }

    function pointerDown(event: PointerEvent) {
      if (event.pointerType === "mouse" && event.button !== 0) return
      const element = targetFrom(event.target)
      if (!element) return

      clearTimer()
      startRef.current = { x: event.clientX, y: event.clientY }

      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        suppressClickRef.current = true
        void openMenu(element)
      }, 500)
    }

    function pointerMove(event: PointerEvent) {
      const start = startRef.current
      if (!start) return
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 14) {
        clearTimer()
      }
    }

    function pointerEnd() {
      clearTimer()
      startRef.current = null
    }

    function clickCapture(event: MouseEvent) {
      if (!suppressClickRef.current) return
      event.preventDefault()
      event.stopPropagation()
      suppressClickRef.current = false
    }

    function contextMenu(event: MouseEvent) {
      const element = targetFrom(event.target)
      if (!element) return
      event.preventDefault()
      clearTimer()
      suppressClickRef.current = true
      void openMenu(element)
    }

    document.addEventListener("pointerdown", pointerDown, true)
    document.addEventListener("pointermove", pointerMove, true)
    document.addEventListener("pointerup", pointerEnd, true)
    document.addEventListener("pointercancel", pointerEnd, true)
    document.addEventListener("click", clickCapture, true)
    document.addEventListener("contextmenu", contextMenu, true)

    return () => {
      clearTimer()
      document.removeEventListener("pointerdown", pointerDown, true)
      document.removeEventListener("pointermove", pointerMove, true)
      document.removeEventListener("pointerup", pointerEnd, true)
      document.removeEventListener("pointercancel", pointerEnd, true)
      document.removeEventListener("click", clickCapture, true)
      document.removeEventListener("contextmenu", contextMenu, true)
    }
  }, [activeTab, canManage, campaignId, characterMap, members])

  function openItem(item: MenuTarget) {
    setTarget(null)
    firstButton(item.element)?.click()
  }

  function editItem(item: MenuTarget) {
    setTarget(null)

    if (item.kind === "campaign") {
      document.querySelector<HTMLButtonElement>(".world-hero-edit")?.click()
      return
    }

    if (item.kind === "character") {
      const button = Array.from(
        item.element.querySelectorAll<HTMLButtonElement>(
          ".gm-character-actions button",
        ),
      ).find((candidate) => candidate.textContent?.includes("Редактировать"))
      button?.click()
      return
    }

    if (item.kind === "member") {
      item.element.querySelector<HTMLButtonElement>(".member-role-edit")?.click()
      return
    }

    if (item.kind === "achievement" || item.kind === "update") {
      const button = Array.from(
        item.element.querySelectorAll<HTMLButtonElement>("button"),
      ).find((candidate) => candidate.textContent?.includes("Изменить"))
      button?.click()
      return
    }

    if (item.kind === "location-section") {
      const button = Array.from(
        item.element.querySelectorAll<HTMLButtonElement>(".mini-action-row button"),
      ).find((candidate) => candidate.textContent?.includes("Изменить"))
      button?.click()
      return
    }

    firstButton(item.element)?.click()
    window.setTimeout(() => {
      document.querySelector<HTMLButtonElement>(".manage-edit-button")?.click()
    }, 180)
  }

  function startRename(item: MenuTarget) {
    setTarget(null)
    setRenameTarget(item)
    setRenameValue(item.title)
    setError("")
  }

  async function submitRename(event: FormEvent) {
    event.preventDefault()
    if (!renameTarget) return

    const title = renameValue.trim()
    if (!title) {
      setError("Название не может быть пустым.")
      return
    }

    const table = renameTarget.kind === "chat"
      ? "chat_rooms"
      : renameTarget.kind === "art"
        ? "campaign_art_items"
        : null

    if (!table) return

    setBusy(true)
    setError("")
    const { error: updateError } = await db
      .from(table)
      .update({ title })
      .eq("id", renameTarget.id)

    if (updateError) {
      setBusy(false)
      setError(updateError.message)
      return
    }

    setBusy(false)
    setRenameTarget(null)
    window.location.reload()
  }

  async function deleteItem(item: MenuTarget) {
    if (item.fixed) return

    const table =
      item.kind === "character"
        ? "characters"
        : item.kind === "chat"
          ? "chat_rooms"
          : item.kind === "art"
            ? "campaign_art_items"
            : item.kind === "world-section"
              ? "world_sections"
              : item.kind === "world-article"
                ? "world_articles"
                : item.kind === "location"
                  ? "locations"
                  : item.kind === "location-section"
                    ? "location_sections"
                    : item.kind === "achievement"
                      ? "achievements"
                      : item.kind === "update"
                        ? "campaign_updates"
                        : null

    if (!table) return

    setBusy(true)
    setError("")
    const { error: deleteError } = await db
      .from(table)
      .delete()
      .eq("id", item.id)

    if (deleteError) {
      setBusy(false)
      setError(deleteError.message)
      return
    }

    if (item.kind === "art" && item.meta) {
      const marker = "/storage/v1/object/public/campaign-media/"
      const index = item.meta.indexOf(marker)
      if (index >= 0) {
        const objectPath = decodeURIComponent(
          item.meta.slice(index + marker.length).split("?")[0],
        )
        await supabase.storage.from("campaign-media").remove([objectPath])
      }
    }

    setBusy(false)
    setTarget(null)
    window.location.reload()
  }

  function actionsFor(item: MenuTarget): Action[] {
    const actions: Action[] = []

    if (
      item.kind !== "achievement" &&
      item.kind !== "update" &&
      item.kind !== "member" &&
      item.kind !== "location-section"
    ) {
      actions.push({
        label: "Открыть",
        detail: "Обычный короткий переход",
        onClick: () => openItem(item),
      })
    }

    if (item.kind === "chat" || item.kind === "art") {
      if (!item.fixed) {
        actions.push({
          label: "Переименовать",
          detail: item.kind === "chat" ? "Изменить название чата" : "Изменить название арта",
          onClick: () => startRename(item),
        })
      }
    } else {
      actions.push({
        label: item.kind === "member" ? "Изменить роль" : "Редактировать",
        detail: "Открыть редактор",
        onClick: () => editItem(item),
      })
    }

    if (!item.fixed && item.kind !== "member") {
      actions.push({
        label: busy ? "Удаляем…" : "Удалить",
        detail: "Удаление выполняется сразу",
        danger: true,
        disabled: busy,
        onClick: () => void deleteItem(item),
      })
    }

    return actions
  }

  if (!canManage) return null

  return (
    <>
      {error && !target && !renameTarget && (
        <div className="global-action-toast">{error}</div>
      )}

      {target && (
        <div
          className="sheet-backdrop"
          onMouseDown={() => {
            if (!busy) setTarget(null)
          }}
        >
          <div
            className="bottom-sheet global-action-sheet"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" />
            <div className="character-editor-head">
              <div>
                <h3 className="sheet-title">{target.title}</h3>
                <p className="sheet-copy">
                  {target.fixed
                    ? "Закреплённый элемент"
                    : "Действия по долгому нажатию"}
                </p>
              </div>
              <button
                className="sheet-close"
                type="button"
                onClick={() => setTarget(null)}
              >
                ×
              </button>
            </div>

            <div className="global-action-list">
              {actionsFor(target).map((action) => (
                <button
                  type="button"
                  className={
                    action.danger
                      ? "global-action-row global-action-row--danger"
                      : "global-action-row"
                  }
                  key={action.label}
                  disabled={action.disabled}
                  onClick={action.onClick}
                >
                  <span>
                    <strong>{action.label}</strong>
                    {action.detail && <small>{action.detail}</small>}
                  </span>
                  <span>›</span>
                </button>
              ))}
            </div>

            {error && <div className="auth-error">{error}</div>}
          </div>
        </div>
      )}

      {renameTarget && (
        <div
          className="sheet-backdrop"
          onMouseDown={() => {
            if (!busy) setRenameTarget(null)
          }}
        >
          <form
            className="bottom-sheet global-rename-sheet"
            onSubmit={submitRename}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" />
            <div className="character-editor-head">
              <div>
                <h3 className="sheet-title">Переименовать</h3>
                <p className="sheet-copy">{renameTarget.title}</p>
              </div>
              <button
                className="sheet-close"
                type="button"
                onClick={() => setRenameTarget(null)}
              >
                ×
              </button>
            </div>

            <label className="field-label" htmlFor="global-rename-input">
              Новое название
            </label>
            <input
              id="global-rename-input"
              className="app-input"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              maxLength={120}
              autoFocus
            />

            {error && <div className="auth-error">{error}</div>}
            <button className="sheet-save" type="submit" disabled={busy}>
              {busy ? "Сохраняем…" : "Сохранить"}
            </button>
          </form>
        </div>
      )}
    </>
  )
}
