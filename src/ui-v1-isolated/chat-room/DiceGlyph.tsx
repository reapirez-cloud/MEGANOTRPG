type DiceGlyphProps = {
  sides: number
  value: number
}

type CanonicalDieProps = DiceGlyphProps & {
  displayValue?: string
}

const CANONICAL_DIE_FILES: Partial<Record<number, string>> = {
  4: "d4-graphite.png",
  6: "d6-graphite.png",
  8: "d8-graphite.png",
  10: "d10-graphite.png",
  12: "d12-graphite.png",
  20: "d20-graphite.png",
}

const DICE_ASSET_BASE =
  (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/") + "ui-v1/dice/"

function canonicalDieAsset(sides: number) {
  const file = CANONICAL_DIE_FILES[sides]
  return file ? DICE_ASSET_BASE + file : null
}

function valueLength(value: string) {
  return value.replace("-", "").length
}

function CanonicalDie({
  sides,
  value,
  displayValue,
}: CanonicalDieProps) {
  const asset = canonicalDieAsset(sides)
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
        loading="eager"
        decoding="async"
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
      data-die-kind={sides === 100 ? "percentile" : canonicalDieAsset(sides) ? "canonical" : "fallback"}
      role="img"
      aria-label={label}
      title={label}
    >
      {sides === 100 ? (
        <PercentileDie value={value} />
      ) : canonicalDieAsset(sides) ? (
        <CanonicalDie sides={sides} value={value} />
      ) : (
        <FallbackDie sides={sides} value={value} />
      )}
    </span>
  )
}
