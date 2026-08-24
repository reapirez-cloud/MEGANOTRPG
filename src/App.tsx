import { useState } from 'react'
import ChatMenu from './components/ChatMenu'
import ChatRoom from './components/ChatRoom'
import './App.css'

type Room = {
  id: number
  name: string
  category: string
}

function App() {
  const [activeTab, setActiveTab] = useState('chats')
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)

  return (
    <div className="app">
      <header className="top-bar">
        <h1>MEGANOTRPG</h1>
        <button>⚙</button>
      </header>

      <main className="content">
        {activeTab === 'chats' && !selectedRoom && (
          <ChatMenu onSelectRoom={setSelectedRoom} />
        )}

        {activeTab === 'chats' && selectedRoom && (
          <ChatRoom
            room={selectedRoom}
            onBack={() => setSelectedRoom(null)}
          />
        )}

        {activeTab !== 'chats' && <h2>Раздел в разработке</h2>}
      </main>

      <nav className="bottom-nav">
        <button onClick={() => { setActiveTab('chats'); setSelectedRoom(null) }}>
          💬
          <span>Чаты</span>
        </button>

        <button onClick={() => setActiveTab('character')}>
          👤
          <span>Персонаж</span>
        </button>

        <button onClick={() => setActiveTab('world')}>
          🌍
          <span>Мир</span>
        </button>

        <button onClick={() => setActiveTab('gallery')}>
          🎨
          <span>Галерея</span>
        </button>

        <button onClick={() => setActiveTab('more')}>
          ☰
          <span>Ещё</span>
        </button>
      </nav>
    </div>
  )
}

export default App
