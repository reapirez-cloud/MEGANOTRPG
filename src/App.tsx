import { useCallback, useEffect, useMemo, useState } from "react"
import { HashRouter, useLocation, useNavigate } from "react-router"
import "./App.css"
import "./auth.css"
import "./character-system.css"
import "./character-sheet.css"
import "./character-equipment.css"
import "./character-engine-sheet.css"
import "./world.css"
import "./npc-zone-habitats.css"
import "./chat-v11.css"
import "./social.css"
import "./gm-workspace.css"
import "./spell-reference.css"
import "./reference-guide.css"
import "./reference-druid.css"
import "./reference-catalog.css"
import "./character-profile-v3.css"
import "./ui-v2.css"
import "./game-context-v3.css"
import "./rule-templates.css"
import "./rule-template-levels.css"
import "./resource-runtime.css"
import "./chat-release-fixes.css"
import "./spell-slot-clarity.css"
import "./creation-wizard.css"
import "./character-sheet-modules.css"
import "./character-profile-v5.css"
import "./character-profile-opus.css"
import "./ui-v1/ui-v1.css"

import NotificationsSheet from "./components/app/NotificationsSheet"
import AuthGate from "./components/auth/AuthGate"
import CharacterGameFrame from "./components/characters/CharacterGameFrame"
import ReferenceGuide from "./components/reference/ReferenceGuide"
import { CharacterProvider, useCharacters } from "./context/CharacterContext"
import { useNotifications } from "./hooks/useNotifications"
import {
  characterReturnPath,
  characterRoutePath,
  dockSpaceForRoute,
  legacyRedirectForLocation,
  parseAppLocation,
  rootSpacePath,
  type RootSpace,
} from "./lib/appRoute"
import Art from "./pages/Art"
import CharacterProfileV2 from "./pages/CharacterProfileV2"
import Characters from "./pages/Characters"
import ChatRoom from "./pages/ChatRoom"
import Chats from "./pages/Chats"
import Feed from "./pages/Feed"
import GmWorkspace from "./pages/GmWorkspace"
import World from "./pages/World"
import ContextHeader from "./ui-v1/shell/ContextHeader"
import MeganotAppShell from "./ui-v1/shell/MeganotAppShell"
import HomeFoundation from "./ui-v1/screens/HomeFoundation"
import FeaturePlaceholder from "./ui-v1/screens/FeaturePlaceholder"
import HomeSectionPlaceholder from "./ui-v1/screens/HomeSectionPlaceholder"
import { homeSectionCopy } from "./ui-v1/screens/homeSectionCopy"

