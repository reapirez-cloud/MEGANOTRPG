import type { ReactNode } from "react"

export default function AppScene({ children }: { children: ReactNode }) {
  return <div className="mg-scene">{children}</div>
}
