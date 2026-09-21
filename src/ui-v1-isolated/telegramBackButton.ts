type TelegramBackButton = {
  show?: () => void
  hide?: () => void
  onClick?: (callback: () => void) => void
  offClick?: (callback: () => void) => void
}

type TelegramBackButtonHost = {
  Telegram?: {
    WebApp?: {
      BackButton?: TelegramBackButton
    }
  }
}

type BackBinding = {
  id: number
  priority: number
  onBack: () => void
}

type BackRegistry = {
  bindings: BackBinding[]
  dispatcher: () => void
}

const registries = new WeakMap<object, BackRegistry>()
let nextBindingId = 1

function registryFor(backButton: TelegramBackButton) {
  const key = backButton as object
  const existing = registries.get(key)
  if (existing) return existing

  const registry: BackRegistry = {
    bindings: [],
    dispatcher: () => {
      const winner = [...registry.bindings].sort(
        (left, right) =>
          right.priority - left.priority ||
          right.id - left.id,
      )[0]

      winner?.onBack()
    },
  }

  backButton.onClick?.(registry.dispatcher)
  registries.set(key, registry)
  return registry
}

export function bindTelegramBackButton(
  onBack: () => void,
  {
    priority = 0,
    host = window as unknown as TelegramBackButtonHost,
  }: {
    priority?: number
    host?: TelegramBackButtonHost
  } = {},
) {
  const backButton = host.Telegram?.WebApp?.BackButton
  if (!backButton?.onClick) return () => {}

  const registry = registryFor(backButton)
  const binding: BackBinding = {
    id: nextBindingId++,
    priority,
    onBack,
  }

  registry.bindings.push(binding)
  backButton.show?.()

  return () => {
    const index = registry.bindings.findIndex((item) => item.id === binding.id)
    if (index >= 0) registry.bindings.splice(index, 1)

    // Keep Telegram BackButton visible. Hiding it gives Android Back back to
    // Telegram/WebView, which may minimize or close the Mini App.
  }
}
