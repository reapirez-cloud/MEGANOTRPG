// Mirrors the canonical CE/GM boundary documented in
// src/rule-templates/CLASS_INTEGRATION_NOTES.md and GM_ADJUDICATION_BOUNDARY.md.
// Keep this compiler restrictive: unsupported durable mechanics escalate to Developer Mode.

export const MECHANICS_COMPILER_VERSION = 1

type JsonRecord = Record<string, unknown>

export type MechanicsDiagnostic = {
  severity: "error" | "warning" | "info"
  code: string
  path: string
  message: string
}

export type MechanicsCompileResult = {
  ok: boolean
  mechanics: JsonRecord[]
  diagnostics: MechanicsDiagnostic[]
}

const ABILITIES = new Set([
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
])

const NUMERIC_OPERATIONS = new Set([
  "ADD",
  "SUBTRACT",
  "SET",
  "MIN",
  "MAX",
  "MULTIPLY",
])

const GRANT_TARGETS = new Set([
  "resistance",
  "immunity",
  "language",
  "proficiency",
  "sense",
  "feature",
  "trait",
  "value",
  "permission",
])

const ALL_GRANT_TARGETS = new Set([
  ...GRANT_TARGETS,
  "resource",
  "action",
  "spell",
])

const RECHARGE_TRIGGERS = new Set([
  "short_rest",
  "long_rest",
  "dawn",
])

const COMMON_KEYS = new Set([
  "id",
  "type",
  "label",
  "activation",
  "condition",
  "sourceKey",
  "variantKey",
  "priority",
  "grantOperation",
  "curseEffect",
  "presentation",
])

const TYPE_KEYS: Record<string, Set<string>> = {
  numeric: new Set(["target", "operation", "value"]),
  formula: new Set(["target", "operation", "formula"]),
  grant: new Set(["target", "key", "payload"]),
  resource: new Set([
    "key",
    "label",
    "max",
    "recharge",
    "recoveryRules",
    "restore",
    "restoreAmount",
    "initial",
  ]),
  action: new Set([
    "key",
    "label",
    "economy",
    "range",
    "attackAbility",
    "proficient",
    "attackFlat",
    "damage",
    "resourceKey",
    "resourceCost",
    "resourceCosts",
    "costOptions",
    "requirements",
    "effects",
    "tags",
  ]),
  spell: new Set(["key", "catalogSlug", "payload"]),
}

const FAKE_SCENE_STATE_PATTERNS = [
  /(^|[._:-])turn([._:-]|$)/i,
  /(^|[._:-])round([._:-]|$)/i,
  /once[._:-]?per[._:-]?(turn|round)/i,
  /(action|bonus_action|reaction)[._:-]?(available|spent|used)/i,
  /(hit|attack)[._:-]?(confirmed|landed|success)/i,
  /(save|saving_throw)[._:-]?(failed|succeeded|success)/i,
  /target[._:-]?(visible|willing|reachable|qualified)/i,
  /(weather|raining|rain|corpse|free_space|nearby_object|nearby_plant)/i,
]

function object(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {}
}

function text(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function number(value: unknown) {
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

function stableKey(value: unknown, max = 180) {
  const result = text(value, max)
  return /^[a-zA-Z0-9][a-zA-Z0-9:._-]*$/.test(result) ? result : ""
}

function push(
  diagnostics: MechanicsDiagnostic[],
  severity: MechanicsDiagnostic["severity"],
  code: string,
  path: string,
  message: string,
) {
  diagnostics.push({ severity, code, path, message })
}

function jsonValue(
  value: unknown,
  diagnostics: MechanicsDiagnostic[],
  path: string,
  depth = 0,
): unknown {
  if (depth > 8) {
    push(diagnostics, "error", "json_depth", path, "JSON payload is too deeply nested.")
    return null
  }

  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) return value

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      push(diagnostics, "error", "json_number", path, "JSON number must be finite.")
      return 0
    }
    return value
  }

  if (Array.isArray(value)) {
    if (value.length > 64) {
      push(diagnostics, "error", "json_array_size", path, "JSON array is too large.")
    }
    return value.slice(0, 64).map((item, index) =>
      jsonValue(item, diagnostics, path + "[" + index + "]", depth + 1)
    )
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as JsonRecord)
    if (entries.length > 64) {
      push(diagnostics, "error", "json_object_size", path, "JSON object has too many keys.")
    }
    return Object.fromEntries(
      entries.slice(0, 64).map(([key, item]) => [
        key.slice(0, 120),
        jsonValue(item, diagnostics, path + "." + key, depth + 1),
      ]),
    )
  }

  push(diagnostics, "error", "json_type", path, "Unsupported JSON value.")
  return null
}

function isFakeSceneState(key: string) {
  return FAKE_SCENE_STATE_PATTERNS.some((pattern) => pattern.test(key))
}

