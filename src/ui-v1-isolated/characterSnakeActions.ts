import type { MediaPresentation } from "../media/presentation"
import type { SnakeAction, SnakeActionInput } from "../snake-engine"

export type CharacterMediaSlot = "avatar" | "panel_avatar"

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
}: {
  canEditAvatar: boolean
  character: CharacterMediaState
  applyMedia: (
    slot: CharacterMediaSlot,
    input: SnakeActionInput,
  ) => Promise<MutationResult>
}): SnakeAction[] {
  if (!canEditAvatar) return []

  return [
    {
      id: "avatar",
      label: "Аватар",
      kind: "branch",
      group: "identity",
      children: ({ path }) => {
        if (path[path.length - 1]?.id !== "avatar") return []

        return [
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
        ]
      },
    },
  ]
}
