import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { AIProvider } from "../ai/AIProvider"
import AuthGate from "../components/auth/AuthGate"
import UiV1App from "./UiV1App"
import { SnakeProvider } from "./SnakeProvider"
import "../ai/ai-voss.css"
import "../auth.css"
import "./styles.css"
import "./snake.css"
import "./workspace.css"
import "./gm-workshop.css"
import "./art-library.css"

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
