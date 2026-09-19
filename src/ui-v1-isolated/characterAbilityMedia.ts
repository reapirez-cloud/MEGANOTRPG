import type { CSSProperties } from "react"

import {
  CHARACTER_SHEET_RESOURCE_ASSETS,
  characterSheetVisualAssetForSlot,
  type CharacterSheetVisualAsset,
} from "./characterSheetVisualAssets.ts"

export type CharacterAbilityIconVisual =
  | {
      kind: "image"
      src: string
    }
  | {
      kind: "atlas"
      render: CharacterSheetVisualAsset["render"]
      style: CSSProperties
    }
  | {
      kind: "fallback"
    }

function clean(value: string) {
  return value.trim()
}

function directImageSource(value: string) {
  const icon = clean(value)
  if (!icon) return null

  if (/^(?:https?:|data:|blob:|\/|\.\/|\.\.\/)/i.test(icon)) {
    return icon
  }

  if (/\.(?:png|jpe?g|webp|gif|svg|avif)(?:[?#].*)?$/i.test(icon)) {
    return icon
  }

  return null
}

function atlasStyle(asset: CharacterSheetVisualAsset): CSSProperties {
  const positionX =
    asset.columns <= 1
      ? "0%"
      : `${(asset.column / (asset.columns - 1)) * 100}%`
  const positionY =
    asset.rows <= 1
      ? "0%"
      : `${(asset.row / (asset.rows - 1)) * 100}%`

  return {
    "--u1-ability-icon": `url("${asset.url}")`,
    "--u1-ability-icon-size":
      `${asset.columns * 100}% ${asset.rows * 100}%`,
    "--u1-ability-icon-position": `${positionX} ${positionY}`,
  } as CSSProperties
}

function semanticResourceKey(value: string) {
  const match = value.match(/^(?:feature|resource):(.+)$/i)
  if (!match?.[1]) return null
  return match[1].trim().replace(/-/g, "_")
}

function semanticAtlas(value: string) {
  const resourceKey = semanticResourceKey(value)
  if (resourceKey) {
    const exact = CHARACTER_SHEET_RESOURCE_ASSETS[resourceKey]
    if (exact) return exact
  }

  if (/^class:[^:]+:(?:resource|spell_slot)$/i.test(value)) {
    return characterSheetVisualAssetForSlot(value)
  }

  return null
}

export function characterAbilityIconVisual(
  value: string | null | undefined,
): CharacterAbilityIconVisual {
  const icon = clean(value || "")
  if (!icon) return { kind: "fallback" }

  const image = directImageSource(icon)
  if (image) {
    return {
      kind: "image",
      src: image,
    }
  }

  const atlas = semanticAtlas(icon)
  if (atlas) {
    return {
      kind: "atlas",
      render: atlas.render,
      style: atlasStyle(atlas),
    }
  }

  return { kind: "fallback" }
}
