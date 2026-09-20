import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8")

test("player security classification is lightweight and runs inside the turn", () => {
  const security = read("supabase/functions/voss-agent/security.ts")
  const edge = read("supabase/functions/voss-agent/index.ts")

  assert.match(security, /resolvePlayerSecurityModel/)
  assert.match(security, /disableReasoningEffort: true/)
  assert.match(security, /timeoutMs: 12_000/)
  assert.match(security, /retryCount: 0/)

  const processTurn = edge.indexOf("const processTurn = async")
  const assessment = edge.indexOf("await assessPlayerSecurity", processTurn)
  const background = edge.indexOf("runBackground(backgroundTurn)")
  assert.ok(processTurn >= 0)
  assert.ok(assessment > processTurn)
  assert.ok(background > assessment)
})

test("provider requests have bounded latency and retry only transient failures", () => {
  const gateway = read("supabase/functions/voss-agent/provider-gateway.ts")

  assert.match(gateway, /AbortController/)
  assert.match(gateway, /AI provider request timed out/)
  assert.match(gateway, /response\.status === 429/)
  assert.match(gateway, /response\.status === 502/)
  assert.match(gateway, /response\.status === 503/)
  assert.match(gateway, /response\.status === 504/)
  assert.match(gateway, /retryCount \?\? 1/)
})

test("Voss publishes tools by task instead of one giant always-on toolbox", () => {
  const edge = read("supabase/functions/voss-agent/index.ts")

  assert.match(edge, /const scopedReadTools/)
  assert.match(edge, /const scopedMemoryReadTools/)
  assert.match(edge, /const scopedImageTools/)
  assert.match(edge, /const scopedManagerTools/)
  assert.match(edge, /const scopedDraftTools/)
  assert.match(edge, /const scopedAdminTools/)
  assert.match(edge, /const imageWorkflowInstructions/)
  assert.match(edge, /const memoryWorkflowInstructions/)
  assert.match(edge, /const draftWorkflowInstructions/)
  assert.doesNotMatch(
    edge,
    /const availableTools = supportsReadTools\s*\? \[\s*\.\.\.VOSS_READ_TOOLS,\s*\.\.\.VOSS_MEMORY_READ_TOOLS,\s*\.\.\.VOSS_IMAGE_TOOLS/,
  )
})

test("pending replies use a lightweight message-tail poll and lock thread mutations", () => {
  const provider = read("src/ai/AIProvider.tsx")
  const shell = read("src/ai/AgentShell.tsx")

  assert.match(provider, /loadConversationTailFor/)
  assert.match(provider, /\.limit\(24\)/)
  assert.match(provider, /assistantArrived/)
  assert.match(provider, /4000/)

  assert.match(shell, /disabled=\{sending \|\| pendingReply\}/)
  assert.match(shell, /role="dialog"/)
  assert.match(shell, /aria-modal="true"/)
  assert.match(shell, /event\.ctrlKey \|\| event\.metaKey/)
})

test("generated-image UI uses exact references and direct cancel/retry actions", () => {
  const edge = read("supabase/functions/voss-agent/index.ts")
  const provider = read("src/ai/AIProvider.tsx")
  const shell = read("src/ai/AgentShell.tsx")

  assert.match(edge, /action === "cancel_image_job"/)
  assert.match(edge, /action === "retry_image_job"/)
  assert.match(edge, /generatedAssetRef/)
  assert.match(edge, /job_id=/)
  assert.match(edge, /variant_index=/)
  assert.match(provider, /cancelImageJob/)
  assert.match(provider, /retryImageJob/)
  assert.match(shell, /setSelectedGeneratedAssetRef/)
  assert.match(shell, /Отменить/)
  assert.match(shell, /Повторить/)
})


test("queued image generation forces a text-only completion round", () => {
  const edge = read("supabase/functions/voss-agent/index.ts")

  assert.match(edge, /let forceTextOnlyNextRound = false/)
  assert.match(edge, /const toolsForRound = forceTextOnlyNextRound \? \[\] : availableTools/)
  assert.match(edge, /tools: toolsForRound/)
  assert.match(
    edge,
    /toolName === "generate_image"[\s\S]*imageJobsQueued\.push\(resultRecord\.job_id\)[\s\S]*forceTextOnlyNextRound = true/,
  )
})
