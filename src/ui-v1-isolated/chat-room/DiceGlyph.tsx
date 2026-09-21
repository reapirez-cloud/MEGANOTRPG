type DiceGlyphProps = {
  sides: number
  value: number
}

function valueFontSize(value: number) {
  const length = String(Math.abs(value)).length
  if (length <= 2) return 28
  if (length === 3) return 22
  return 17
}

function StandardDie({
  sides,
  value,
}: DiceGlyphProps) {
  const fontSize = valueFontSize(value)
  const text = String(value)

  if (sides === 4) {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <polygon className="u1-die-glyph__face" points="50,7 92,86 8,86" />
        <path d="M50 7 50 58 8 86M50 58l42 28" />
        <text x="50" y="68" fontSize={fontSize}>{text}</text>
      </svg>
    )
  }

  if (sides === 6) {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <polygon className="u1-die-glyph__face" points="50,6 89,28 89,72 50,94 11,72 11,28" />
        <path d="M11 28 50 50 89 28M50 50v44M11 72l39-22 39 22" />
        <text x="50" y="60" fontSize={fontSize}>{text}</text>
      </svg>
    )
  }

  if (sides === 8) {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <polygon className="u1-die-glyph__face" points="50,5 93,50 50,95 7,50" />
        <path d="M50 5 31 50 50 95M50 5l19 45-19 45M7 50h86M31 50h38" />
        <text x="50" y="59" fontSize={fontSize}>{text}</text>
      </svg>
    )
  }

  if (sides === 10) {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <polygon className="u1-die-glyph__face" points="50,5 87,33 77,83 50,96 23,83 13,33" />
        <path d="M50 5 50 49 13 33M50 49l37-16M50 49 23 83M50 49l27 34M13 33l10 50M87 33 77 83" />
        <text x="50" y="59" fontSize={fontSize}>{text}</text>
      </svg>
    )
  }

  if (sides === 12) {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <polygon className="u1-die-glyph__face" points="50,4 72,11 89,28 96,50 87,74 67,91 40,96 17,82 5,59 8,34 27,14" />
        <polygon points="50,23 72,39 64,66 36,66 28,39" />
        <path d="M50 4v19M72 11 72 39M89 28 72 39M96 50 64 66M87 74 64 66M67 91 64 66M40 96 36 66M17 82 36 66M5 59 28 39M8 34 28 39M27 14 28 39" />
        <text x="50" y="56" fontSize={fontSize}>{text}</text>
      </svg>
    )
  }

  if (sides === 20) {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <polygon className="u1-die-glyph__face" points="50,4 84,16 96,49 80,82 50,96 20,82 4,49 16,16" />
        <path d="M50 4 34 32 16 16M50 4l16 28 18-16M4 49l30-17 16 22M96 49 66 32 50 54M20 82l14-50M80 82 66 32M20 82l30-28 30 28M50 54v42M4 49l46 47M96 49 50 96" />
        <text x="50" y="63" fontSize={fontSize}>{text}</text>
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <polygon className="u1-die-glyph__face" points="50,4 76,12 94,35 94,65 76,88 50,96 24,88 6,65 6,35 24,12" />
      <path d="M50 4 35 30 6 35M50 4l15 26 29 5M6 65l29 5 15 26M94 65l-29 5-15 26M35 30 50 50 65 30M35 70l15-20 15 20" />
      <text className="u1-die-glyph__kind" x="50" y="27">d{sides}</text>
      <text x="50" y="61" fontSize={fontSize}>{text}</text>
    </svg>
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
        <StandardDie sides={10} value={Number(tens)} />
        <b>{tens}</b>
      </span>
      <span className="u1-die-glyph__percentile-die">
        <StandardDie sides={10} value={Number(ones)} />
        <b>{ones}</b>
      </span>
    </span>
  )
}

export default function DiceGlyph({ sides, value }: DiceGlyphProps) {
  const label = `d${sides}: выпало ${value}`

  return (
    <span
      className="u1-die-glyph"
      data-die-sides={sides}
      data-die-kind={sides === 100 ? "percentile" : [4, 6, 8, 10, 12, 20].includes(sides) ? "canonical" : "fallback"}
      role="img"
      aria-label={label}
      title={label}
    >
      {sides === 100 ? (
        <PercentileDie value={value} />
      ) : (
        <StandardDie sides={sides} value={value} />
      )}
    </span>
  )
}