function formula(
  value: unknown,
  diagnostics: MechanicsDiagnostic[],
  path: string,
  depth = 0,
): JsonRecord | null {
  if (depth > 8) {
    push(diagnostics, "error", "formula_depth", path, "Formula nesting is too deep.")
    return null
  }

  const row = object(value)
  const kind = text(row.kind, 32)

  if (kind === "literal") {
    const valueNumber = number(row.value)
    if (valueNumber === null) {
      push(diagnostics, "error", "formula_literal", path + ".value", "Literal formula requires a finite number.")
      return null
    }
    return { kind, value: valueNumber }
  }

  if (kind === "reference") {
    const key = stableKey(row.key, 220)
    if (!key) {
      push(diagnostics, "error", "formula_reference", path + ".key", "Formula reference requires a stable key.")
      return null
    }
    return { kind, key }
  }

  if (kind === "add" || kind === "multiply") {
    const field = kind === "add" ? "terms" : "factors"
    const values = Array.isArray(row[field]) ? row[field] as unknown[] : []
    if (values.length < 1 || values.length > 16) {
      push(diagnostics, "error", "formula_arity", path + "." + field, "Formula requires 1-16 operands.")
      return null
    }
    const compiled = values.map((item, index) =>
      formula(item, diagnostics, path + "." + field + "[" + index + "]", depth + 1)
    )
    if (compiled.some((item) => !item)) return null
    return { kind, [field]: compiled }
  }

  if (kind === "subtract") {
    const left = formula(row.left, diagnostics, path + ".left", depth + 1)
    const right = formula(row.right, diagnostics, path + ".right", depth + 1)
    return left && right ? { kind, left, right } : null
  }

  if (kind === "min" || kind === "max") {
    const values = Array.isArray(row.values) ? row.values : []
    if (values.length < 1 || values.length > 16) {
      push(diagnostics, "error", "formula_arity", path + ".values", "Formula requires 1-16 values.")
      return null
    }
    const compiled = values.map((item, index) =>
      formula(item, diagnostics, path + ".values[" + index + "]", depth + 1)
    )
    if (compiled.some((item) => !item)) return null
    return { kind, values: compiled }
  }

  if (kind === "clamp") {
    const inner = formula(row.value, diagnostics, path + ".value", depth + 1)
    if (!inner) return null
    const min = row.min === undefined ? null : number(row.min)
    const max = row.max === undefined ? null : number(row.max)
    if (row.min !== undefined && min === null) {
      push(diagnostics, "error", "formula_clamp_min", path + ".min", "Clamp min must be numeric.")
    }
    if (row.max !== undefined && max === null) {
      push(diagnostics, "error", "formula_clamp_max", path + ".max", "Clamp max must be numeric.")
    }
    if ((row.min !== undefined && min === null) || (row.max !== undefined && max === null)) {
      return null
    }
    return {
      kind,
      value: inner,
      ...(min === null ? {} : { min }),
      ...(max === null ? {} : { max }),
    }
  }

  push(diagnostics, "error", "formula_kind", path + ".kind", "Unsupported formula kind.")
  return null
}

function condition(
  value: unknown,
  diagnostics: MechanicsDiagnostic[],
  path: string,
  depth = 0,
): JsonRecord | null {
  if (depth > 8) {
    push(diagnostics, "error", "condition_depth", path, "Condition nesting is too deep.")
    return null
  }

  const row = object(value)
  const kind = text(row.kind, 40)

  if (kind === "always") return { kind }

  if (kind === "hp_below_percent") {
    const percent = number(row.percent)
    if (percent === null || percent <= 0 || percent > 100) {
      push(diagnostics, "error", "condition_hp_percent", path + ".percent", "HP percent must be > 0 and <= 100.")
      return null
    }
    return { kind, percent }
  }

  if (kind === "state") {
    const key = stableKey(row.key, 180)
    const operator = text(row.operator, 32)
    if (!key) {
      push(diagnostics, "error", "condition_state_key", path + ".key", "State condition requires a stable key.")
      return null
    }
    if (isFakeSceneState(key)) {
      push(
        diagnostics,
        "error",
        "gm_scene_state_not_authoritative",
        path + ".key",
        "This state looks like scene/turn legality that belongs to GM adjudication, not CE state.",
      )
      return null
    }

    if (operator === "EXISTS" || operator === "NOT_EXISTS") {
      return { kind, key, operator }
    }

    if (operator === "EQUALS" || operator === "NOT_EQUALS") {
      const raw = row.value
      if (
        raw !== null &&
        typeof raw !== "string" &&
        typeof raw !== "number" &&
        typeof raw !== "boolean"
      ) {
        push(diagnostics, "error", "condition_state_value", path + ".value", "State equality requires a scalar value.")
        return null
      }
      return { kind, key, operator, value: raw ?? null }
    }

    if (["GT", "GTE", "LT", "LTE"].includes(operator)) {
      const numeric = number(row.value)
      if (numeric === null) {
        push(diagnostics, "error", "condition_state_number", path + ".value", "Numeric state comparison requires a finite number.")
        return null
      }
      return { kind, key, operator, value: numeric }
    }

    push(diagnostics, "error", "condition_state_operator", path + ".operator", "Unsupported state operator.")
    return null
  }

  if (kind === "all" || kind === "any") {
    const values = Array.isArray(row.conditions) ? row.conditions : []
    if (!values.length || values.length > 16) {
      push(diagnostics, "error", "condition_arity", path + ".conditions", "Condition group requires 1-16 children.")
      return null
    }
    const compiled = values.map((item, index) =>
      condition(item, diagnostics, path + ".conditions[" + index + "]", depth + 1)
    )
    if (compiled.some((item) => !item)) return null
    return { kind, conditions: compiled }
  }

  if (kind === "not") {
    const inner = condition(row.condition, diagnostics, path + ".condition", depth + 1)
    return inner ? { kind, condition: inner } : null
  }

  push(diagnostics, "error", "condition_kind", path + ".kind", "Unsupported condition kind.")
  return null
}

