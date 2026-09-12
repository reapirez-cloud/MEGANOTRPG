import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import UiV1App from "./UiV1App"
import "./styles.css"

const root = document.getElementById("ui-v1-root")

if (!root) {
  throw new Error("UI v1 root not found")
}

createRoot(root).render(
  <StrictMode>
    <UiV1App />
  </StrictMode>,
)
