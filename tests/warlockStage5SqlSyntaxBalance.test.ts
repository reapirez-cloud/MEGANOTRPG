import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migrationPath = "supabase/migrations/20260907090000_warlock_phb2024_subclasses_runtime_v1.sql"
const sql = fs.readFileSync(migrationPath, "utf8")

type OpenParen = { line: number; column: number }

function unmatchedSqlParentheses(source: string): { extraClose: Array<{ line: number; column: number }>; unclosed: OpenParen[] } {
  const stack: OpenParen[] = []
  const extraClose: Array<{ line: number; column: number }> = []
  let line = 1
  let column = 0
  let inSingle = false
  let inDouble = false
  let inLineComment = false
  let blockDepth = 0

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]
    const next = source[i + 1]
    column += 1

    if (ch === "\n") {
      line += 1
      column = 0
      inLineComment = false
      continue
    }

    if (inLineComment) continue

    if (blockDepth > 0) {
      if (ch === "/" && next === "*") {
        blockDepth += 1
        i += 1
        column += 1
      } else if (ch === "*" && next === "/") {
        blockDepth -= 1
        i += 1
        column += 1
      }
      continue
    }

    if (inSingle) {
      if (ch === "'" && next === "'") {
        i += 1
        column += 1
      } else if (ch === "'") {
        inSingle = false
      }
      continue
    }

    if (inDouble) {
      if (ch === '"' && next === '"') {
        i += 1
        column += 1
      } else if (ch === '"') {
        inDouble = false
      }
      continue
    }

    if (ch === "-" && next === "-") {
      inLineComment = true
      i += 1
      column += 1
      continue
    }
    if (ch === "/" && next === "*") {
      blockDepth = 1
      i += 1
      column += 1
      continue
    }
    if (ch === "'") {
      inSingle = true
      continue
    }
    if (ch === '"') {
      inDouble = true
      continue
    }

    if (ch === "(") stack.push({ line, column })
    if (ch === ")") {
      if (stack.length === 0) extraClose.push({ line, column })
      else stack.pop()
    }
  }

  return { extraClose, unclosed: stack }
}

test("Warlock Stage 5 SQL has balanced executable parentheses", () => {
  const imbalance = unmatchedSqlParentheses(sql)
  assert.deepEqual(imbalance.extraClose, [], `unexpected closing parenthesis at ${JSON.stringify(imbalance.extraClose)}`)
  assert.deepEqual(imbalance.unclosed, [], `unclosed parenthesis opened at ${JSON.stringify(imbalance.unclosed)}`)
})

test("Warlock Stage 5 SQL closes every function and anonymous block delimiter", () => {
  const delimiters = sql.match(/\$\$/g) ?? []
  assert.equal(delimiters.length % 2, 0, `odd number of $$ delimiters: ${delimiters.length}`)
  assert.ok(delimiters.length >= 16, "Stage 5 installer should keep explicit function/block delimiters")
})