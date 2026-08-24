import { useState } from 'react'
import ChatMenu from './components/ChatMenu'
import './App.css'

function App() {
  const [page, setPage] = useState('home')

  return (
    <div className="app">
      <header className="top-bar">
        <h1>MEGANOTRPG</h1>
        <button>⚙</button>
      </header>

      <main className="content">
        {page === 'chat' && <ChatMenu />}

        {page === 'home' && (
          <>
            <h2>Добро пожаловать</h2>
            <p>Выберите раздел игры</p>
          </>
        )}

        {page !== 'chat' && page !== 'home' && (
          <h2>Раздел в разработке</h2>
        )}
      </main>

      <nav className="bottom-nav">
        <button onClick={() => setPage('chat')}>
          💬
          <span>Чаты</span>
        </button>

        <button onClick={() => setPage('character')}>
          👤
          <span>Персонаж</span>
        </button>

        <button onClick={() => setPage('world')}>
          🌍
          <span>Мир</span>
        </button>

        <button onClick={() => setPage('gallery')}>
          🎨
          <span>Галерея</span>
        </button>

        <button onClick={() => setPage('more')}>
          ☰
          <span>Ещё</span>
        </button>
      </nav>
    </div>
  )
}

export default App