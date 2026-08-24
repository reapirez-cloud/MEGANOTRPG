type Props = {
  active: string
  onChange: (value: string) => void
}

export default function BottomNav({active, onChange}: Props) {
  const items = [
    ["🌍", "world"],
    ["🎨", "art"],
    ["💬", "chats"],
    ["👥", "characters"],
  ]

  return (
    <nav className="bottom-nav">
      {items.map(([icon, id]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          style={{opacity: active === id ? 1 : 0.6}}
        >
          {icon}
        </button>
      ))}
    </nav>
  )
}
