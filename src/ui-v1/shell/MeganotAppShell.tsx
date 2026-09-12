import { MotionConfig } from "motion/react"
import type { ReactNode } from "react"

import type { RootSpace } from "../../lib/appRoute"
import LayerHost from "../overlays/LayerHost"
import AppBackdrop from "./AppBackdrop"
import AppScene from "./AppScene"
import MeganotDock from "./MeganotDock"

type Props = {
  children: ReactNode
  activeSpace: RootSpace
  showDock?: boolean
  onNavigate: (space: RootSpace) => void
}

export default function MeganotAppShell({
  children,
  activeSpace,
  showDock = true,
  onNavigate,
}: Props) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="mg-theme mg-shell">
        <LayerHost>
          <AppBackdrop />
          <div className="mg-shell__content">
            <AppScene>{children}</AppScene>
            {showDock && <MeganotDock active={activeSpace} onNavigate={onNavigate} />}
          </div>
        </LayerHost>
      </div>
    </MotionConfig>
  )
}
