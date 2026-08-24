import './App.css'

function App() {
  return (
    <div className="app">
      <header className="top-bar">
        <h1>MEGANOTRPG</h1>
        <button>⚙</button>
      </header>

      <main className="content">
        <h2>Добро пожаловать</h2>
        <p>Выберите раздел игры</p>
      </main>

      <nav className="bottom-nav">
        <button>
          💬
          <span>Чаты</span>
        </button>

        <button>
          👤
          <span>Персонаж</span>
        </button>

        <button>
          🌍
          <span>Мир</span>
        </button>

        <button>
          🎨
          <span>Галерея</span>
        </button>

        <button>
          ☰
          <span>Ещё</span>
        </button>
      </nav>
    </div>
  )
}

export default App