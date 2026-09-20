import type {
  ResolvedAction,
  ResolvedCharacterContract,
  ResolvedSpell,
} from "../character-engine/index.ts"
import { genaSession } from "../game-engine/runtime.ts"
import { inventoryItemIdFromSourceId } from "../inventory-engine/index.ts"
import { resourceCostInputs } from "../lib/resourceRuntime.ts"
import type { SnakeAction } from "../snake-engine/index.ts"
import {
  templateMechanicIdForChatAction,
  templateMechanicIdForSpellAccess,
  templatePaymentOptionKeyForChatAction,
} from "./templateActionRoute.ts"

export type ChatFreeRollRequest = {
  count: number
  sides: number
  modifier: number
}

export type ChatSpellCastSelection = {
  spell: ResolvedSpell
  accessKey: string
  methodKey: string
  optionKey?: string
}

export type ChatGameplayRuntime = {
  roomId: string
  characterId: string | null
  contract: ResolvedCharacterContract | null
}

function templateChoiceEffect(action: ResolvedAction) {
  return action.effects.find((effect) => effect.kind === "template_choice")
}

function success() {
  return { type: "success" as const }
}

export function createFreeRollSnakeAction(
  runtime: ChatGameplayRuntime,
  request: ChatFreeRollRequest,
): SnakeAction {
  const suffix = request.modifier
    ? `${request.modifier > 0 ? "+" : ""}${request.modifier}`
    : ""
  const label = `${request.count}d${request.sides}${suffix}`

  return {
    id: "chat.roll.free",
    label,
    execute: async () => {
      await genaSession.sendRoll({
        roomId: runtime.roomId,
        characterId: runtime.characterId,
        label,
        kind: "Свободный бросок",
        rollD20: false,
        diceCount: request.count,
        diceSides: request.sides,
        diceModifier: request.modifier,
      })
      return success()
    },
  }
}

export function createCheckSnakeAction(
  runtime: ChatGameplayRuntime,
  input: {
    label: string
    modifier: number
    kind: "ability" | "skill" | "save"
  },
): SnakeAction {
  return {
    id: `chat.check.${input.kind}.${input.label}`,
    label: input.label,
    enabled: Boolean(runtime.characterId),
    disabledReason: "Для проверки нужен выбранный персонаж.",
    execute: async () => {
      await genaSession.sendRoll({
        roomId: runtime.roomId,
        characterId: runtime.characterId,
        label: input.label,
        modifier: input.modifier,
        kind: input.kind,
        rollD20: true,
      })
      return success()
    },
  }
}

export function createResolvedActionSnakeAction(
  runtime: ChatGameplayRuntime,
  action: ResolvedAction,
  selectedOptionKey?: string,
): SnakeAction {
  const templateChoice = templateChoiceEffect(action)
  const paymentOption = templatePaymentOptionKeyForChatAction(action)
  const unsupportedMixedChoice = Boolean(templateChoice && action.costOptions.length)
  const ambiguousTemplateChoice = Boolean(templateChoice && !selectedOptionKey)
  const ambiguousPayment = !templateChoice && paymentOption === null && !selectedOptionKey

  return {
    id: `chat.action.${action.stateKey}`,
    label: action.label || action.key,
    enabled:
      Boolean(runtime.characterId) &&
      action.available &&
      !unsupportedMixedChoice &&
      !ambiguousTemplateChoice &&
      !ambiguousPayment,
    disabledReason: !runtime.characterId
      ? "Для действия нужен выбранный персонаж."
      : !action.available
        ? "Действие сейчас недоступно."
        : unsupportedMixedChoice
          ? "Действие требует одновременно выбора эффекта и оплаты."
          : ambiguousTemplateChoice
            ? "Сначала выберите вариант эффекта."
            : ambiguousPayment
              ? "Сначала выберите способ расхода ресурса."
              : undefined,
    execute: async () => {
      const characterId = runtime.characterId
      if (!characterId) throw new Error("Для действия нужен выбранный персонаж.")

      const damage = action.damage[0]
      const mechanicId = templateMechanicIdForChatAction(action)

      if (mechanicId) {
        const optionKey = templateChoice
          ? selectedOptionKey
          : selectedOptionKey ?? paymentOption ?? undefined

        const common = {
          characterId,
          mechanicId,
          ...(optionKey ? { optionKey } : {}),
          label: action.label || action.key,
        }

        if (action.attack || damage?.dice) {
          await genaSession.sendTemplateRoll({
            roomId: runtime.roomId,
            ...common,
            kind: "action",
            modifier: action.attack?.bonus.value || 0,
            rollD20: Boolean(action.attack),
            diceCount: damage?.dice?.count || 0,
            diceSides: damage?.dice?.sides || 0,
            diceModifier: damage?.modifier.value || 0,
          })
        } else {
          await genaSession.sendTemplateAction({
            roomId: runtime.roomId,
            ...common,
            payload: { detail: action.economy, mechanicId },
          })
        }
        return success()
      }

      if (action.costOptions.length) {
        throw new Error("Альтернативная оплата этого действия пока не имеет авторитетного маршрута.")
      }

      const inventoryItemId = action.sources
        .filter((ref) => ref.source.sourceType === "inventory_item")
        .map((ref) => inventoryItemIdFromSourceId(ref.source.id))
        .find((itemId): itemId is string => Boolean(itemId))

      const costs = runtime.contract
        ? resourceCostInputs(runtime.contract, action.resourceCosts)
        : []

      if (inventoryItemId) {
        await genaSession.useInventoryItem({
          roomId: runtime.roomId,
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
        })
        return success()
      }

      if (action.attack || damage?.dice) {
        await genaSession.sendRoll({
          roomId: runtime.roomId,
          characterId,
          label: action.label || action.key,
          kind: "action",
          modifier: action.attack?.bonus.value || 0,
          rollD20: Boolean(action.attack),
          diceCount: damage?.dice?.count || 0,
          diceSides: damage?.dice?.sides || 0,
          diceModifier: damage?.modifier.value || 0,
          resourceCosts: costs,
        })
      } else {
        await genaSession.sendEvent({
          roomId: runtime.roomId,
          characterId,
          eventKind: "action",
          label: action.label || action.key,
          payload: { detail: action.economy },
          resourceCosts: costs,
        })
      }

      return success()
    },
  }
}

