import { useEffect, useMemo, useState } from "react"

import {
  resolveBonusDamageDiceSacrifice,
  resolveD20Floor,
  resolveD20ResultOverride,
  resolveSemanticDieRoll,
  type ResolvedAction,
  type ResolvedSpell,
} from "../../character-engine/index.ts"
import ChatActionPanel, {
  type FreeDiceRequest,
} from "./ChatActionPanel"
import ChatSpellModifierPanel from "./ChatSpellModifierPanel"
import {
  templateMechanicIdForChatAction,
  templateMechanicIdForSpellAccess,
  templatePaymentOptionKeyForChatAction,
} from "../../components/chat/chatTemplateActionRoute.ts"
import type { Character } from "../../context/CharacterContext.tsx"
import {
  playerTurnSlotForEconomy,
  playerTurnSlotForSpell,
  type PlayerTurnEntry,
  type PlayerTurnSlot,
} from "./playerTurnQueue"
import { genaSession } from "../../game-engine/runtime.ts"
import { inventoryItemIdFromSourceId } from "../../inventory-engine/index.ts"
import { useResolvedCharacterRuntime } from "../../hooks/useResolvedCharacterRuntime.ts"
import { supabase } from "../../lib/supabase"
import { resourceCostInputs } from "../../lib/resourceRuntime.ts"
import {
  CHAT_MESSAGE_SENT_EVENT,
  type ChatActionLauncherMode,
  type ChatRoomShellModel,
} from "./chatRoomContracts"

const CHARACTER_FIELDS =
  "id, campaign_id, assigned_user_id, name, character_class, level, bio, avatar_url, character_type, visibility, visibility_mode, publication_state, life_state, died_at, created_by, created_at, updated_at"

