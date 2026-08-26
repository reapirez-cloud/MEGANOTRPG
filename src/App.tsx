import { useCallback, useEffect, useMemo, useState } from "react"
import "./App.css"
import "./auth.css"
import "./character-system.css"
import "./character-sheet.css"
import "./character-equipment.css"
import "./character-engine-sheet.css"
import "./world.css"
import "./chat-v11.css"
import "./social.css"
import "./gm-workspace.css"
import "./spell-reference.css"
import "./reference-guide.css"

import BottomNav from "./components/app/BottomNav"
import NotificationsSheet from "./components/app/NotificationsSheet"
import TopBar from "./components/app/TopBar"
import AuthGate from "./components/auth/AuthGate"
import ReferenceGuide from "./components/reference/ReferenceGuide"
import { CharacterProvider, useCharacters } from "./context/CharacterContext"
import { useNotifications } from "./hooks/useNotifications"
import {
  mainRouteHash,
  parseAppRoute,
  type AppRoute,
} from "./lib/appRoute"

import Art from "./pages/Art"
import CharacterProfileV2 from "./pages/CharacterProfileV2"
import Characters from "./pages/Characters"
import ChatRoom from "./pages/ChatRoom"
import Chats from "./pages/Chats"
import Feed from "./pages/Feed"
import GmWorkspace from "./pages/GmWorkspace"
import World from "./pages/World"

