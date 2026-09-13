import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import UiV1App from "./UiV1App"
import { SnakeProvider } from "./SnakeProvider"
import "./styles.css"
import "./snake.css"
import "./workspace.css"
import "./gm-workshop.css"

const root = document.getElementById("ui-v1-root")

if (!root) {
  throw new Error("UI v1 root not found")
}

createRoot(root).render(
  <StrictMode>
    <SnakeProvider>
      <UiV1App />
    </SnakeProvider>
  </StrictMode>,
)