function numericTarget(value: unknown) {
  const target = text(value, 240)
  if (
    /^(abilities\.(strength|dexterity|constitution|intelligence|wisdom|charisma)|core\.proficiencyBonus|skills\.[a-z_]+\.bonus|savingThrows\.(strength|dexterity|constitution|intelligence|wisdom|charisma)\.bonus|passives\.(perception|investigation|insight)|combat\.(ac|initiative|maxHp|speed)|carrying\.capacityKg)$/.test(target)
  ) return target

  if (
    /^resources\.[a-zA-Z0-9:._-]+\.max$/.test(target) ||
    /^values\.[a-zA-Z0-9:._-]+$/.test(target) ||
    /^actions\.[a-zA-Z0-9:._-]+\.(attackBonus|damage\.[a-zA-Z0-9:._-]+\.modifier)$/.test(target) ||
    /^spells\.[a-zA-Z0-9:._-]+\.access\.[a-zA-Z0-9:._-]+\.method\.[a-zA-Z0-9:._-]+\.(attackBonus|saveDc)$/.test(target)
  ) return target

  return ""
}

function compileRange(
  value: unknown,
  diagnostics: MechanicsDiagnostic[],
  path: string,
) {
  if (value === undefined) return undefined
  const row = object(value)
  const kind = text(row.kind, 32)

  if (kind === "self" || kind === "touch") return { kind }

  if (kind === "melee") {
    const reach = number(row.reach)
    const unit = text(row.unit, 32)
    if (reach === null || reach < 0 || !unit) {
      push(diagnostics, "error", "action_range", path, "Melee range requires non-negative reach and unit.")
      return null
    }
    return { kind, reach, unit }
  }

  if (kind === "ranged") {
    const normal = number(row.normal)
    const long = row.long === undefined ? null : number(row.long)
    const unit = text(row.unit, 32)
    if (
      normal === null ||
      normal < 0 ||
      !unit ||
      (row.long !== undefined && (long === null || long < normal))
    ) {
      push(diagnostics, "error", "action_range", path, "Ranged range is invalid.")
      return null
    }
    return {
      kind,
      normal,
      ...(long === null ? {} : { long }),
      unit,
    }
  }

  if (kind === "area") {
    const shape = text(row.shape, 60)
    const size = number(row.size)
    const unit = text(row.unit, 32)
    if (!shape || size === null || size <= 0 || !unit) {
      push(diagnostics, "error", "action_range", path, "Area range requires shape, positive size and unit.")
      return null
    }
    return { kind, shape, size, unit }
  }

  if (kind === "custom") {
    const label = text(row.label, 180)
    if (!label) {
      push(diagnostics, "error", "action_range", path, "Custom range requires a label.")
      return null
    }
    return { kind, label }
  }

  push(diagnostics, "error", "action_range_kind", path + ".kind", "Unsupported action range kind.")
  return null
}

function compileResourceCost(
  value: unknown,
  diagnostics: MechanicsDiagnostic[],
  path: string,
) {
  const row = object(value)
  const key = stableKey(row.key, 180)
  const amount = number(row.amount)
  const variantKey = row.variantKey === undefined
    ? ""
    : stableKey(row.variantKey, 180)

  if (!key || amount === null || !Number.isInteger(amount) || amount <= 0) {
    push(diagnostics, "error", "resource_cost", path, "Resource cost requires a stable key and positive integer amount.")
    return null
  }
  if (row.variantKey !== undefined && !variantKey) {
    push(diagnostics, "error", "resource_cost_variant", path + ".variantKey", "Invalid resource variant key.")
    return null
  }

  return {
    key,
    ...(variantKey ? { variantKey } : {}),
    amount,
  }
}

function compileRequirement(
  value: unknown,
  diagnostics: MechanicsDiagnostic[],
  path: string,
) {
  const row = object(value)
  const kind = text(row.kind, 32)
  const enforcement = row.enforcement === "gm" ? "gm" : "engine"
  const label = text(row.label, 240)

  if (enforcement === "gm") {
    push(
      diagnostics,
      "error",
      "gm_requirement_not_runtime",
      path + ".enforcement",
      "GM-adjudicated scene legality belongs in exact rule text, not an executable action requirement.",
    )
    return null
  }

  if (kind === "condition") {
    const compiled = condition(row.condition, diagnostics, path + ".condition")
    return compiled
      ? { kind, condition: compiled, enforcement, ...(label ? { label } : {}) }
      : null
  }

  if (kind === "resource") {
    const key = stableKey(row.key, 180)
    const minimum = number(row.minimum)
    const maximum = row.maximum === undefined ? null : number(row.maximum)
    const variantKey = row.variantKey === undefined ? "" : stableKey(row.variantKey, 180)
    if (
      !key ||
      minimum === null ||
      minimum < 0 ||
      (row.maximum !== undefined && (maximum === null || maximum < minimum)) ||
      (row.variantKey !== undefined && !variantKey)
    ) {
      push(diagnostics, "error", "resource_requirement", path, "Invalid resource requirement.")
      return null
    }
    return {
      kind,
      key,
      ...(variantKey ? { variantKey } : {}),
      minimum,
      ...(maximum === null ? {} : { maximum }),
      enforcement,
      ...(label ? { label } : {}),
    }
  }

  if (kind === "grant") {
    const target = text(row.target, 40)
    const key = stableKey(row.key, 180)
    const variantKey = row.variantKey === undefined ? "" : stableKey(row.variantKey, 180)
    if (!ALL_GRANT_TARGETS.has(target) || !key || (row.variantKey !== undefined && !variantKey)) {
      push(diagnostics, "error", "grant_requirement", path, "Invalid grant requirement.")
      return null
    }
    return {
      kind,
      target,
      key,
      ...(variantKey ? { variantKey } : {}),
      enforcement,
      ...(label ? { label } : {}),
    }
  }

  push(diagnostics, "error", "action_requirement_kind", path + ".kind", "Unsupported action requirement kind.")
  return null
}

