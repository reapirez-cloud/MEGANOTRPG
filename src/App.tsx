import { useState } from "react"
import "./App.css"
import "./auth.css"
import "./character-system.css"
import "./character-sheet.css"
import "./character-equipment.css"
import "./world.css"
import "./chat-v11.css"

import BottomNav, { type MainTab } from "./components/app/BottomNav"
import TopBar from "./components/app/TopBar"
import AuthGate from "./components/auth/AuthGate"
import { CharacterProvider } from "./context/CharacterContext"

import World from "./pages/World"
import Art from "./pages/Art"
import Chats from "./pages/Chats"
import Characters from "./pages/Characters"
import ChatRoom from "./pages/ChatRoom"
import CharacterProfile from "./pages/CharacterProfile"

type Overlay =
  | { type: "chat"; id: string }
  | { type: "character"; id: string; returnRoomId?: string }
  | null

function Workspace() {
  const [tab, setTab] = useState<MainTab>("world")
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
          onOpenCharacter={(characterId) =>
            setOverlay({
              type: "character",
              id: characterId,
              returnRoomId: overlay.id,
            })
          }
        />
      </div>
    )
  }

  if (overlay?.type === "character") {
    return (
      <div className="app-shell">
        <CharacterProfile
          characterId={overlay.id}
          onBack={() =>
            overlay.returnRoomId
              ? setOverlay({ type: "chat", id: overlay.returnRoomId })
              : setOverlay(null)
          }
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

function AppContent() {
  return (
    <CharacterProvider>
      <Workspace />
    </CharacterProvider>
  )
}

export default function App() {
  return (
    <AuthGate>
      <AppContent />
    </AuthGate>
  )
}
