import { useState } from "react"

import type { SnakeAction } from "../snake-engine"
import { SnakeTrigger, useSnake } from "./SnakeProvider"
import { openSourceAction } from "./GMWorkshopCommon"
import {
  createWorkshopCharacterActions,
  createWorkshopPcUnassignAction,
} from "./gmWorkshopSnakeActions"
import {
  useGMWorkshopData,
  type WorkshopMember,
} from "./useGMWorkshopData"

export default function GMWorkshopParty({
  data,
  onOpenCharacter,
}: {
  data: ReturnType<typeof useGMWorkshopData>
  onOpenCharacter: (characterId: string) => void
}) {
  const snake = useSnake()
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const member = data.members.find((item) => item.userId === selectedMemberId) || null

  const publishedPc = data.campaignCharacters.filter(
    (character) => character.characterType === "pc",
  )
  const freePc = publishedPc.filter(
    (character) => !character.assignedUserId && character.lifeState === "alive",
  )

  function assignFree(target: WorkshopMember) {
    const action: SnakeAction = {
      id: "assign-free-pc",
      label: "Назначить свободного PC",
      enabled: freePc.length > 0,
      surface: {
        kind: "picker",
        eyebrow: "Партия",
        title: "Назначить персонажа · " + target.displayName,
        items: freePc.map((character) => ({
          id: character.id,
          label: character.name,
          description: character.characterClass + " · " + character.level,
        })),
        submitLabel: "Назначить",
      },
      execute: async ({ input }) => {
        const characterId =
          typeof input?.selection === "string" ? input.selection : ""
        const response = await data.operations.assignCharacter(
          characterId,
          target.userId,
        )
        return response.ok
          ? {
              type: "success",
              notice: "Персонаж назначен. Активность выбирается отдельно.",
            }
          : {
              type: "error",
              message: response.error || "Не удалось назначить персонажа.",
            }
      },
    }

    openSourceAction(
      snake,
      { type: "campaign-member", id: target.userId },
      action,
    )
  }

  function createInvite() {
    const action: SnakeAction = {
      id: "create-invite",
      label: "Новый код",
      surface: {
        kind: "confirm",
        eyebrow: "Партия",
        title: data.invite ? "Создать новый код?" : "Создать приглашение?",
        body: "Код рассчитан на вход игроков в эту кампанию.",
        confirmLabel: "Создать",
      },
      execute: async () => {
        const response = await data.operations.createInvite()
        if (!response.ok) {
          return {
            type: "error",
            message: response.error || "Не удалось создать приглашение.",
          }
        }

        if (response.code && navigator.clipboard?.writeText) {
          try {
            await navigator.clipboard.writeText(response.code)
          } catch {
            // Код остаётся видимым в разделе Партия.
          }
        }

        return { type: "success", notice: "Код приглашения создан." }
      },
    }

    openSourceAction(
      snake,
      { type: "campaign", id: data.campaignId },
      action,
    )
  }

  if (member) {
    const assigned = publishedPc.filter(
      (character) => character.assignedUserId === member.userId,
    )
    const active =
      assigned.find((character) => character.id === member.activeCharacterId) ||
      null

    return (
      <div className="u1-gm-workshop__section">
        <button
          type="button"
          className="u1-gm-inline-back"
          onClick={() => setSelectedMemberId(null)}
        >
          ← Партия
        </button>

        <section className="u1-gm-member-focus">
          <span>
            {member.isOwner
              ? "Владелец"
              : member.role === "gm"
                ? "GM"
                : "Игрок"}
          </span>
          <h1>{member.displayName}</h1>
          <small>
            {active
              ? "Активный: " + active.name
              : "Активный персонаж не выбран"}
          </small>
        </section>

        <section className="u1-gm-workblock">
          <header>
            <div>
              <span>Персонажи игрока</span>
              <small>{assigned.length}</small>
            </div>
            <button
              type="button"
              disabled={!freePc.length}
              onClick={() => assignFree(member)}
            >
              + Назначить
            </button>
          </header>

          <div className="u1-gm-list">
            {assigned.map((character) => {
              const isActive = member.activeCharacterId === character.id
              const actions = createWorkshopCharacterActions({
                character,
                members: data.members,
                operations: data.operations,
                onOpen: () => onOpenCharacter(character.id),
              })

              return (
                <SnakeTrigger
                  key={character.id}
                  entity={{ type: "character", id: character.id }}
                  actions={actions}
                >
                  <div className="u1-gm-party-character">
                    <button
                      type="button"
                      onClick={() => onOpenCharacter(character.id)}
                    >
                      <strong>{character.name}</strong>
                      <small>
                        {character.lifeState === "dead"
                          ? "Мёртв"
                          : isActive
                            ? "Активный"
                            : character.characterClass + " · " + character.level}
                      </small>
                    </button>

                    {character.lifeState === "alive" && (
                      <button
                        type="button"
                        data-active={isActive || undefined}
                        onClick={() => void data.operations.setActiveCharacter(
                          member.userId,
                          isActive ? null : character.id,
                        )}
                      >
                        {isActive ? "Снять активность" : "Сделать активным"}
                      </button>
                    )}
                  </div>
                </SnakeTrigger>
              )
            })}

            {!assigned.length && (
              <div className="u1-gm-empty">
                Этому игроку ещё не назначен PC.
              </div>
            )}
          </div>
        </section>

        {data.isOwner && !member.isOwner && (
          <section className="u1-gm-workblock u1-gm-workblock--compact">
            <header>
              <div>
                <span>Роль</span>
                <small>{member.role === "gm" ? "GM" : "Игрок"}</small>
              </div>
              <button
                type="button"
                onClick={() => void data.operations.setMemberRole(
                  member.userId,
                  member.role === "gm" ? "player" : "gm",
                )}
              >
                {member.role === "gm" ? "Сделать игроком" : "Сделать GM"}
              </button>
            </header>
          </section>
        )}
      </div>
    )
  }

  return (
    <div className="u1-gm-workshop__section">
      <section className="u1-gm-invite">
        <span>Приглашение</span>
        <strong>{data.invite?.code || "Код не создан"}</strong>
        <small>
          {data.invite
            ? "Осталось " +
              Math.max(0, data.invite.maxUses - data.invite.usesCount) +
              " из " +
              data.invite.maxUses
            : "Создай код и отправь будущему игроку."}
        </small>
        <div>
          {data.invite && (
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(
                data.invite?.code || "",
              )}
            >
              Копировать
            </button>
          )}
          <button type="button" onClick={createInvite}>
            {data.invite ? "Новый код" : "Создать код"}
          </button>
        </div>
      </section>

      <section className="u1-gm-workblock">
        <header>
          <div>
            <span>Все персонажи игроков</span>
            <small>{publishedPc.length}</small>
          </div>
        </header>

        <div className="u1-gm-list">
          {publishedPc.map((character) => {
            const owner = character.assignedUserId
              ? data.members.find((item) => item.userId === character.assignedUserId) || null
              : null
            const isActive = owner?.activeCharacterId === character.id
            const actions = createWorkshopCharacterActions({
              character,
              members: data.members,
              operations: data.operations,
              onOpen: () => onOpenCharacter(character.id),
            })

            return (
              <SnakeTrigger
                key={character.id}
                entity={{ type: "character", id: character.id }}
                actions={actions}
              >
                <div className="u1-gm-party-character">
                  <button
                    type="button"
                    onClick={() => onOpenCharacter(character.id)}
                  >
                    <strong>{character.name}</strong>
                    <small>
                      {owner
                        ? owner.displayName + (isActive ? " · активен" : " · назначен")
                        : "Свободен"}
                      {" · "}
                      {character.characterClass} · {character.level}
                    </small>
                  </button>

                  {owner && (
                    <button
                      type="button"
                      onClick={() => openSourceAction(
                        snake,
                        { type: "character", id: character.id },
                        createWorkshopPcUnassignAction({
                          character,
                          operations: data.operations,
                        }),
                      )}
                    >
                      Отвязать
                    </button>
                  )}
                </div>
              </SnakeTrigger>
            )
          })}

          {!publishedPc.length && (
            <div className="u1-gm-empty">
              В кампанию ещё не отправлен ни один персонаж игрока.
            </div>
          )}
        </div>
      </section>

      <div className="u1-gm-list u1-gm-member-list">
        {data.members.map((item) => {
          const assigned = publishedPc.filter(
            (character) => character.assignedUserId === item.userId,
          )
          const current = assigned.find(
            (character) => character.id === item.activeCharacterId,
          )

          return (
            <button
              type="button"
              className="u1-gm-member-row"
              key={item.userId}
              onClick={() => setSelectedMemberId(item.userId)}
            >
              <span className="u1-gm-member-row__mark">
                {item.displayName.trim().slice(0, 1).toUpperCase() || "?"}
              </span>
              <span>
                <strong>{item.displayName}</strong>
                <small>
                  {(item.isOwner
                    ? "Владелец"
                    : item.role === "gm"
                      ? "GM"
                      : "Игрок") +
                    " · " +
                    (current
                      ? current.name + " · активен"
                      : assigned.length
                        ? assigned.length + " PC · без активного"
                        : "без PC")}
                </small>
              </span>
              <i aria-hidden="true">→</i>
            </button>
          )
        })}
      </div>
    </div>
  )
}
