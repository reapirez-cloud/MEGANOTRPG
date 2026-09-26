import assert from "node:assert/strict"
import test from "node:test"
import { ProviderGatewayError } from "../supabase/functions/voss-agent/provider-gateway.ts"
import { isTransientProviderFailure } from "../supabase/functions/voss-agent/provider-recovery.ts"

function failure(code: string, providerStatus: number | null) {
  return new ProviderGatewayError(code, {
    code,
    status: 502,
    providerStatus,
  })
}

test("bounded recovery accepts temporary gateway failures", () => {
  for (const status of [429, 500, 502, 503, 504, 520, 524]) {
    assert.equal(isTransientProviderFailure(failure("ai_provider_error", status)), true)
  }
  assert.equal(isTransientProviderFailure(failure("ai_provider_timeout", null)), true)
  assert.equal(isTransientProviderFailure(failure("ai_provider_invalid_response", null)), true)
})

test("bad commands and authorization failures are never retried as provider outages", () => {
  for (const status of [400, 401, 403, 404, 422]) {
    assert.equal(isTransientProviderFailure(failure("ai_provider_error", status)), false)
  }
  assert.equal(isTransientProviderFailure(new Error("inventory_no_free_slot")), false)
})
