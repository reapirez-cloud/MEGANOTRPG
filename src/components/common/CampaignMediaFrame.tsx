import type { CSSProperties, HTMLAttributes } from "react"

import type { MediaPresentation } from "../../media/presentation"
import { parseMediaPresentation } from "../../media/presentation"
import CampaignImage from "./CampaignImage"

type Props = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  value: string | null | undefined
  presentation?: MediaPresentation | null
  alt?: string
}

export default function CampaignMediaFrame({
  value,
  presentation,
  alt = "",
  style,
  ...props
}: Props) {
  const normalized = parseMediaPresentation(presentation)
  const crop = normalized?.crop

  const rootStyle: CSSProperties = {
    ...style,
    overflow: "hidden",
    ...(normalized?.shape === "circle" ? { borderRadius: "50%" } : {}),
  }

  const imageStyle: CSSProperties = crop
    ? {
        position: "absolute",
        left: `${(-crop.x / crop.width) * 100}%`,
        top: `${(-crop.y / crop.height) * 100}%`,
        width: `${100 / crop.width}%`,
        height: "auto",
        maxWidth: "none",
        maxHeight: "none",
      }
    : {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
      }

  return (
    <span
      {...props}
      style={rootStyle}
      data-media-presentation={normalized ? "true" : undefined}
      data-media-shape={normalized?.shape}
    >
      <CampaignImage
        value={value}
        alt={alt}
        draggable={false}
        style={imageStyle}
      />
    </span>
  )
}
