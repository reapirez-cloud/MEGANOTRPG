import './ChatMenu.css'

type Room = {
  id: number
  name: string
  category: string
}

type Props = {
  onSelectRoom: (room: Room) => void
}

const rooms: Room[] = [
  { id: 1, name: 'Общая сцена', category: '⚔ Игра' },
  { id: 2, name: 'Встреча в таверне', category: '⚔ Игра' },
  { id: 3, name: 'Флуд', category: '💬 Общение' },
  { id: 4, name: 'Локации', category: '📚 Мир' },
]

function ChatMenu({ onSelectRoom }: Props) {
  return (
    <div className="chat-menu">
      <h2>Чаты</h2>

      {rooms.map((room) => (
        <section key={room.id}>
          <h3>{room.category}</h3>
          <button onClick={() => onSelectRoom(room)}>
            {room.name}
          </button>
        </section>
      ))}
    </div>
  )
}

export default ChatMenu
