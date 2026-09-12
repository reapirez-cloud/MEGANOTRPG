import * as Tooltip from "@radix-ui/react-tooltip"
import type { ReactNode } from "react"

import { useLayerHost } from "./LayerHost"

type Props = {
  label: string
  children: ReactNode
}

export default function MeganotTooltip({ label, children }: Props) {
  const container = useLayerHost()

  return (
    <Tooltip.Provider delayDuration={450}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal container={container ?? undefined}>
          <Tooltip.Content className="mg-tooltip" sideOffset={6}>
            {label}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
