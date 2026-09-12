type Props = {
  title: string
  description: string
}

export default function HomeSectionPlaceholder({ title, description }: Props) {
  return (
    <main className="mg-home-section-placeholder">
      <span className="mg-type-eyebrow">Главная</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </main>
  )
}
