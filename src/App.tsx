import { useState } from 'react'
import ChatRoom from './components/ChatRoom'
import ChatMenu from './components/ChatMenu'
import BottomNav from './components/BottomNav'
import GameHome from './pages/GameHome'
import FloodHome from './pages/FloodHome'
import WorldHome from './pages/WorldHome'
import ArtHome from './pages/ArtHome'
import './App.css'

type Room = { id: number; name: string; category: string }

function App() {
  const [tab, setTab] = useState('game')
  const [room, setRoom] = useState<Room | null>(null)

  return (
    <div className="app">
      <header className="top-bar"><h1>MEGANOTRPG</h1><button>⚙</button></header>
      <main className="content">
        {tab === 'game' && !room && <GameHome />}
        {tab === 'game' && room && <ChatRoom room={room} onBack={() => setRoom(null)} />}
        {tab === 'flood' && <FloodHome />}
        {tab === 'world' && <WorldHome />}
        {tab === 'art' && <ArtHome />}
        {tab === 'game' && !room && <ChatMenu onSelectRoom={setRoom} />}
      </main>
      <BottomNav active={tab} onChange={(next) => { setTab(next); setRoom(null) }} />
    </div>
  )
}

export default App
