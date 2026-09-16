import type { MediaPresentation } from "../media/presentation"
import type { SnakeAction, SnakeActionInput } from "../snake-engine"

export type CharacterMediaSlot = "avatar" | "panel_avatar" | "sheet_hero"

type CharacterMediaState = {
  id: string
  name: string
  avatarUrl: string | null
  avatarSource: string | null
  avatarAssetId: string | null
  avatarPresentation: MediaPresentation | null
  panelAvatarUrl: string | null
  panelAvatarSource: string | null
  panelAvatarAssetId: string | null
  panelAvatarPresentation: MediaPresentation | null
  sheetHeroUrl: string | null
  sheetHeroSource: string | null
  sheetHeroAssetId: string | null
  sheetHeroPresentation: MediaPresentation | null
}

type MutationResult = { ok: boolean; error?: string }

function mediaItem(
  id: string,
  src: string | null,
  assetId: string | null,
  storagePath: string | null,
  title: string,
) {
  if (!src) return []

  return [{
    id,
    src,
    title,
    facts: {
      assetId,
      storagePath,
    },
  }]
}

function result(response: MutationResult, notice: string) {
  return response.ok
    ? { type: "success" as const, notice }
    : {
        type: "error" as const,
        message: response.error || "Не удалось сохранить изображение.",
      }
}

export function createCharacterSnakeActions({
  canEditAvatar,
  character,
  applyMedia,
  resetMedia,
}: {
  canEditAvatar: boolean
  character: CharacterMediaState
  applyMedia: (
    slot: CharacterMediaSlot,
    input: SnakeActionInput,
  ) => Promise<MutationResult>
  resetMedia?: (
    slot: CharacterMediaSlot,
  ) => Promise<MutationResult>
}): SnakeAction[] {
  if (!canEditAvatar) return []

  function resetAction(
    slot: CharacterMediaSlot,
    id: string,
    label: string,
    title: string,
    notice: string,
  ): SnakeAction | null {
    if (!resetMedia) return null

    const hasDedicatedAsset =
      slot === "avatar"
        ? Boolean(character.avatarAssetId)
        : slot === "panel_avatar"
          ? Boolean(character.panelAvatarAssetId)
          : Boolean(character.sheetHeroAssetId)

    if (!hasDedicatedAsset) return null

    return {
      id,
      label,
      tone: "danger",
      surface: {
        kind: "confirm",
        eyebrow: "Персонаж · графика",
        title,
        body:
          "Пользовательская привязка будет снята. Лист вернётся к следующему доступному встроенному или унаследованному изображению.",
        confirmLabel: "Сбросить",
        cancelLabel: "Отмена",
      },
      execute: async ({ input }) => {
        if (input?.confirmed !== true) {
          return {
            type: "error" as const,
            message: "Сброс не подтверждён.",
          }
        }
        return result(await resetMedia(slot), notice)
      },
    }
  }

  return [
    {
      id: "avatar",
      label: "Аватар",
      kind: "branch",
      group: "identity",
      children: ({ path }) => {
        if (path[path.length - 1]?.id !== "avatar") return []

        const actions: SnakeAction[] = [
          {
            id: "character-avatar",
            label: "Аватар персонажа",
            surface: {
              kind: "media",
              eyebrow: "Персонаж · графика",
              title: "Аватар персонажа",
              items: mediaItem(
                "character-avatar",
                character.avatarUrl,
                character.avatarAssetId,
                character.avatarSource,
                character.name,
              ),
              compose: {
                label: "Круглый аватар · 1:1",
                shape: "circle",
                aspectRatio: 1,
                allowFilePick: true,
                fileLabel: "Другое изображение",
                submitLabel: "Установить аватар",
                initialPresentation: character.avatarPresentation,
              },
            },
            execute: async ({ input }) =>
              result(
                await applyMedia("avatar", input),
                "Аватар персонажа обновлён.",
              ),
          },
          {
            id: "panel-avatar",
            label: "Аватар панели",
            surface: {
              kind: "media",
              eyebrow: "Персонаж · графика",
              title: "Аватар панели",
              items: mediaItem(
                "panel-avatar",
                character.panelAvatarUrl || character.avatarUrl,
                character.panelAvatarAssetId || character.avatarAssetId,
                character.panelAvatarSource || character.avatarSource,
                character.name,
              ),
              compose: {
                label: "Панель персонажа · 3:1",
                shape: "rect",
                aspectRatio: 3,
                allowFilePick: true,
                fileLabel: "Другое изображение",
                submitLabel: "Установить на панель",
                initialPresentation: character.panelAvatarPresentation,
              },
            },
            execute: async ({ input }) =>
              result(
                await applyMedia("panel_avatar", input),
                "Аватар панели обновлён.",
              ),
          },
          {
            id: "sheet-hero",
            label: "Арт листа",
            surface: {
              kind: "media",
              eyebrow: "Персонаж · графика",
              title: "Арт листа",
              items: mediaItem(
                "sheet-hero",
                character.sheetHeroUrl ||
                  character.panelAvatarUrl ||
                  character.avatarUrl,
                character.sheetHeroAssetId ||
                  character.panelAvatarAssetId ||
                  character.avatarAssetId,
                character.sheetHeroSource ||
                  character.panelAvatarSource ||
                  character.avatarSource,
                character.name,
              ),
              compose: {
                label: "Лист персонажа · 16:9",
                shape: "rect",
                aspectRatio: 16 / 9,
                allowFilePick: true,
                fileLabel: "Другое изображение",
                submitLabel: "Установить на лист",
                initialPresentation: character.sheetHeroAssetId
                  ? character.sheetHeroPresentation
                  : null,
              },
            },
            execute: async ({ input }) =>
              result(
                await applyMedia("sheet_hero", input),
                "Арт листа обновлён.",
              ),
          },
        ]

        const resets = [
          resetAction(
            "avatar",
            "reset-character-avatar",
            "Сбросить аватар персонажа",
            "Сбросить аватар персонажа",
            "Аватар персонажа сброшен.",
          ),
          resetAction(
            "panel_avatar",
            "reset-panel-avatar",
            "Сбросить аватар панели",
            "Сбросить аватар панели",
            "Панель вернулась к аватару персонажа.",
          ),
          resetAction(
            "sheet_hero",
            "reset-sheet-hero",
            "Сбросить арт листа",
            "Сбросить арт листа",
            "Арт листа вернулся к панели или аватару.",
          ),
        ].filter((action): action is SnakeAction => Boolean(action))

        return [...actions, ...resets]
      },
    },
  ]
}
