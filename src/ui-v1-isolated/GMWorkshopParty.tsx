import { useState } from "react"

import { SnakeTrigger, useSnake } from "./SnakeProvider"
import { openSourceAction } from "./GMWorkshopCommon"
import {
  createWorkshopCharacterActions,
  createWorkshopInviteActions,
  createWorkshopMemberActions,
  createWorkshopMemberAssignAction,
  createWorkshopMemberRoleAction,
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
    openSourceAction(
      snake,
      { type: "campaign-member", id: target.userId },
      createWorkshopMemberAssignAction({
        member: target,
        freePc,
        operations: data.operations,
      }),
    )
  }

  const inviteActions = createWorkshopInviteActions({
    invite: data.invite,
    campaignId: data.campaignId,
    operations: data.operations,
  })

  function createInvite() {
    const action = inviteActions.find((item) => item.id === "create-invite")
    if (!action) return
    openSourceAction(
      snake,
      { type: "campaign-invite", id: data.invite?.code || data.campaignId },
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
    const memberActions = createWorkshopMemberActions({
      member,
      characters: data.campaignCharacters,
      operations: data.operations,
      canChangeRole: data.isOwner,
      canRemoveMember: data.isOwner,
      onOpen: () => {},
    })

    return (
      <div className="u1-gm-workshop__section">
        <button
          type="button"
          className="u1-gm-inline-back"
          onClick={() => setSelectedMemberId(null)}
        >
          ← Партия
        </button>

        <SnakeTrigger
          entity={{ type: "campaign-member", id: member.userId }}
          actions={memberActions}
        >
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
        </SnakeTrigger>

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
                templates: data.templates,
                assignments: data.templateAssignments,
                locations: data.locations,
                npcHabitats: data.npcHabitats,
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
                onClick={() => openSourceAction(
                  snake,
                  { type: "campaign-member", id: member.userId },
                  createWorkshopMemberRoleAction({
                    member,
                    operations: data.operations,
                  }),
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
      <SnakeTrigger
        entity={{ type: "campaign-invite", id: data.invite?.code || data.campaignId }}
        actions={inviteActions}
      >
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
      </SnakeTrigger>

      {data.invites.length > 0 && (
        <section className="u1-gm-workblock u1-gm-workblock--compact">
          <header>
            <div>
              <span>История приглашений</span>
              <small>{data.invites.length}</small>
            </div>
          </header>
          <div className="u1-gm-list">
            {data.invites.map((invite) => {
              const expired = Boolean(
                invite.expiresAt &&
                new Date(invite.expiresAt).getTime() <= Date.now()
              )
              const exhausted = invite.usesCount >= invite.maxUses
              const status = invite.revokedAt
                ? "отозван"
                : expired
                  ? "истёк"
                  : exhausted
                    ? "исчерпан"
                    : "активен"
              const actions = createWorkshopInviteActions({
                invite,
                campaignId: data.campaignId,
                operations: data.operations,
              })
              return (
                <SnakeTrigger
                  key={invite.code}
                  entity={{ type: "campaign-invite", id: invite.code }}
                  actions={actions}
                >
                  <button type="button" className="u1-gm-member-row">
                    <span className="u1-gm-member-row__mark">#</span>
                    <span>
                      <strong>{invite.code}</strong>
                      <small>
                        {status} · {invite.usesCount}/{invite.maxUses}
                        {invite.expiresAt
                          ? " · до " + new Date(invite.expiresAt).toLocaleDateString("ru-RU")
                          : ""}
                      </small>
                    </span>
                  </button>
                </SnakeTrigger>
              )
            })}
          </div>
        </section>
      )}

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
              templates: data.templates,
              assignments: data.templateAssignments,
              locations: data.locations,
              npcHabitats: data.npcHabitats,
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

          const memberActions = createWorkshopMemberActions({
            member: item,
            characters: data.campaignCharacters,
            operations: data.operations,
            canChangeRole: data.isOwner,
            onOpen: () => setSelectedMemberId(item.userId),
          })

          return (
            <SnakeTrigger
              key={item.userId}
              entity={{ type: "campaign-member", id: item.userId }}
              actions={memberActions}
            >
              <button
                type="button"
                className="u1-gm-member-row"
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
            </SnakeTrigger>
          )
        })}
      </div>
    </div>
  )
}
