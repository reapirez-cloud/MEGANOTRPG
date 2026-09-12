type Props = {
  eyebrow?: string
  title: string
  description: string
}

export default function FeaturePlaceholder({
  eyebrow = "MEGANOT UI 1.0",
  title,
  description,
}: Props) {
  return (
    <main className="mg-feature-placeholder">
      <div className="mg-feature-placeholder__content">
        <span className="mg-type-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
        <span className="mg-feature-placeholder__status">Раздел подключён · интерфейс впереди</span>
      </div>
    </main>
  )
}
