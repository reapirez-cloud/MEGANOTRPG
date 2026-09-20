import type { ReactNode } from "react"

export default function ChatRoomFrame({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div
      className="u1-room-frame"
      data-chat-frame="reference-layout"
      aria-label="Игровой чат"
    >
      {children}
    </div>
  )
}