function compileEffect(
  value: unknown,
  diagnostics: MechanicsDiagnostic[],
  path: string,
) {
  const row = object(value)
  const kind = text(row.kind, 40)

  if (kind === "state") {
    const key = stableKey(row.key, 180)
    const operation = text(row.operation, 24)
    if (!key) {
      push(diagnostics, "error", "state_effect_key", path + ".key", "State effect requires a stable key.")
      return null
    }
    if (isFakeSceneState(key)) {
      push(
        diagnostics,
        "error",
        "gm_scene_state_not_authoritative",
        path + ".key",
        "Do not persist scene/turn legality as fake CE state.",
      )
      return null
    }
    if (operation === "UNSET") return { kind, key, operation }
    if (operation === "SET") {
      const raw = row.value
      if (
        raw !== null &&
        typeof raw !== "string" &&
        typeof raw !== "number" &&
        typeof raw !== "boolean"
      ) {
        push(diagnostics, "error", "state_effect_value", path + ".value", "State SET requires a scalar value.")
        return null
      }
      return { kind, key, operation, value: raw ?? null }
    }
    if (operation === "ADD" || operation === "SUBTRACT") {
      const valueNumber = number(row.value)
      if (valueNumber === null) {
        push(diagnostics, "error", "state_effect_number", path + ".value", "Numeric state effect requires a finite number.")
        return null
      }
      return { kind, key, operation, value: valueNumber }
    }
    push(diagnostics, "error", "state_effect_operation", path + ".operation", "Unsupported state effect operation.")
    return null
  }

  if (kind === "resource") {
    const key = stableKey(row.key, 180)
    const variantKey = row.variantKey === undefined ? "" : stableKey(row.variantKey, 180)
    const operation = text(row.operation, 40)
    if (
      !key ||
      (row.variantKey !== undefined && !variantKey) ||
      !["RESTORE", "SPEND", "SET", "GRANT_TEMPORARY_MAX", "ENSURE_MINIMUM"].includes(operation)
    ) {
      push(diagnostics, "error", "resource_effect", path, "Invalid resource effect.")
      return null
    }
    const amount = typeof row.amount === "number"
      ? number(row.amount)
      : formula(row.amount, diagnostics, path + ".amount")
    if (amount === null) {
      push(diagnostics, "error", "resource_effect_amount", path + ".amount", "Resource effect requires a non-negative amount/formula.")
      return null
    }
    if (typeof amount === "number" && amount < 0) {
      push(diagnostics, "error", "resource_effect_amount", path + ".amount", "Resource effect amount must be non-negative.")
      return null
    }
    return {
      kind,
      key,
      ...(variantKey ? { variantKey } : {}),
      operation,
      amount,
    }
  }

  if (kind === "semantic") {
    const key = stableKey(row.key, 180)
    if (!key) {
      push(diagnostics, "error", "semantic_effect_key", path + ".key", "Semantic effect requires a stable key.")
      return null
    }
    return {
      kind,
      key,
      ...(row.payload === undefined
        ? {}
        : { payload: jsonValue(row.payload, diagnostics, path + ".payload") }),
    }
  }

  if (kind === "template_choice") {
    const choiceKey = stableKey(row.choiceKey, 180)
    const operation = text(row.operation, 40)
    const options = Array.isArray(row.options)
      ? row.options.map((item) => stableKey(item, 180)).filter(Boolean)
      : []
    if (!choiceKey || operation !== "SET_OPTION" || !options.length) {
      push(diagnostics, "error", "template_choice_effect", path, "Invalid template choice effect.")
      return null
    }
    return {
      kind,
      choiceKey,
      operation,
      options: [...new Set(options)],
      ...(row.optionLabels && typeof row.optionLabels === "object"
        ? { optionLabels: jsonValue(row.optionLabels, diagnostics, path + ".optionLabels") }
        : {}),
    }
  }

  push(diagnostics, "error", "action_effect_kind", path + ".kind", "Unsupported action effect kind.")
  return null
}

