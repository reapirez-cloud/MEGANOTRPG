import type { CSSProperties, ReactNode } from "react"

import Pressable from "../primitives/Pressable"

export type SectionPreviewSize = "hero" | "wide" | "compact"

type Props = {
  title: string
  meta?: string
  imageUrl?: string | null
  size?: SectionPreviewSize
  onClick: () => void
  children?: ReactNode
  className?: string
}

export default function SectionPreview({
  title,
  meta,
  imageUrl,
  size = "compact",
  onClick,
  children,
  className = "",
}: Props) {
  const style = imageUrl
    ? ({ "--mg-section-image": `url("${imageUrl.replaceAll('"', "%22")}")` } as CSSProperties)
    : undefined

  return (
    <Pressable
      type="button"
      className={`mg-section-preview mg-section-preview--${size} ${className}`.trim()}
      data-has-image={imageUrl ? "true" : "false"}
      onClick={onClick}
      style={style}
    >
      <span className="mg-section-preview__media" aria-hidden="true" />
      <span className="mg-section-preview__scrim" aria-hidden="true" />
      <span className="mg-section-preview__content">
        <strong>{title}</strong>
        {meta && <small>{meta}</small>}
        {children}
      </span>
    </Pressable>
  )
}
