import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import type { ReactNode } from "react"

import { useLayerHost } from "./LayerHost"

export type MeganotMenuItem = {
  id: string
  label: string
  detail?: string
  danger?: boolean
  disabled?: boolean
  onSelect?: () => void
}

type Props = {
  trigger: ReactNode
  items: MeganotMenuItem[]
  align?: "start" | "center" | "end"
  sideOffset?: number
}

export default function MeganotMenu({
  trigger,
  items,
  align = "end",
  sideOffset = 8,
}: Props) {
  const container = useLayerHost()

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal container={container ?? undefined}>
        <DropdownMenu.Content
          className="mg-menu"
          align={align}
          sideOffset={sideOffset}
          collisionPadding={12}
          loop
        >
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.id}
              className="mg-menu__item"
              data-danger={item.danger ? "true" : undefined}
              disabled={item.disabled}
              onSelect={() => item.onSelect?.()}
            >
              <span className="mg-menu__label">{item.label}</span>
              {item.detail && <span className="mg-menu__detail">{item.detail}</span>}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
