type Props = {
  active: string
  onChange: (tab: string) => void
}

export default function BottomNav({ active, onChange }: Props) {
  const items = [
    ['game', '⚔', 'Игра'],
    ['flood', '💬', 'Флуд'],
    ['world', '🌍', 'Мир'],
    ['art', '🎨', 'Арт'],
  ]

  return (
    <nav className="bottom-nav">
      {items.map(([id, icon, label]) => (
        <button className={active === id ? 'active' : ''} onClick={() => onChange(id)} key={id}>
          <span>{icon}</span>
          <small>{label}</small>
        </button>
      ))}
    </nav>
  )
}
