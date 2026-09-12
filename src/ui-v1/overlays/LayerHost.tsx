import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"

const LayerHostContext = createContext<HTMLElement | null>(null)

export function useLayerHost() {
  return useContext(LayerHostContext)
}

export default function LayerHost({ children }: { children: ReactNode }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const value = useMemo(() => container, [container])

  return (
    <LayerHostContext.Provider value={value}>
      {children}
      <div
        className="mg-layer-host"
        ref={setContainer}
        aria-hidden={container ? undefined : true}
      />
    </LayerHostContext.Provider>
  )
}
