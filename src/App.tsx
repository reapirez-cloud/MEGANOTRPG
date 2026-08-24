import { useState } from "react"
import "./App.css"

import BottomNav, { type MainTab } from "./components/app/BottomNav"
import TopBar from "./components/app/TopBar"

import World from "./pages/World"
import Art from "./pages/Art"
import Chats from "./pages/Chats"
import Characters from "./pages/Characters"
import ChatRoom from "./pages/ChatRoom"
import CharacterProfile from "./pages/CharacterProfile"

type Overlay =
  | { type: "chat"; id: string }
  | { type: "character"; id: string }
  | null

export default function App() {
  const [tab, setTab] = useState<MainTab>("chats")
  const [overlay, setOverlay] = useState<Overlay>(null)

  function changeTab(next: MainTab) {
    setOverlay(null)
    setTab(next)
  }

  const title =
    tab === "world" ? "Мир" :
    tab === "art" ? "Арты" :
    tab === "chats" ? "Чаты" :
    "Персонажи"

  if (overlay?.type === "chat") {
    return (
      <div className="app-shell">
        <ChatRoom
          roomId={overlay.id}
          onBack={() => setOverlay(null)}
          onCharacter={(id) => setOverlay({ type: "character", id })}
        />
      </div>
    )
  }

  if (overlay?.type === "character") {
    return (
      <div className="app-shell">
        <CharacterProfile
          characterId={overlay.id}
          onBack={() => setOverlay(null)}
        />
      </div>
    )
  }

  return (
    <div className="app-shell">
      <TopBar title={title} />

      <main className="app-content">
        {tab === "world" && <World />}
        {tab === "art" && <Art />}
        {tab === "chats" && (
          <Chats onOpenRoom={(id) => setOverlay({ type: "chat", id })} />
        )}
        {tab === "characters" && (
          <Characters
            onOpenCharacter={(id) => setOverlay({ type: "character", id })}
          />
        )}
      </main>

      <BottomNav active={tab} onChange={changeTab} />
    </div>
  )
}
