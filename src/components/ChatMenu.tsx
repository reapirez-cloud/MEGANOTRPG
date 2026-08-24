import './ChatMenu.css'

function ChatMenu() {
  return (
    <div className="chat-menu">
      <h2>Чаты</h2>

      <section>
        <h3>💬 Общение</h3>
        <button>Флуд</button>
        <button>Обсуждение игры</button>
      </section>

      <section>
        <h3>⚔ Игра</h3>
        <button>Общая сцена</button>
        <button>Каин + GM</button>
        <button>Эррен + GM</button>
      </section>

      <section>
        <h3>📚 Мир</h3>
        <button>Локации</button>
        <button>NPC</button>
      </section>
    </div>
  )
}

export default ChatMenu
