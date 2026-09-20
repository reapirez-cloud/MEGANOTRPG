import assert from "node:assert/strict"
import test from "node:test"

import {
  normalizeFreddyCapabilities,
  requestFreddyCapabilities,
} from "../supabase/functions/voss-agent/capability-broker.ts"

test("GM can request game capabilities but not system.admin", () => {
  const result = requestFreddyCapabilities("gm", {
    capabilities: ["world.write", "content.write", "system.admin"],
  })

  assert.deepEqual(result.granted, ["world.write", "content.write"])
  assert.deepEqual(result.newly_granted, ["world.write", "content.write"])
  assert.deepEqual(result.denied, [
    { capability: "system.admin", reason: "authority_not_allowed" },
  ])
})

test("admin can request system.admin", () => {
  const result = requestFreddyCapabilities("admin", {
    capabilities: ["system.admin", "campaign.manage"],
  })

  assert.deepEqual(result.granted, ["system.admin", "campaign.manage"])
  assert.equal(result.denied.length, 0)
})

test("Voss/player cannot obtain write capabilities", () => {
  const result = requestFreddyCapabilities("player", {
    capabilities: ["world.write", "media.write"],
  })

  assert.deepEqual(result.granted, [])
  assert.deepEqual(result.denied, [
    { capability: "world.write", reason: "voss_read_only" },
    { capability: "media.write", reason: "voss_read_only" },
  ])
})

test("capabilities are normalized and current grants are not reissued", () => {
  assert.deepEqual(
    normalizeFreddyCapabilities([
      "world.write",
      "world.write",
      "garbage",
      null,
      "characters.write",
    ]),
    ["world.write", "characters.write"],
  )

  const result = requestFreddyCapabilities(
    "gm",
    { capabilities: ["world.write", "characters.write"] },
    ["world.write"],
  )

  assert.deepEqual(result.newly_granted, ["characters.write"])
  assert.deepEqual(result.already_granted, ["world.write"])
})
