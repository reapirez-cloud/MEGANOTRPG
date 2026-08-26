import type { ResolvedResource } from "../../character-engine/index.ts"
import { spellSlotResources } from "./spellSlots.ts"

type Props = {
  resources: ResolvedResource[]
  selectedLevel?: number | null
  compact?: boolean
  onSelect?: (level: number) => void
}

export default function SpellSlotMeter({
  resources,
  selectedLevel = null,
  compact = false,
  onSelect,
}: Props) {
  const slots = spellSlotResources(resources)
  if (slots.length === 0) return null

  return (
    <div className={`spell-slots-v3 ${compact ? "spell-slots-v3--compact" : ""}`}>
      {slots.map(({ resource, level }) => {
        const maximum = Math.max(0, Math.round(resource.max.value))
        const current = Math.max(0, Math.min(maximum, Math.round(resource.current)))
        return (
          <button
            className={selectedLevel === level ? "spell-slots-v3__level spell-slots-v3__level--active" : "spell-slots-v3__level"}
            type="button"
            key={resource.stateKey}
            onClick={() => onSelect?.(level)}
            disabled={!onSelect}
            aria-label={`${level} уровень: ${current} из ${maximum} ячеек`}
          >
            <span className="spell-slots-v3__label">
              <strong>{level}</strong>
              <small>ур.</small>
            </span>
            <span className="spell-slots-v3__orbs" aria-hidden="true">
              {Array.from({ length: maximum }, (_, index) => (
                <i
                  className={index < current ? "spell-slots-v3__orb spell-slots-v3__orb--lit" : "spell-slots-v3__orb"}
                  key={index}
                />
              ))}
            </span>
            <span className="spell-slots-v3__count">{current}/{maximum}</span>
          </button>
        )
      })}
    </div>
  )
}
