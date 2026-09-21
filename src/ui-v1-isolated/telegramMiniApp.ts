export const TELEGRAM_SAFE_AREA_EVENT = "meganot:telegram-safe-area"

type TelegramInset = {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

type TelegramMiniApp = {
  ready?: () => void
  expand?: () => void
  disableVerticalSwipes?: () => void
  contentSafeAreaInset?: TelegramInset
  safeAreaInset?: TelegramInset
  onEvent?: (event: string, callback: () => void) => void
  offEvent?: (event: string, callback: () => void) => void
}

type TelegramMiniAppHost = Window & {
  Telegram?: {
    WebApp?: TelegramMiniApp
  }
}

function finiteInset(value: number | undefined) {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : 0
}

function syncTelegramSafeArea(webApp: TelegramMiniApp) {
  const contentTop = finiteInset(webApp.contentSafeAreaInset?.top)
  const safeTop = finiteInset(webApp.safeAreaInset?.top)
  const top = Math.max(contentTop, safeTop)

  document.documentElement.style.setProperty(
    "--u1-telegram-content-safe-top",
    `${top}px`,
  )
  window.dispatchEvent(new Event(TELEGRAM_SAFE_AREA_EVENT))
}

export function initializeTelegramMiniApp(
  host: TelegramMiniAppHost = window as TelegramMiniAppHost,
) {
  const webApp = host.Telegram?.WebApp
  if (!webApp) return () => {}

  webApp.ready?.()
  webApp.expand?.()
  webApp.disableVerticalSwipes?.()

  const sync = () => syncTelegramSafeArea(webApp)
  sync()

  const events = [
    "safeAreaChanged",
    "contentSafeAreaChanged",
    "viewportChanged",
  ]

  for (const event of events) webApp.onEvent?.(event, sync)

  return () => {
    for (const event of events) webApp.offEvent?.(event, sync)
  }
}
