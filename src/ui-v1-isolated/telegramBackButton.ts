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

export function bindTelegramBackButton(
  onBack: () => void,
  host: TelegramBackButtonHost =
    window as unknown as TelegramBackButtonHost,
) {
  const backButton = host.Telegram?.WebApp?.BackButton
  if (!backButton?.onClick) return () => {}

  backButton.onClick(onBack)
  backButton.show?.()

  return () => {
    backButton.offClick?.(onBack)
    backButton.hide?.()
  }
}
