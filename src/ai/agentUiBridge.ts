export const AGENT_OPEN_EVENT = "meganot:agent:open"

export type AgentOpenDetail = {
  prompt?: string
}

export function openAgent(prompt?: string) {
  window.dispatchEvent(
    new CustomEvent<AgentOpenDetail>(AGENT_OPEN_EVENT, {
      detail: prompt ? { prompt } : {},
    }),
  )
}
