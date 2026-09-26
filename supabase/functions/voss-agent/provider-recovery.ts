import { ProviderGatewayError } from "./provider-gateway.ts"

// Only failures that may clear without changing the requested tool/contract
// are eligible for a bounded continuation or a different worker model.
export function isTransientProviderFailure(error: unknown): error is ProviderGatewayError {
  return error instanceof ProviderGatewayError && (
    error.code === "ai_provider_timeout" ||
    error.code === "ai_provider_invalid_response" ||
    [429, 500, 502, 503, 504, 520, 521, 522, 523, 524]
      .includes(error.providerStatus || 0)
  )
}
