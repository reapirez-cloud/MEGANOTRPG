type JsonRecord = Record<string, unknown>

// A few OpenAI-compatible gateways respond with SSE even when stream was not
// requested. Reconstruct only completed chat-completion events; never treat
// partial text as an answer or executable tool call.
export function parseProviderCompletion(raw: string, contentType = ""): JsonRecord {
  const isStream = contentType.toLowerCase().includes("text/event-stream") ||
    /^(?:\s*event:[^\n]*\n)*\s*data:/u.test(raw)
  if (!isStream) {
    const value = JSON.parse(raw)
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("provider_response_not_object")
    }
    return value as JsonRecord
  }

  let content = ""
  let role = "assistant"
  let finishReason = ""
  let usage: unknown
  let sawDone = false
  let sawFinish = false
  let fullMessage: JsonRecord | null = null
  const calls = new Map<number, {
    id: string
    type: string
    function: { name: string; arguments: string }
  }>()

  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue
    const data = line.slice(5).trim()
    if (data === "[DONE]") {
      sawDone = true
      continue
    }
    if (!data) continue
    const event = JSON.parse(data) as JsonRecord
    if (event.usage) usage = event.usage
    const choice = Array.isArray(event.choices) ? event.choices[0] : null
    if (!choice || typeof choice !== "object") continue
    if (choice.message && typeof choice.message === "object") {
      fullMessage = choice.message as JsonRecord
    }
    if (typeof choice.finish_reason === "string" && choice.finish_reason) {
      finishReason = choice.finish_reason
      sawFinish = true
    }
    const delta = choice.delta
    if (!delta || typeof delta !== "object") continue
    if (typeof delta.role === "string") role = delta.role
    if (typeof delta.content === "string") content += delta.content
    if (!Array.isArray(delta.tool_calls)) continue
    for (const fragment of delta.tool_calls) {
      if (!fragment || !Number.isInteger(fragment.index) || fragment.index < 0) {
        throw new Error("provider_tool_chunk_index_invalid")
      }
      const call = calls.get(fragment.index) || {
        id: "",
        type: "function",
        function: { name: "", arguments: "" },
      }
      if (typeof fragment.id === "string") call.id = fragment.id
      if (typeof fragment.type === "string") call.type = fragment.type
      if (typeof fragment.function?.name === "string") {
        call.function.name += fragment.function.name
      }
      if (typeof fragment.function?.arguments === "string") {
        call.function.arguments += fragment.function.arguments
      }
      calls.set(fragment.index, call)
    }
  }

  if (!sawFinish && !sawDone) throw new Error("provider_stream_incomplete")
  if (!fullMessage && !content && !calls.size) {
    throw new Error("provider_stream_empty")
  }
  const toolCalls = [...calls.entries()].sort(([a], [b]) => a - b).map(([, call]) => {
    if (!call.function.name || !call.id) {
      throw new Error("provider_stream_tool_incomplete")
    }
    return call
  })
  return {
    choices: [{
      message: fullMessage || {
        role,
        content: content || null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      },
      finish_reason: finishReason || null,
    }],
    ...(usage ? { usage } : {}),
  }
}