function commonFields(
  row: JsonRecord,
  diagnostics: MechanicsDiagnostic[],
  path: string,
) {
  const id = stableKey(row.id)
  const sourceKey = stableKey(row.sourceKey)
  if (!id) {
    push(diagnostics, "error", "mechanic_id", path + ".id", "Mechanic requires a stable id.")
  }
  if (!sourceKey) {
    push(
      diagnostics,
      "error",
      "mechanic_source_key",
      path + ".sourceKey",
      "Every compiled mechanic requires a stable sourceKey for provenance and GM suppression.",
    )
  }

  const activation = row.activation === undefined ? "" : text(row.activation, 32)
  if (activation && !["carried", "equipped"].includes(activation)) {
    push(diagnostics, "error", "mechanic_activation", path + ".activation", "Unsupported activation.")
  }

  const conditionValue = row.condition === undefined
    ? undefined
    : condition(row.condition, diagnostics, path + ".condition")

  const variantKey = row.variantKey === undefined ? "" : stableKey(row.variantKey)
  if (row.variantKey !== undefined && !variantKey) {
    push(diagnostics, "error", "mechanic_variant_key", path + ".variantKey", "Invalid variantKey.")
  }

  const priority = row.priority === undefined ? null : number(row.priority)
  if (row.priority !== undefined && (priority === null || !Number.isInteger(priority))) {
    push(diagnostics, "error", "mechanic_priority", path + ".priority", "Priority must be an integer.")
  }

  const grantOperation = row.grantOperation === undefined ? "" : text(row.grantOperation, 24)
  if (grantOperation && !["GRANT", "REPLACE"].includes(grantOperation)) {
    push(diagnostics, "error", "grant_operation", path + ".grantOperation", "Unsupported grant operation.")
  }

  const presentation = row.presentation === undefined
    ? undefined
    : jsonValue(row.presentation, diagnostics, path + ".presentation")

  return {
    id,
    ...(text(row.label, 240) ? { label: text(row.label, 240) } : {}),
    ...(activation ? { activation } : {}),
    ...(conditionValue ? { condition: conditionValue } : {}),
    sourceKey,
    ...(variantKey ? { variantKey } : {}),
    ...(priority === null ? {} : { priority }),
    ...(grantOperation ? { grantOperation } : {}),
    ...(row.curseEffect === true ? { curseEffect: true } : {}),
    ...(presentation === undefined ? {} : { presentation }),
  }
}

function unknownFields(
  row: JsonRecord,
  type: string,
  diagnostics: MechanicsDiagnostic[],
  path: string,
) {
  const allowed = new Set([
    ...COMMON_KEYS,
    ...(TYPE_KEYS[type] || []),
  ])
  for (const key of Object.keys(row)) {
    if (!allowed.has(key)) {
      push(
        diagnostics,
        "error",
        "unsupported_field",
        path + "." + key,
        "Field is not part of the StoredMechanics contract for type " + type + ".",
      )
    }
  }
}

