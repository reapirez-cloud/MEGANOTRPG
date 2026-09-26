type JsonRecord = Record<string, unknown>

// Some OpenAI-compatible models stringify nested tool arguments despite the
// declared array schema. Normalize only an actual JSON array, never prose.
export function normalizeInventoryToolArgs(input: JsonRecord): {
  args: JsonRecord
  error: string | null
} {
  if (!["grant", "consume", "remove", "batch"].includes(String(input.action))) {
    return { args: input, error: "inventory_action_invalid" }
  }
  if (typeof input.character_id !== "string" || !input.character_id.trim()) {
    return { args: input, error: "inventory_character_id_required" }
  }
  if (input.action === "grant" &&
    (!input.item || typeof input.item !== "object" || Array.isArray(input.item))) {
    return { args: input, error: "inventory_grant_item_required" }
  }
  if (["consume", "remove"].includes(String(input.action)) &&
    (typeof input.item_id !== "string" || !input.item_id.trim())) {
    return { args: input, error: "inventory_item_id_required" }
  }
  if (input.action !== "batch") return { args: input, error: null }

  let deltas: unknown = input.deltas
  if (typeof deltas === "string" && deltas.length <= 120000) {
    try {
      deltas = JSON.parse(deltas)
    } catch {
      return { args: input, error: "inventory_batch_deltas_must_be_array" }
    }
  }
  if (!Array.isArray(deltas) || deltas.length < 1 || deltas.length > 16) {
    return { args: input, error: "inventory_batch_deltas_must_be_array" }
  }
  for (const delta of deltas) {
    if (!delta || typeof delta !== "object" || Array.isArray(delta)) {
      return { args: input, error: "inventory_batch_delta_invalid" }
    }
    const row = delta as JsonRecord
    if (
      !["grant", "consume", "remove"].includes(String(row.action)) ||
      "deltas" in row
    ) {
      return { args: input, error: "inventory_batch_delta_invalid" }
    }
    if (row.character_id != null && row.character_id !== input.character_id) {
      return { args: input, error: "inventory_batch_character_mismatch" }
    }
    if (row.action === "grant" &&
      (!row.item || typeof row.item !== "object" || Array.isArray(row.item))) {
      return { args: input, error: "inventory_batch_grant_item_required" }
    }
    if (["consume", "remove"].includes(String(row.action)) &&
      (typeof row.item_id !== "string" || !row.item_id.trim())) {
      return { args: input, error: "inventory_batch_item_id_required" }
    }
  }
  return { args: { ...input, deltas }, error: null }
}
