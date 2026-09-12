import type { HTMLAttributes, ReactNode } from "react"

export type SurfaceTone = "base" | "elevated" | "glass" | "inset" | "quiet"

type Props = HTMLAttributes<HTMLDivElement> & {
  tone?: SurfaceTone
  children?: ReactNode
}

export default function Surface({
  tone = "base",
  className = "",
  children,
  ...props
}: Props) {
  return (
    <div
      {...props}
      className={`mg-surface ${className}`.trim()}
      data-tone={tone}
    >
      {children}
    </div>
  )
}