function compileMechanic(
  raw: unknown,
  diagnostics: MechanicsDiagnostic[],
  index: number,
): JsonRecord | null {
  const path = "mechanics[" + index + "]"
  const row = object(raw)
  const type = text(row.type, 32)

  if (!TYPE_KEYS[type]) {
    push(diagnostics, "error", "mechanic_type", path + ".type", "Unsupported mechanic type.")
    return null
  }

  unknownFields(row, type, diagnostics, path)
  const common = commonFields(row, diagnostics, path)
  if (!common.id || !common.sourceKey) return null

  if (type === "numeric") {
    const target = numericTarget(row.target)
    const operation = text(row.operation, 24)
    const valueNumber = number(row.value)
    if (!target) push(diagnostics, "error", "numeric_target", path + ".target", "Unsupported numeric target.")
    if (!NUMERIC_OPERATIONS.has(operation)) push(diagnostics, "error", "numeric_operation", path + ".operation", "Unsupported numeric operation.")
    if (valueNumber === null) push(diagnostics, "error", "numeric_value", path + ".value", "Numeric mechanic requires a finite number.")
    if (!target || !NUMERIC_OPERATIONS.has(operation) || valueNumber === null) return null
    return { ...common, type, target, operation, value: valueNumber }
  }

  if (type === "formula") {
    const target = text(row.target, 80)
    const compiled = formula(row.formula, diagnostics, path + ".formula")
    if (!["combat.ac", "combat.initiative"].includes(target)) {
      push(diagnostics, "error", "formula_target", path + ".target", "Formula target must be combat.ac or combat.initiative.")
    }
    if (row.operation !== "SET_FORMULA") {
      push(diagnostics, "error", "formula_operation", path + ".operation", "Formula mechanic operation must be SET_FORMULA.")
    }
    if (!compiled || !["combat.ac", "combat.initiative"].includes(target) || row.operation !== "SET_FORMULA") return null
    return { ...common, type, target, operation: "SET_FORMULA", formula: compiled }
  }

  if (type === "grant") {
    const target = text(row.target, 40)
    const key = stableKey(row.key)
    if (!GRANT_TARGETS.has(target)) push(diagnostics, "error", "grant_target", path + ".target", "Unsupported grant target.")
    if (!key) push(diagnostics, "error", "grant_key", path + ".key", "Grant requires a stable key.")
    if (!GRANT_TARGETS.has(target) || !key) return null
    return {
      ...common,
      type,
      target,
      key,
      ...(row.payload === undefined
        ? {}
        : { payload: jsonValue(row.payload, diagnostics, path + ".payload") }),
    }
  }

  if (type === "resource") {
    const key = stableKey(row.key)
    const label = text(row.label, 240)
    const max = typeof row.max === "number"
      ? number(row.max)
      : formula(row.max, diagnostics, path + ".max")
    const rechargeRaw = Array.isArray(row.recharge) ? row.recharge : [row.recharge]
    const recharge = rechargeRaw
      .map((item) => text(item, 32))
      .filter(Boolean)

    if (!key) push(diagnostics, "error", "resource_key", path + ".key", "Resource requires a stable key.")
    if (!label) push(diagnostics, "error", "resource_label", path + ".label", "Resource requires a label.")
    if (max === null || (typeof max === "number" && max < 0)) {
      push(diagnostics, "error", "resource_max", path + ".max", "Resource max requires a non-negative number/formula.")
    }
    if (!recharge.length || recharge.some((item) => !RECHARGE_TRIGGERS.has(item))) {
      push(
        diagnostics,
        "error",
        "resource_recharge",
        path + ".recharge",
        "Persistent resources may recharge only on short_rest, long_rest or dawn.",
      )
    }

    const recoveryRules = Array.isArray(row.recoveryRules)
      ? row.recoveryRules.map((item, ruleIndex) => {
          const rule = object(item)
          const trigger = text(rule.trigger, 32)
          const restore = text(rule.restore, 24)
          const amount = rule.amount === undefined ? null : number(rule.amount)
          if (
            !RECHARGE_TRIGGERS.has(trigger) ||
            !["full", "amount", "set"].includes(restore) ||
            ((restore === "amount" || restore === "set") && (amount === null || amount < 0))
          ) {
            push(diagnostics, "error", "resource_recovery_rule", path + ".recoveryRules[" + ruleIndex + "]", "Invalid resource recovery rule.")
            return null
          }
          return {
            trigger,
            restore,
            ...((restore === "amount" || restore === "set") ? { amount } : {}),
          }
        }).filter(Boolean)
      : []

    const restore = row.restore === undefined ? "" : text(row.restore, 24)
    const restoreAmount = row.restoreAmount === undefined ? null : number(row.restoreAmount)
    if (restore && !["full", "amount", "set"].includes(restore)) {
      push(diagnostics, "error", "resource_restore", path + ".restore", "Unsupported restore policy.")
    }
    if ((restore === "amount" || restore === "set") && (restoreAmount === null || restoreAmount < 0)) {
      push(diagnostics, "error", "resource_restore_amount", path + ".restoreAmount", "Restore amount must be non-negative.")
    }

    let initial: unknown = undefined
    if (row.initial === "full" || row.initial === "empty") {
      initial = row.initial
    } else if (row.initial !== undefined) {
      const numeric = number(row.initial)
      if (numeric === null || numeric < 0) {
        push(diagnostics, "error", "resource_initial", path + ".initial", "Initial resource value is invalid.")
      } else {
        initial = numeric
      }
    }

    if (
      !key ||
      !label ||
      max === null ||
      (typeof max === "number" && max < 0) ||
      !recharge.length ||
      recharge.some((item) => !RECHARGE_TRIGGERS.has(item))
    ) return null

    return {
      ...common,
      type,
      key,
      label,
      max,
      recharge: recharge.length === 1 ? recharge[0] : [...new Set(recharge)],
      ...(recoveryRules.length ? { recoveryRules } : {}),
      ...(restore ? { restore } : {}),
      ...(restoreAmount === null ? {} : { restoreAmount }),
      ...(initial === undefined ? {} : { initial }),
    }
  }

  if (type === "action") {
    const key = stableKey(row.key)
    const label = text(row.label, 240)
    const economy = text(row.economy, 80)
    if (!key) push(diagnostics, "error", "action_key", path + ".key", "Action requires a stable key.")
    if (!label) push(diagnostics, "error", "action_label", path + ".label", "Action requires a label.")
    if (!economy) push(diagnostics, "error", "action_economy", path + ".economy", "Action requires semantic economy text.")

    const range = compileRange(row.range, diagnostics, path + ".range")
    const attackAbility = row.attackAbility === undefined ? "" : text(row.attackAbility, 32)
    if (attackAbility && !ABILITIES.has(attackAbility)) {
      push(diagnostics, "error", "action_attack_ability", path + ".attackAbility", "Unsupported attack ability.")
    }
    const attackFlat = row.attackFlat === undefined ? null : number(row.attackFlat)
    if (row.attackFlat !== undefined && attackFlat === null) {
      push(diagnostics, "error", "action_attack_flat", path + ".attackFlat", "attackFlat must be numeric.")
    }

    const damage = Array.isArray(row.damage)
      ? row.damage.slice(0, 16).map((item, damageIndex) => {
          const d = object(item)
          const damageKey = stableKey(d.key, 120)
          const damageType = text(d.damageType, 80)
          const count = typeof d.count === "number"
            ? number(d.count)
            : formula(d.count, diagnostics, path + ".damage[" + damageIndex + "].count")
          const sides = typeof d.sides === "number"
            ? number(d.sides)
            : formula(d.sides, diagnostics, path + ".damage[" + damageIndex + "].sides")
          const ability = d.ability === undefined ? "" : text(d.ability, 32)
          const flat = d.flat === undefined ? null : number(d.flat)
          if (!damageKey || !damageType || count === null || sides === null) {
            push(diagnostics, "error", "action_damage", path + ".damage[" + damageIndex + "]", "Damage requires key, type, count and sides.")
            return null
          }
          if (typeof count === "number" && (!Number.isInteger(count) || count < 1)) {
            push(diagnostics, "error", "action_damage_count", path + ".damage[" + damageIndex + "].count", "Damage die count must be integer >= 1.")
            return null
          }
          if (typeof sides === "number" && (!Number.isInteger(sides) || sides < 2)) {
            push(diagnostics, "error", "action_damage_sides", path + ".damage[" + damageIndex + "].sides", "Damage die sides must be integer >= 2.")
            return null
          }
          if (ability && !ABILITIES.has(ability)) {
            push(diagnostics, "error", "action_damage_ability", path + ".damage[" + damageIndex + "].ability", "Unsupported damage ability.")
            return null
          }
          if (d.flat !== undefined && flat === null) {
            push(diagnostics, "error", "action_damage_flat", path + ".damage[" + damageIndex + "].flat", "Damage flat must be numeric.")
            return null
          }
          return {
            key: damageKey,
            ...(text(d.label, 160) ? { label: text(d.label, 160) } : {}),
            damageType,
            count,
            sides,
            ...(ability ? { ability } : {}),
            ...(flat === null ? {} : { flat }),
          }
        }).filter(Boolean)
      : []

    const resourceCosts = Array.isArray(row.resourceCosts)
      ? row.resourceCosts.slice(0, 16)
        .map((item, costIndex) =>
          compileResourceCost(item, diagnostics, path + ".resourceCosts[" + costIndex + "]")
        )
        .filter(Boolean)
      : []

    const costOptions = Array.isArray(row.costOptions)
      ? row.costOptions.slice(0, 12).map((item, optionIndex) => {
          const option = object(item)
          const optionKey = stableKey(option.key, 120)
          const costs = Array.isArray(option.costs)
            ? option.costs.slice(0, 12)
              .map((cost, costIndex) =>
                compileResourceCost(cost, diagnostics, path + ".costOptions[" + optionIndex + "].costs[" + costIndex + "]")
              )
              .filter(Boolean)
            : []
          if (!optionKey || !costs.length) {
            push(diagnostics, "error", "action_cost_option", path + ".costOptions[" + optionIndex + "]", "Cost option requires key and at least one valid cost.")
            return null
          }
          return {
            key: optionKey,
            costs,
            ...(text(option.label, 160) ? { label: text(option.label, 160) } : {}),
          }
        }).filter(Boolean)
      : []

    const requirements = Array.isArray(row.requirements)
      ? row.requirements.slice(0, 16)
        .map((item, reqIndex) =>
          compileRequirement(item, diagnostics, path + ".requirements[" + reqIndex + "]")
        )
        .filter(Boolean)
      : []

    const effects = Array.isArray(row.effects)
      ? row.effects.slice(0, 24)
        .map((item, effectIndex) =>
          compileEffect(item, diagnostics, path + ".effects[" + effectIndex + "]")
        )
        .filter(Boolean)
      : []

    const legacyResourceKey = row.resourceKey === undefined ? "" : stableKey(row.resourceKey)
    const legacyResourceCost = row.resourceCost === undefined ? null : number(row.resourceCost)
    if (row.resourceKey !== undefined && !legacyResourceKey) {
      push(diagnostics, "error", "action_legacy_resource_key", path + ".resourceKey", "Invalid legacy resource key.")
    }
    if (row.resourceCost !== undefined && (legacyResourceCost === null || legacyResourceCost <= 0)) {
      push(diagnostics, "error", "action_legacy_resource_cost", path + ".resourceCost", "Legacy resource cost must be positive.")
    }

    if (!key || !label || !economy || (attackAbility && !ABILITIES.has(attackAbility))) return null

    return {
      ...common,
      type,
      key,
      label,
      economy,
      ...(range === undefined ? {} : range === null ? {} : { range }),
      ...(attackAbility ? { attackAbility } : {}),
      ...(row.proficient === undefined ? {} : { proficient: row.proficient === true }),
      ...(attackFlat === null ? {} : { attackFlat }),
      ...(damage.length ? { damage } : {}),
      ...(legacyResourceKey ? { resourceKey: legacyResourceKey } : {}),
      ...(legacyResourceCost === null ? {} : { resourceCost: legacyResourceCost }),
      ...(resourceCosts.length ? { resourceCosts } : {}),
      ...(costOptions.length ? { costOptions } : {}),
      ...(requirements.length ? { requirements } : {}),
      ...(effects.length ? { effects } : {}),
      ...(Array.isArray(row.tags)
        ? { tags: [...new Set(row.tags.map((item) => stableKey(item, 100)).filter(Boolean))].slice(0, 24) }
        : {}),
    }
  }

  if (type === "spell") {
    const key = stableKey(row.key)
    const catalogSlug = stableKey(row.catalogSlug, 180)
    const payload = object(row.payload)
    const spell = object(payload.spell)
    const preparation = object(payload.preparation)
    const methods = Array.isArray(payload.methods) ? payload.methods.slice(0, 12) : []

    if (!key || !key.startsWith("spell:")) {
      push(diagnostics, "error", "spell_key", path + ".key", "Spell mechanic key must use spell:<slug>.")
    }
    if (!catalogSlug || key !== "spell:" + catalogSlug) {
      push(diagnostics, "error", "spell_catalog_slug", path + ".catalogSlug", "catalogSlug must match the spell key.")
    }

    const spellName = text(spell.name, 200)
    const spellLevel = number(spell.level)
    if (!spellName || spellLevel === null || !Number.isInteger(spellLevel) || spellLevel < 0 || spellLevel > 9) {
      push(diagnostics, "error", "spell_identity", path + ".payload.spell", "Spell identity requires name and level 0-9.")
    }

    const preparationMode = text(preparation.mode, 40)
    if (!["prepared", "always_prepared", "not_required"].includes(preparationMode)) {
      push(diagnostics, "error", "spell_preparation", path + ".payload.preparation.mode", "Unsupported spell preparation mode.")
    }

    const compiledMethods = methods.map((item, methodIndex) => {
      const method = object(item)
      const methodKey = stableKey(method.key, 140)
      const kind = stableKey(method.kind, 140)
      const ability = method.ability === undefined ? "" : text(method.ability, 32)
      if (!methodKey || !kind || (ability && !ABILITIES.has(ability))) {
        push(diagnostics, "error", "spell_method", path + ".payload.methods[" + methodIndex + "]", "Spell method requires stable key/kind and valid ability.")
        return null
      }

      const attackBonus = method.attackBonus === undefined
        ? undefined
        : formula(method.attackBonus, diagnostics, path + ".payload.methods[" + methodIndex + "].attackBonus")
      const saveDc = method.saveDc === undefined
        ? undefined
        : formula(method.saveDc, diagnostics, path + ".payload.methods[" + methodIndex + "].saveDc")

      const options = Array.isArray(method.resourceOptions)
        ? method.resourceOptions.slice(0, 16).map((optionRaw, optionIndex) => {
            const option = object(optionRaw)
            const optionKey = stableKey(option.key, 140)
            const castLevel = option.castLevel === undefined ? null : number(option.castLevel)
            const costs = Array.isArray(option.costs)
              ? option.costs.slice(0, 12)
                .map((cost, costIndex) =>
                  compileResourceCost(cost, diagnostics, path + ".payload.methods[" + methodIndex + "].resourceOptions[" + optionIndex + "].costs[" + costIndex + "]")
                )
                .filter(Boolean)
              : []
            if (
              !optionKey ||
              !costs.length ||
              (option.castLevel !== undefined &&
                (castLevel === null || !Number.isInteger(castLevel) || castLevel < 0 || castLevel > 9))
            ) {
              push(diagnostics, "error", "spell_resource_option", path + ".payload.methods[" + methodIndex + "].resourceOptions[" + optionIndex + "]", "Invalid spell resource option.")
              return null
            }
            return {
              key: optionKey,
              ...(castLevel === null ? {} : { castLevel }),
              costs,
            }
          }).filter(Boolean)
        : []

      return {
        key: methodKey,
        kind,
        ...(ability ? { ability } : {}),
        ...(attackBonus ? { attackBonus } : {}),
        ...(saveDc ? { saveDc } : {}),
        ...(method.requiresPrepared === undefined
          ? {}
          : { requiresPrepared: method.requiresPrepared === true }),
        ...(options.length ? { resourceOptions: options } : {}),
      }
    }).filter(Boolean)

    if (
      !key ||
      !key.startsWith("spell:") ||
      !catalogSlug ||
      key !== "spell:" + catalogSlug ||
      !spellName ||
      spellLevel === null ||
      !Number.isInteger(spellLevel) ||
      spellLevel < 0 ||
      spellLevel > 9 ||
      !["prepared", "always_prepared", "not_required"].includes(preparationMode) ||
      !compiledMethods.length
    ) return null

    return {
      ...common,
      type,
      key,
      catalogSlug,
      payload: {
        spell: {
          name: spellName,
          level: spellLevel,
          ...(text(spell.school, 100) ? { school: text(spell.school, 100) } : {}),
          ...(spell.ritual === true ? { ritual: true } : {}),
        },
        preparation: {
          mode: preparationMode,
          ...(preparation.defaultPrepared === undefined
            ? {}
            : { defaultPrepared: preparation.defaultPrepared === true }),
        },
        methods: compiledMethods,
      },
    }
  }

  return null
}