function Workspace() {
  const {
    campaignId,
    campaignTitle,
    campaignCoverUrl,
    activeCharacter,
    myMember,
    canManage,
  } = useCharacters()
  const notifications = useNotifications(campaignId)
  const location = useLocation()
  const routerNavigate = useNavigate()
  const route = useMemo(
    () => parseAppLocation(location.pathname, location.search),
    [location.pathname, location.search],
  )
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [referenceOpen, setReferenceOpen] = useState(false)
  const [characterRefreshKey, setCharacterRefreshKey] = useState(0)

  const navigate = useCallback(
    (path: string, replace = false) => {
      routerNavigate(path, { replace })
    },
    [routerNavigate],
  )

  useEffect(() => {
    const redirect = legacyRedirectForLocation(location.pathname)
    if (redirect) navigate(redirect, true)
  }, [location.pathname, navigate])

  const goBack = useCallback(() => {
    if (route.type === "chat") {
      navigate("/chats")
      return
    }

    if (route.type === "gallery") {
      navigate("/home")
      return
    }

    if (route.type === "character") {
      navigate(characterReturnPath(route))
      return
    }

    if (route.type === "home-section" || route.type === "world") {
      navigate("/home")
      return
    }

    if (route.type === "workspace-characters") {
      navigate("/workspace")
      return
    }

    if (route.type === "legacy-root") {
      navigate(route.target === "chats" ? "/chats" : "/workspace")
      return
    }

    navigate("/home")
  }, [navigate, route])

  useEffect(() => {
    const back = window.Telegram?.WebApp?.BackButton
    if (!back) return

    if (route.type === "space") {
      back.hide()
    } else {
      back.show()
      back.onClick(goBack)
    }

    return () => back.offClick(goBack)
  }, [goBack, route.type])

  const openNotifications = useCallback(() => setNotificationsOpen(true), [])
  const openReference = useCallback(() => setReferenceOpen(true), [])

  const legacyWorkspaceActions = (
    <>
      <button type="button" onClick={openReference}>Справочник</button>
      <button type="button" onClick={openNotifications}>
        Уведомления{notifications.unreadCount > 0 ? ` · ${notifications.unreadCount > 9 ? "9+" : notifications.unreadCount}` : ""}
      </button>
    </>
  )

  const activeSpace = dockSpaceForRoute(route)
  const navigateSpace = useCallback(
    (space: RootSpace) => navigate(rootSpacePath(space)),
    [navigate],
  )

  let content

  if (route.type === "chat") {
    content = (
      <ChatRoom
        roomId={route.id}
        onBack={goBack}
        onOpenCharacter={(id) => navigate(characterRoutePath(id, "chat", route.id))}
      />
    )
  } else if (route.type === "character") {
    content = (
      <CharacterGameFrame characterId={route.id}>
        <CharacterProfileV2 characterId={route.id} onBack={goBack} />
      </CharacterGameFrame>
    )
  } else if (route.type === "gallery") {
    content = (
      <>
        <ContextHeader title="Арты и комиксы" eyebrow="Главная" onBack={goBack} />
        <main className="app-content app-content--overlay"><Art /></main>
      </>
    )
  } else if (route.type === "world") {
    content = (
      <>
        <ContextHeader title="Мир" eyebrow="Главная" onBack={goBack} />
        <main className="app-content"><World /></main>
      </>
    )
  } else if (route.type === "workspace-characters") {
    content = (
      <>
        <ContextHeader title="Персонажи" eyebrow="Пространство" onBack={goBack} />
        <main className="app-content">
          <Characters
            onOpenCharacter={(id) => navigate(characterRoutePath(id, "characters"))}
          />
        </main>
      </>
    )
  } else if (route.type === "legacy-root" && route.target === "chats") {
    content = (
      <>
        <ContextHeader title="Старые чаты" eyebrow="Legacy bridge" onBack={goBack} />
        <main className="app-content">
          <Chats onOpenRoom={(id) => navigate(`/chat/${encodeURIComponent(id)}`)} />
        </main>
      </>
    )
  } else if (route.type === "legacy-root" && route.target === "workspace") {
    content = (
      <>
        <ContextHeader
          title={canManage ? "Старое пространство мастера" : "Старое личное пространство"}
          eyebrow="Legacy bridge"
          onBack={goBack}
          actions={legacyWorkspaceActions}
        />
        <main className="app-content">
          {canManage && (
            <GmWorkspace
              onOpenCharacter={(id) => navigate(characterRoutePath(id, "workspace"))}
              onOpenRoom={(id) => navigate(`/chat/${encodeURIComponent(id)}`)}
            />
          )}
          {!canManage && activeCharacter && (
            <CharacterGameFrame characterId={activeCharacter.id}>
              <CharacterProfileV2
                key={`${activeCharacter.id}:${characterRefreshKey}`}
                characterId={activeCharacter.id}
                onBack={goBack}
                embedded
              />
            </CharacterGameFrame>
          )}
          {!canManage && !activeCharacter && (
            <FeaturePlaceholder
              eyebrow="Legacy bridge"
              title="Персонаж не назначен"
              description="Старое личное пространство сохранено как временный мост, но активного персонажа сейчас нет."
            />
          )}
        </main>
      </>
    )
  } else if (route.type === "home-section" && route.section === "whats-new") {
    content = (
      <>
        <ContextHeader title="Что нового" eyebrow="Главная" onBack={goBack} />
        <main className="app-content">
          <Feed
            onOpenCharacter={(id) => navigate(characterRoutePath(id, "whats-new"))}
            onOpenGallery={() => navigate("/gallery")}
          />
        </main>
      </>
    )
  } else if (route.type === "home-section") {
    const copy = homeSectionCopy[route.section]
    content = (
      <>
        <ContextHeader title={copy.title} eyebrow="Главная" onBack={goBack} />
        <HomeSectionPlaceholder title={copy.title} description={copy.description} />
      </>
    )
  } else if (route.space === "home") {
    content = (
      <HomeFoundation
        campaignId={campaignId}
        campaignTitle={campaignTitle}
        campaignCoverUrl={campaignCoverUrl}
        displayName={myMember?.display_name || ""}
        onOpenWhatsNew={() => navigate("/home/whats-new")}
        onOpenWorld={() => navigate("/world")}
        onOpenSocietyNews={() => navigate("/home/society-news")}
        onOpenAchievements={() => navigate("/home/achievements")}
        onOpenGallery={() => navigate("/gallery")}
        onOpenUpdates={() => navigate("/home/updates")}
        onOpenWorkspace={() => navigate("/workspace")}
      />
    )
  } else if (route.space === "chats") {
    content = (
      <FeaturePlaceholder
        title="Чаты"
        description="Новый интерфейс чатов будет подключён отдельным этапом. Маршрут и место в Dock уже окончательные, поэтому остальные части UI 1.0 могут ссылаться сюда без временных обходов."
      />
    )
  } else {
    content = (
      <FeaturePlaceholder
        eyebrow={canManage ? "Управление" : "Личное пространство"}
        title="Я"
        description={
          canManage
            ? "Новое пространство управления мастера и владельца будет собрано отдельным этапом. Старый GM-интерфейс остаётся источником рабочей логики, но не показывается как новый UI."
            : activeCharacter
              ? "Новое личное пространство игрока будет построено вокруг активного персонажа отдельным этапом. Персонаж уже привязан к этому маршруту архитектурно."
              : "Личное пространство подключено к новой навигации и ждёт своего этапа реализации."
        }
      />
    )
  }

  const showDock =
    route.type !== "chat" &&
    route.type !== "character" &&
    route.type !== "gallery" &&
    route.type !== "legacy-root"

  return (
    <MeganotAppShell
      activeSpace={activeSpace}
      showDock={showDock}
      onNavigate={navigateSpace}
    >
      {content}
      {notificationsOpen && (
        <NotificationsSheet
          items={notifications.items}
          loading={notifications.loading}
          error={notifications.error}
          onClose={() => setNotificationsOpen(false)}
          onMarkRead={notifications.markAllRead}
          onOpenFeed={() => navigate("/home/whats-new")}
        />
      )}
      {referenceOpen && (
        <ReferenceGuide
          campaignId={campaignId}
          character={activeCharacter
            ? {
                id: activeCharacter.id,
                name: activeCharacter.name,
                character_class: activeCharacter.character_class,
              }
            : null}
          canManage={canManage}
          onClose={() => setReferenceOpen(false)}
          onCharacterChanged={() => setCharacterRefreshKey((count) => count + 1)}
        />
      )}
    </MeganotAppShell>
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
      <HashRouter>
        <AppContent />
      </HashRouter>
    </AuthGate>
  )
}