export function createResolvedSpellSnakeAction(
  runtime: ChatGameplayRuntime,
  selection: ChatSpellCastSelection,
  modifiers: ResolvedAction[] = [],
): SnakeAction {
  const access = selection.spell.accesses.find((item) => item.key === selection.accessKey)
  const method = access?.methods.find((item) => item.key === selection.methodKey)
  const option = selection.optionKey
    ? method?.resourceOptions.find((item) => item.key === selection.optionKey)
    : undefined
  const label = selection.spell.identity.name

  return {
    id: `chat.spell.${selection.spell.key}.${selection.accessKey}.${selection.methodKey}.${selection.optionKey || "free"}`,
    label,
    enabled: Boolean(
      runtime.characterId &&
      selection.spell.available &&
      access?.available &&
      method?.available &&
      (method.resourceOptions.length === 0 || option?.available),
    ),
    disabledReason: !runtime.characterId
      ? "Для заклинания нужен выбранный персонаж."
      : "Этот способ сотворения сейчас недоступен.",
    execute: async () => {
      const characterId = runtime.characterId
      if (!characterId || !access || !method) {
        throw new Error("Для заклинания нужен доступный персонаж и способ сотворения.")
      }

      const modifierLabels = modifiers.map((action) =>
        (action.label || action.key).replace(/^Метамагия:\s*/u, ""),
      )
      const detail = [
        selection.spell.identity.level
          ? `${selection.spell.identity.level} уровень`
          : "Кантрип",
        option?.castLevel && option.castLevel !== selection.spell.identity.level
          ? `сотворение ${option.castLevel} ур.`
          : "",
        method.attackBonus
          ? `атака ${method.attackBonus.value >= 0 ? "+" : ""}${method.attackBonus.value}`
          : "",
        method.saveDc ? `СЛ ${method.saveDc.value}` : "",
        modifierLabels.length ? `Метамагия: ${modifierLabels.join(" + ")}` : "",
      ].filter(Boolean).join(" · ")

      const mechanicId = templateMechanicIdForSpellAccess(access)

      if (modifiers.length) {
        const modifierMechanicIds = modifiers.map((action) => {
          const id = templateMechanicIdForChatAction(action)
          if (!id) throw new Error("Модификатор заклинания потерял связь с шаблоном класса.")
          return id
        })
        const spellResourceCosts = !mechanicId && runtime.contract && option
          ? resourceCostInputs(runtime.contract, option.costs)
          : []

        await genaSession.sendSpellWithModifiers({
          roomId: runtime.roomId,
          characterId,
          ...(mechanicId
            ? {
                spellMechanicId: mechanicId,
                methodKey: method.key,
                ...(option ? { optionKey: option.key } : {}),
              }
            : { spellResourceCosts }),
          modifierMechanicIds,
          label,
          payload: { detail, spellKey: selection.spell.key },
        })
        return success()
      }

      if (mechanicId) {
        await genaSession.sendTemplateSpell({
          roomId: runtime.roomId,
          characterId,
          mechanicId,
          methodKey: method.key,
          ...(option ? { optionKey: option.key } : {}),
          label,
          payload: { detail, spellKey: selection.spell.key },
        })
        return success()
      }

      const resourceCosts = runtime.contract && option
        ? resourceCostInputs(runtime.contract, option.costs)
        : []

      await genaSession.sendEvent({
        roomId: runtime.roomId,
        characterId,
        eventKind: "spell",
        label,
        payload: { detail, spellKey: selection.spell.key },
        resourceCosts,
      })
      return success()
    },
  }
}
