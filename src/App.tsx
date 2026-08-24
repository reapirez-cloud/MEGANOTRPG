import { useState } from 'react'
import ChatMenu from './components/ChatMenu'
import './App.css'

function App() {
  const [activeTab, setActiveTab] = useState('chats')

  return (
    <div className="app">
      <header className="top-bar">
        <h1>MEGANOTRPG</h1>
        <button>⚙</button>
      </header>

      <main className="content">
        {activeTab === 'chats' && <ChatMenu />}
        {activeTab !== 'chats' && <h2>Раздел в разработке</h2>}
      </main>

      <nav className="bottom-nav">
        <button onClick={() => setActiveTab('chats')}>
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
