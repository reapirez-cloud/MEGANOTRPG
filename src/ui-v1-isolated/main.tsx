import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { AIProvider } from "../ai/AIProvider"
import AuthGate from "../components/auth/AuthGate"
import UiV1App from "./UiV1App"
import { SnakeProvider } from "./SnakeProvider"
import { initializeTelegramMiniApp } from "./telegramMiniApp"
import "../ai/ai-voss.css"
import "../components/media/art-player.css"
import "../auth.css"
import "./styles.css"
import "./snake.css"
import "./workspace.css"
import "./gm-workshop.css"
import "./art-library.css"
import "./character-sheet-header-stage1.css"
import "./character-sheet-header-stage4.css"
import "./character-sheet-header-stage5.css"
import "./character-sheet-overview-panel-fix.css"
import "./character-sheet-spell-slot-charge-fix.css"

initializeTelegramMiniApp()

const root = document.getElementById("ui-v1-root")

if (!root) {
  throw new Error("UI v1 root not found")
}

createRoot(root).render(
  <StrictMode>
    <AuthGate>
      <AIProvider>
        <SnakeProvider>
          <UiV1App />
        </SnakeProvider>
      </AIProvider>
    </AuthGate>
  </StrictMode>,
)
