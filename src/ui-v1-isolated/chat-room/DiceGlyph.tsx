type DiceGlyphProps = {
  sides: number
  value: number
}

type CanonicalDieProps = DiceGlyphProps & {
  displayValue?: string
}

const CANONICAL_DIE_ASSETS: Partial<Record<number, string>> = {
  4: "/ui-v1/dice/d4-graphite.png",
  6: "/ui-v1/dice/d6-graphite.png",
  8: "/ui-v1/dice/d8-graphite.png",
  10: "/ui-v1/dice/d10-graphite.png",
  12: "/ui-v1/dice/d12-graphite.png",
  20: "/ui-v1/dice/d20-graphite.png",
}

function valueLength(value: string) {
  return value.replace("-", "").length
}

function CanonicalDie({
  sides,
  value,
  displayValue,
}: CanonicalDieProps) {
  const asset = CANONICAL_DIE_ASSETS[sides]
  if (!asset) return null

  const text = displayValue ?? String(value)

  return (
    <span
      className="u1-die-glyph__asset"
      data-die-sides={sides}
      aria-hidden="true"
    >
      <img
        className="u1-die-glyph__image"
        src={asset}
        alt=""
        draggable={false}
      />
      <b
        className="u1-die-glyph__value"
        data-value-length={valueLength(text)}
      >
        {text}
      </b>
    </span>
  )
}

function PercentileDie({ value }: { value: number }) {
  const normalized = value === 100 ? 100 : Math.max(1, Math.min(99, value))
  const tens = normalized === 100
    ? "00"
    : String(Math.floor(normalized / 10) * 10).padStart(2, "0")
  const ones = normalized === 100 ? "0" : String(normalized % 10)

  return (
    <span className="u1-die-glyph__percentile" aria-hidden="true">
      <span className="u1-die-glyph__percentile-die">
        <CanonicalDie
          sides={10}
          value={Number(tens)}
          displayValue={tens}
        />
      </span>
      <span className="u1-die-glyph__percentile-die">
        <CanonicalDie
          sides={10}
          value={Number(ones)}
          displayValue={ones}
        />
      </span>
    </span>
  )
}

function FallbackDie({
  sides,
  value,
}: DiceGlyphProps) {
  const text = String(value)

  return (
    <span className="u1-die-glyph__fallback" aria-hidden="true">
      <span className="u1-die-glyph__fallback-kind">d{sides}</span>
      <b
        className="u1-die-glyph__value"
        data-value-length={valueLength(text)}
      >
        {text}
      </b>
    </span>
  )
}

export default function DiceGlyph({ sides, value }: DiceGlyphProps) {
  const label = `d${sides}: выпало ${value}`

  return (
    <span
      className="u1-die-glyph"
      data-die-sides={sides}
      data-die-kind={sides === 100 ? "percentile" : CANONICAL_DIE_ASSETS[sides] ? "canonical" : "fallback"}
      role="img"
      aria-label={label}
      title={label}
    >
      {sides === 100 ? (
        <PercentileDie value={value} />
      ) : CANONICAL_DIE_ASSETS[sides] ? (
        <CanonicalDie sides={sides} value={value} />
      ) : (
        <FallbackDie sides={sides} value={value} />
      )}
    </span>
  )
}