function Workspace() {
  const {
    campaignId,
    activeCharacter,
    myCharacters,
    isGm,
    isOwner,
    canManage,
  } = useCharacters()
  const notifications = useNotifications(campaignId)
  const [route, setRoute] = useState<AppRoute>(() =>
    parseAppRoute(window.location.hash),
  )
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [referenceOpen, setReferenceOpen] = useState(false)
  const [characterRefreshKey, setCharacterRefreshKey] = useState(0)

  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState(null, "", "#/feed")
    }
    const update = () => setRoute(parseAppRoute(window.location.hash))
    window.addEventListener("hashchange", update)
    return () => window.removeEventListener("hashchange", update)
  }, [])

  const navigate = useCallback((hash: string, replace = false) => {
    if (window.location.hash === hash) return
    if (replace) window.history.replaceState(null, "", hash)
    else window.location.hash = hash
    setRoute(parseAppRoute(hash))
  }, [])

  const goBack = useCallback(() => {
    if (route.type === "chat") navigate("#/chats")
    else if (route.type === "gallery") navigate("#/feed")
    else if (
      route.type === "character" &&
      route.from === "chat" &&
      route.roomId
    ) {
      navigate(`#/chat/${route.roomId}`)
    } else if (route.type === "character") {
      navigate(route.from === "chat" ? "#/chats" : mainRouteHash(route.from))
    }
  }, [navigate, route])

  useEffect(() => {
    const backButton = window.Telegram?.WebApp?.BackButton
    if (!backButton) return
    if (route.type === "main") {
      backButton.hide()
    } else {
      backButton.show()
      backButton.onClick(goBack)
    }
    return () => backButton.offClick(goBack)
  }, [goBack, route.type])

  const title = useMemo(() => {
    if (route.type !== "main") return ""
    if (route.tab === "feed") return "Хроника"
    if (route.tab === "chats") return "Чаты"
    if (route.tab === "world") return "Мир"
    if (route.tab === "characters") return "Персонажи"
    if (activeCharacter && (isOwner || !isGm)) return "Мой персонаж"
    if (isGm || isOwner) return "Я — ГМ"
    return "Мой персонаж"
  }, [activeCharacter, isGm, isOwner, route])

  if (route.type === "chat") {
    return (
      <div className="app-shell">
        <ChatRoom
          roomId={route.id}
          onBack={goBack}
          onOpenCharacter={(characterId) =>
            navigate(
              `#/character/${characterId}?from=chat&room=${route.id}`,
            )
          }
        />
      </div>
    )
  }

  if (route.type === "character") {
    return (
      <div className="app-shell">
        <CharacterProfileV2 characterId={route.id} onBack={goBack} />
      </div>
    )
  }

  if (route.type === "gallery") {
    return (
      <div className="app-shell">
        <div className="screen">
          <header className="screen-header">
            <button
              className="icon-button"
              type="button"
              onClick={goBack}
              aria-label="Назад"
            >
              ←
            </button>
            <h1 className="screen-header__title">Арты и комиксы</h1>
            <span />
          </header>
          <main className="app-content app-content--overlay">
            <Art />
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <TopBar
        title={title}
        unreadCount={notifications.unreadCount}
        onOpenNotifications={() => setNotificationsOpen(true)}
      />

      <main className="app-content">
        {route.tab === "feed" && (
          <Feed
            onOpenCharacter={(id) =>
              navigate(`#/character/${id}?from=feed`)
            }
            onOpenGallery={() => navigate("#/gallery")}
          />
        )}
        {route.tab === "chats" && (
          <Chats onOpenRoom={(id) => navigate(`#/chat/${id}`)} />
        )}
        {route.tab === "world" && <World />}
        {route.tab === "characters" && (
          <Characters
            onOpenCharacter={(id) =>
              navigate(`#/character/${id}?from=characters`)
            }
          />
        )}
        {route.tab === "me" && (
          <button
            className="spell-reference-launch"
            type="button"
            onClick={() => setReferenceOpen(true)}
          >
            <span className="spell-reference-launch__icon">⌘</span>
            <span className="spell-reference-launch__copy">
              <strong>Справочник</strong>
              <small>Заклинания, классы, бестиарий и игровые таблицы</small>
            </span>
            <span className="spell-reference-launch__chevron">›</span>
          </button>
        )}
        {route.tab === "me" &&
          (activeCharacter && (isOwner || !isGm) ? (
            <CharacterProfileV2
              key={`${activeCharacter.id}:${characterRefreshKey}`}
              characterId={activeCharacter.id}
              onBack={() => navigate("#/feed")}
              embedded
            />
          ) : isGm || isOwner ? (
            <GmWorkspace
              onOpenCharacter={(id) => navigate(`#/character/${id}?from=me`)}
              onOpenRoom={(id) => navigate(`#/chat/${id}`)}
            />
          ) : (
            <section className="me-empty surface">
              <span>◇</span>
              <h2>{myCharacters.length > 0 ? "Выбери активного персонажа" : "Персонаж ещё не назначен"}</h2>
              <p>
                {myCharacters.length > 0
                  ? "На странице персонажей выбери героя — здесь откроется его дневник, лист, инвентарь и арты."
                  : "ГМ или владелец выдаст тебе персонажа. После назначения здесь откроются дневник, арты, лист, инвентарь и заклинания."}
              </p>
              <button type="button" onClick={() => navigate("#/characters")}>
                {myCharacters.length > 0 ? "Выбрать персонажа" : "Открыть персонажей"}
              </button>
            </section>
          ))}
      </main>

      {notificationsOpen && (
        <NotificationsSheet
          items={notifications.items}
          loading={notifications.loading}
          error={notifications.error}
          onClose={() => setNotificationsOpen(false)}
          onMarkRead={notifications.markAllRead}
          onOpenFeed={() => navigate("#/feed")}
        />
      )}

      {referenceOpen && (
        <ReferenceGuide
          character={activeCharacter ? {
            id: activeCharacter.id,
            name: activeCharacter.name,
            character_class: activeCharacter.character_class,
          } : null}
          canManage={canManage}
          onClose={() => setReferenceOpen(false)}
          onCharacterChanged={() => setCharacterRefreshKey((current) => current + 1)}
        />
      )}

      <BottomNav
        active={route.tab}
        onChange={(tab) => navigate(mainRouteHash(tab))}
        meLabel={isGm && !isOwner ? "ГМ" : "Я"}
      />
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
