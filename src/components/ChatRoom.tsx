import './ChatRoom.css'

type Room = {
  id: number
  name: string
}

type Props = {
  room: Room
  onBack: () => void
}

function ChatRoom({ room, onBack }: Props) {
  return (
    <div className="chat-room">
      <button onClick={onBack}>← Назад</button>

      <h2>{room.name}</h2>

      <div className="messages">
        <div className="message gm">
          <b>GM:</b>
          <p>Вы начинаете новую сцену...</p>
        </div>

        <div className="message player">
          <b>Игрок:</b>
          <p>Я осматриваю окружение.</p>
        </div>
      </div>

      <div className="input-placeholder">
        Написать сообщение...
      </div>
    </div>
  )
}

export default ChatRoom