function useActionCharacter(
  campaignId: string,
  characterId: string | null,
) {
  const [character, setCharacter] = useState<Character | null>(null)
  const [loading, setLoading] = useState(Boolean(characterId))

  useEffect(() => {
    let cancelled = false

    if (!characterId) {
      setCharacter(null)
      setLoading(false)
      return () => {
        cancelled = true
      }
    }

    setLoading(true)
    void supabase
      .from("characters")
      .select(CHARACTER_FIELDS)
      .eq("campaign_id", campaignId)
      .eq("id", characterId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setCharacter((data as Character | null) || null)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [campaignId, characterId])

  return { character, loading }
}

export default function ChatActionHost({
  model,
  mode,
  characterId,
  speakerName,
  queuePlayerTurn = false,
  onQueueTurnEntry,
  onClose,
}: {
  model: ChatRoomShellModel
  mode: ChatActionLauncherMode
  characterId: string | null
  speakerName: string | null
  queuePlayerTurn?: boolean
  onQueueTurnEntry?: (
    entry: PlayerTurnEntry,
    slot: PlayerTurnSlot,
  ) => void | Promise<void>
  onClose: () => void
}) {
  const actor = useActionCharacter(model.viewer.campaignId, characterId)
  const resolved = useResolvedCharacterRuntime(actor.character)
  const modifierActions = useMemo(
    () =>
      (resolved.contract?.actions || []).filter((action) =>
        action.tags.includes("spell_modifier"),
      ),
    [resolved.contract],
  )
  const [pendingModifiedSpell, setPendingModifiedSpell] =
    useState<ResolvedSpell | null>(null)
  const [commandBusy, setCommandBusy] = useState(false)

  function announce(messageId: number) {
    window.dispatchEvent(
      new CustomEvent(CHAT_MESSAGE_SENT_EVENT, {
        detail: { roomId: model.roomId, messageId },
      }),
    )
  }

  async function command(execute: () => Promise<number>) {
    if (commandBusy) {
      throw new Error("Предыдущее действие ещё выполняется.")
    }

    setCommandBusy(true)
    try {
      const messageId = await execute()
      announce(messageId)
      return true
    } finally {
      setCommandBusy(false)
    }
  }

  async function queueTurnEntry(
    entry: PlayerTurnEntry,
    slot: PlayerTurnSlot,
  ) {
    if (!queuePlayerTurn || !onQueueTurnEntry) return false
    if (commandBusy) {
      throw new Error("Предыдущее действие ещё добавляется.")
    }

    setCommandBusy(true)
    try {
      await onQueueTurnEntry(entry, slot)
      onClose()
      return true
    } finally {
      setCommandBusy(false)
    }
  }

  async function queueSpellTurnEntry(
    entry: PlayerTurnEntry,
    spellKey: string,
  ) {
    if (!queuePlayerTurn || !onQueueTurnEntry) return false
    const slot = await playerTurnSlotForSpell(spellKey)
    return queueTurnEntry({ ...entry, economy: slot }, slot)
  }

  async function freeRoll(request: FreeDiceRequest) {
    const modifier = request.modifier
      ? (request.modifier > 0 ? "+" : "") + request.modifier
      : ""

    return command(() =>
      genaSession.sendRoll({
        roomId: model.roomId,
        characterId,
        label: request.count + "d" + request.sides + modifier,
        kind: "Свободный бросок",
        rollD20: false,
        diceCount: request.count,
        diceSides: request.sides,
        diceModifier: request.modifier,
      }),
    )
  }

  async function rollCheck(
    label: string,
    modifier: number,
    kind: "ability" | "skill" | "save",
    context?: { key?: string; proficiencyRank?: number },
  ) {
    const d20Floor = resolved.contract
      ? resolveD20Floor(resolved.contract, {
          kind,
          key: context?.key,
          proficiencyRank: context?.proficiencyRank,
        })?.minimum
      : undefined

    await command(() =>
      genaSession.sendRoll({
        roomId: model.roomId,
        characterId,
        label,
        modifier,
        kind,
        rollD20: true,
        ...(d20Floor ? { d20Floor } : {}),
      }),
    )
    onClose()
  }

  async function runAction(
    action: ResolvedAction,
    actionOptionKey?: string,
  ) {
    if (!characterId) {
      throw new Error("Для этого действия нужен выбранный персонаж.")
    }

    const damage = action.damage[0]
    const bonusDice = resolved.contract
      ? resolveBonusDamageDiceSacrifice(action, resolved.contract.values)
      : null
    const d20Override = resolveD20ResultOverride(action)
    const semanticDie = resolved.contract
      ? resolveSemanticDieRoll(action, resolved.contract.values)
      : null
    const mechanicId = templateMechanicIdForChatAction(action)

    if (mechanicId) {
      const templateChoice = action.effects.find(
        (effect) => effect.kind === "template_choice",
      )
      if (templateChoice && !actionOptionKey) {
        throw new Error("Сначала выбери новый вариант.")
      }

      const paymentOptionKey = templatePaymentOptionKeyForChatAction(action)
      if (paymentOptionKey === null) {
        throw new Error(
          "У действия несколько способов оплаты. Сначала выбери расход ресурса.",
        )
      }
      if (actionOptionKey && action.costOptions.length) {
        throw new Error(
          "Одновременно выбрать эффект и способ оплаты пока нельзя.",
        )
      }

      const optionKey = actionOptionKey ?? paymentOptionKey
      const common = {
        roomId: model.roomId,
        characterId,
        mechanicId,
        ...(optionKey ? { optionKey } : {}),
        label: action.label || action.key,
      }

      const rolls = Boolean(
        action.attack || damage?.dice || bonusDice || semanticDie,
      )
      const entry: PlayerTurnEntry = rolls
        ? {
            kind: "template_roll",
            label: action.label || action.key,
            economy: action.economy,
            mechanicId,
            ...(optionKey ? { optionKey } : {}),
            rollKind: "action",
            modifier: action.attack?.bonus.value || 0,
            rollD20: Boolean(action.attack),
            diceCount:
              damage?.dice?.count ??
              bonusDice?.remainingDice ??
              semanticDie?.count ??
              0,
            diceSides:
              damage?.dice?.sides ??
              bonusDice?.dieSides ??
              semanticDie?.sides ??
              0,
            diceModifier:
              damage?.modifier.value ??
              semanticDie?.modifier ??
              0,
          }
        : {
            kind: "template_action",
            label: action.label || action.key,
            economy: action.economy,
            mechanicId,
            ...(optionKey ? { optionKey } : {}),
            payload: d20Override
              ? {
                  detail: `Результат d20 становится ${d20Override.result}`,
                  mechanicId,
                  d20ResultOverride: d20Override.result,
                  ...(d20Override.trigger
                    ? { trigger: d20Override.trigger }
                    : {}),
                }
              : { detail: action.economy, mechanicId },
          }

      if (
        await queueTurnEntry(
          entry,
          playerTurnSlotForEconomy(action.economy),
        )
      ) {
        return
      }

      await command(() =>
        rolls
          ? genaSession.sendTemplateRoll({
              ...common,
              kind: "action",
              modifier: action.attack?.bonus.value || 0,
              rollD20: Boolean(action.attack),
              diceCount:
                damage?.dice?.count ??
                bonusDice?.remainingDice ??
                semanticDie?.count ??
                0,
              diceSides:
                damage?.dice?.sides ??
                bonusDice?.dieSides ??
                semanticDie?.sides ??
                0,
              diceModifier:
                damage?.modifier.value ??
                semanticDie?.modifier ??
                0,
            })
          : genaSession.sendTemplateAction({
              ...common,
              payload: d20Override
                ? {
                    detail: `Результат d20 становится ${d20Override.result}`,
                    mechanicId,
                    d20ResultOverride: d20Override.result,
                    ...(d20Override.trigger
                      ? { trigger: d20Override.trigger }
                      : {}),
                  }
                : { detail: action.economy, mechanicId },
            }),
      )

      resolved.refresh()
      onClose()
      return
    }

    const inventoryItemId = action.sources
      .filter((ref) => ref.source.sourceType === "inventory_item")
      .map((ref) => inventoryItemIdFromSourceId(ref.source.id))
      .find((itemId): itemId is string => Boolean(itemId))

    if (inventoryItemId) {
      const contract = resolved.contract
      const costs = contract
        ? resourceCostInputs(contract, action.resourceCosts)
        : []

      const inventoryRolls =
        Boolean(action.attack) || Boolean(damage?.dice)
      if (
        await queueTurnEntry(
          {
            kind: inventoryRolls ? "inventory_roll" : "inventory_event",
            label: action.label || action.key,
            economy: action.economy,
            itemId: inventoryItemId,
            itemAmount: 1,
            rollKind: "action",
            modifier: action.attack?.bonus.value || 0,
            rollD20: Boolean(action.attack),
            diceCount: damage?.dice?.count || 0,
            diceSides: damage?.dice?.sides || 0,
            diceModifier: damage?.modifier.value || 0,
            resourceCosts: costs,
            payload: { detail: action.economy },
          },
          playerTurnSlotForEconomy(action.economy),
        )
      ) {
        return
      }

      await command(() =>
        genaSession.useInventoryItem({
          roomId: model.roomId,
          characterId,
          itemId: inventoryItemId,
          label: action.label || action.key,
          kind: "action",
          modifier: action.attack?.bonus.value || 0,
          rollD20: Boolean(action.attack),
          diceCount: damage?.dice?.count || 0,
          diceSides: damage?.dice?.sides || 0,
          diceModifier: damage?.modifier.value || 0,
          resourceCosts: costs,
          payload: { detail: action.economy },
        }),
      )

      resolved.refresh()
      onClose()
      return
    }

    const contract = resolved.contract
    const costs = contract
      ? resourceCostInputs(contract, action.resourceCosts)
      : []

    const rawRolls = Boolean(
      action.attack || damage?.dice || bonusDice || semanticDie,
    )
    const rawEntry: PlayerTurnEntry = rawRolls
      ? {
          kind: "raw_roll",
          label: action.label || action.key,
          economy: action.economy,
          rollKind: "action",
          modifier: action.attack?.bonus.value || 0,
          rollD20: Boolean(action.attack),
          diceCount:
            damage?.dice?.count ??
            bonusDice?.remainingDice ??
            semanticDie?.count ??
            0,
          diceSides:
            damage?.dice?.sides ??
            bonusDice?.dieSides ??
            semanticDie?.sides ??
            0,
          diceModifier:
            damage?.modifier.value ??
            semanticDie?.modifier ??
            0,
          resourceCosts: costs,
        }
      : {
          kind: "raw_event",
          label: action.label || action.key,
          economy: action.economy,
          eventKind: "action",
          payload: { detail: action.economy },
          resourceCosts: costs,
        }

    if (
      await queueTurnEntry(
        rawEntry,
        playerTurnSlotForEconomy(action.economy),
      )
    ) {
      return
    }

    await command(() =>
      action.attack || damage?.dice || bonusDice || semanticDie
        ? genaSession.sendRoll({
            roomId: model.roomId,
            characterId,
            label: action.label || action.key,
            kind: "action",
            modifier: action.attack?.bonus.value || 0,
            rollD20: Boolean(action.attack),
            diceCount:
              damage?.dice?.count ??
              bonusDice?.remainingDice ??
              semanticDie?.count ??
              0,
            diceSides:
              damage?.dice?.sides ??
              bonusDice?.dieSides ??
              semanticDie?.sides ??
              0,
            diceModifier:
              damage?.modifier.value ??
              semanticDie?.modifier ??
              0,
            resourceCosts: costs,
          })
        : genaSession.sendEvent({
            roomId: model.roomId,
            characterId,
            eventKind: "action",
            label: action.label || action.key,
            payload: { detail: action.economy },
            resourceCosts: costs,
          }),
    )

    resolved.refresh()
    onClose()
  }

  async function executeSpell(
    spell: ResolvedSpell,
    modifiers: ResolvedAction[] = [],
  ) {
    if (!characterId) {
      throw new Error("Для заклинания нужен выбранный персонаж.")
    }

    const access =
      spell.accesses.find((item) => item.available) || spell.accesses[0]
    const method =
      access?.methods.find((item) => item.available) || access?.methods[0]
    const option =
      method?.resourceOptions.find((item) => item.available) ||
      method?.resourceOptions[0]

    if (!access || !method) {
      throw new Error("У заклинания нет доступного способа сотворения.")
    }

    const modifierLabels = modifiers.map((action) =>
      (action.label || action.key).replace(/^Метамагия:\s*/u, ""),
    )
    const detail = [
      spell.identity.level ? spell.identity.level + " уровень" : "Кантрип",
      option?.castLevel && option.castLevel !== spell.identity.level
        ? "ячейка " + option.castLevel + " ур."
        : "",
      method.attackBonus
        ? "атака " +
          (method.attackBonus.value >= 0 ? "+" : "") +
          method.attackBonus.value
        : "",
      method.saveDc ? "СЛ " + method.saveDc.value : "",
      modifierLabels.length
        ? "Метамагия: " + modifierLabels.join(" + ")
        : "",
    ]
      .filter(Boolean)
      .join(" · ")

    const mechanicId = templateMechanicIdForSpellAccess(access)

    if (modifiers.length) {
      const modifierMechanicIds = modifiers.map((action) => {
        const id = templateMechanicIdForChatAction(action)
        if (!id) {
          throw new Error(
            "Модификатор заклинания потерял связь с шаблоном класса.",
          )
        }
        return id
      })

      const contract = resolved.contract
      const costs =
        !mechanicId && contract && option
          ? resourceCostInputs(contract, option.costs)
          : []

      if (
        await queueSpellTurnEntry(
          {
            kind: "spell_with_modifiers",
            label: spell.identity.name,
            ...(mechanicId
              ? {
                  spellMechanicId: mechanicId,
                  methodKey: method.key,
                  ...(option ? { optionKey: option.key } : {}),
                }
              : {
                  spellResourceCosts: costs,
                }),
            modifierMechanicIds,
            payload: { detail, spellKey: spell.key },
          },
          spell.key,
        )
      ) {
        return true
      }

      await command(() =>
        genaSession.sendSpellWithModifiers({
          roomId: model.roomId,
          characterId,
          ...(mechanicId
            ? {
                spellMechanicId: mechanicId,
                methodKey: method.key,
                ...(option ? { optionKey: option.key } : {}),
              }
            : {
                spellResourceCosts: costs,
              }),
          modifierMechanicIds,
          label: spell.identity.name,
          payload: { detail, spellKey: spell.key },
        }),
      )

      resolved.refresh()
      onClose()
      return true
    }

    if (mechanicId) {
      if (
        await queueSpellTurnEntry(
          {
            kind: "template_spell",
            label: spell.identity.name,
            mechanicId,
            methodKey: method.key,
            ...(option ? { optionKey: option.key } : {}),
            payload: { detail, spellKey: spell.key },
          },
          spell.key,
        )
      ) {
        return true
      }

      await command(() =>
        genaSession.sendTemplateSpell({
          roomId: model.roomId,
          characterId,
          mechanicId,
          methodKey: method.key,
          ...(option ? { optionKey: option.key } : {}),
          label: spell.identity.name,
          payload: { detail, spellKey: spell.key },
        }),
      )
    } else {
      const contract = resolved.contract
      const costs =
        contract && option ? resourceCostInputs(contract, option.costs) : []

      if (
        await queueSpellTurnEntry(
          {
            kind: "raw_event",
            label: spell.identity.name,
            eventKind: "spell",
            payload: { detail, spellKey: spell.key },
            resourceCosts: costs,
          },
          spell.key,
        )
      ) {
        return true
      }

      await command(() =>
        genaSession.sendEvent({
          roomId: model.roomId,
          characterId,
          eventKind: "spell",
          label: spell.identity.name,
          payload: { detail, spellKey: spell.key },
          resourceCosts: costs,
        }),
      )
    }

    resolved.refresh()
    onClose()
    return true
  }

  async function castSpell(spell: ResolvedSpell) {
    if (modifierActions.length) {
      setPendingModifiedSpell(spell)
      return
    }
    await executeSpell(spell)
  }

  if (pendingModifiedSpell) {
    return (
      <ChatSpellModifierPanel
        spell={pendingModifiedSpell}
        modifierActions={modifierActions}
        busy={commandBusy}
        onClose={() => setPendingModifiedSpell(null)}
        onCast={async (modifiers) => {
          await executeSpell(pendingModifiedSpell, modifiers)
          setPendingModifiedSpell(null)
        }}
      />
    )
  }

  return (
    <ChatActionPanel
      key={mode}
      mode={mode}
      characterName={actor.character?.name || speakerName}
      contract={resolved.contract}
      loading={Boolean(characterId) && (actor.loading || resolved.loading)}
      includePrivateSources={model.canManage}
      onClose={onClose}
      onFreeRoll={freeRoll}
      onCheck={rollCheck}
      onAction={runAction}
      onSpell={castSpell}
    />
  )
}
