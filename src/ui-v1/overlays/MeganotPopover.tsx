import * as Popover from "@radix-ui/react-popover"
import type { ReactNode } from "react"

import { useLayerHost } from "./LayerHost"

type Props = {
  trigger: ReactNode
  children: ReactNode
  align?: "start" | "center" | "end"
  sideOffset?: number
}

export default function MeganotPopover({
  trigger,
  children,
  align = "end",
  sideOffset = 8,
}: Props) {
  const container = useLayerHost()

  return (
    <Popover.Root>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal container={container ?? undefined}>
        <Popover.Content
          className="mg-popover"
          align={align}
          sideOffset={sideOffset}
          collisionPadding={12}
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
