import * as Dialog from "@radix-ui/react-dialog"
import { AnimatePresence, motion } from "motion/react"
import type { ReactNode } from "react"

import { mgMotion, mgOverlayVariants } from "../motion/presets"
import { useLayerHost } from "./LayerHost"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}

export default function MeganotDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: Props) {
  const container = useLayerHost()

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount container={container ?? undefined}>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="mg-dialog-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: mgMotion.duration.fast }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount>
              <motion.section
                className="mg-dialog"
                role="dialog"
                initial="closed"
                animate="open"
                exit="closed"
                variants={mgOverlayVariants}
              >
                <header className="mg-dialog__header">
                  <div>
                    <Dialog.Title className="mg-type-heading mg-dialog__title">
                      {title}
                    </Dialog.Title>
                    {description && (
                      <Dialog.Description className="mg-type-body mg-dialog__description">
                        {description}
                      </Dialog.Description>
                    )}
                  </div>
                  <Dialog.Close className="mg-dialog__close mg-focusable" aria-label="Закрыть">
                    ×
                  </Dialog.Close>
                </header>
                <div className="mg-dialog__body">{children}</div>
                {footer && <footer className="mg-dialog__footer">{footer}</footer>}
              </motion.section>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