export function compileStoredMechanics(input: unknown): MechanicsCompileResult {
  const diagnostics: MechanicsDiagnostic[] = []

  if (!Array.isArray(input)) {
    return {
      ok: false,
      mechanics: [],
      diagnostics: [{
        severity: "error",
        code: "mechanics_array_required",
        path: "mechanics",
        message: "Mechanics must be an array.",
      }],
    }
  }

  if (input.length > 64) {
    push(diagnostics, "error", "mechanics_limit", "mechanics", "One compilation may contain at most 64 mechanics.")
  }

  const mechanics = input.slice(0, 64)
    .map((item, index) => compileMechanic(item, diagnostics, index))
    .filter((item): item is JsonRecord => Boolean(item))

  const ids = new Set<string>()
  for (let index = 0; index < mechanics.length; index += 1) {
    const id = String(mechanics[index].id || "")
    if (ids.has(id)) {
      push(
        diagnostics,
        "error",
        "duplicate_mechanic_id",
        "mechanics[" + index + "].id",
        "Mechanic ids must be unique inside one compiled package.",
      )
    }
    ids.add(id)
  }

  if (!mechanics.length && input.length) {
    push(
      diagnostics,
      "error",
      "mechanics_empty_after_validation",
      "mechanics",
      "No mechanics survived validation.",
    )
  }

  const rawSize = JSON.stringify(mechanics).length
  if (rawSize > 80000) {
    push(diagnostics, "error", "mechanics_size", "mechanics", "Compiled mechanics payload is too large.")
  }

  return {
    ok: diagnostics.every((item) => item.severity !== "error"),
    mechanics,
    diagnostics,
  }
}
