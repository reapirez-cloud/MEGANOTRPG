import './ChatRoom.css'

type Room = {
  id: number
  name: string
}

type Props = {
  room: Room
  onBack: () => void
  onCharacter: () => void
}

type Message = {
  id: number
  author: string
  text: string
  side: 'gm' | 'player'
  time: string
}

const messages: Message[] = [
  { id: 1, author: 'GM', text: 'Вы входите в древний зал. В воздухе пахнет пылью и старым камнем.', side: 'gm', time: '12:01' },
  { id: 2, author: 'Вильям Кидд', text: 'Осматриваю помещение и ищу необычные детали.', side: 'player', time: '12:03' },
  { id: 3, author: 'GM', text: '🎲 Проверка восприятия: результат 18', side: 'gm', time: '12:04' },
]

function ChatRoom({ room, onBack, onCharacter }: Props) {
  return (
    <div className="chat-room">
      <header className="chat-header">
        <button onClick={onBack}>←</button>
        <h2>{room.name}</h2>
        <button className="character-button" onClick={onCharacter}>Вильям Кидд</button>
      </header>

      <div className="messages">
        {messages.map((message) => (
          <div key={message.id} className={`message ${message.side}`}>
            <div className="message-meta">
              <b>{message.author}</b>
              <span>{message.time}</span>
            </div>
            <p>{message.text}</p>
          </div>
        ))}
      </div>

      <div className="chat-input">
        <button>🎲</button>
        <div>Написать сообщение...</div>
        <button>📎</button>
      </div>
    </div>
  )
}

export default ChatRoom
