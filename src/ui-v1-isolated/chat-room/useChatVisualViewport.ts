import { useEffect, useState } from "react"

export function useChatVisualViewportHeight() {
  const [height, setHeight] = useState<number | null>(null)

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    let frame = 0

    const update = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        setHeight(Math.max(280, Math.round(viewport.height)))
      })
    }

    update()
    viewport.addEventListener("resize", update)
    viewport.addEventListener("scroll", update)

    return () => {
      window.cancelAnimationFrame(frame)
      viewport.removeEventListener("resize", update)
      viewport.removeEventListener("scroll", update)
    }
  }, [])

  return height
}
