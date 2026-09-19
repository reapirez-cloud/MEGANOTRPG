import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const panel = fs.readFileSync(
  "src/ui-v1-isolated/CharacterSheetProficiencies.tsx",
  "utf8",
)
const styles = fs.readFileSync(
  "src/ui-v1-isolated/character-sheet-proficiencies.css",
  "utf8",
)
const roadmap = fs.readFileSync(
  "docs/CHARACTER_PROFICIENCIES_ROADMAP.md",
  "utf8",
)

test("proficiencies stage 3 gives every panel independent accordion state", () => {
  assert.match(panel, /type ExpandedGroups = Record<CharacterProficiencyGroupKey, boolean>/)
  assert.match(panel, /CHARACTER_PROFICIENCY_GROUP_ORDER\.map\(\(key\) => \[key, true\]\)/)
  assert.match(panel, /\[group\]: !current\[group\]/)
  assert.doesNotMatch(panel, /activeGroup|expandedGroup:\s*CharacterProficiencyGroupKey \| null/)
})

test("proficiencies stage 3 exposes honest accessible state", () => {
  assert.match(panel, /aria-expanded=\{expanded\}/)
  assert.match(panel, /aria-controls=\{bodyId\}/)
  assert.match(panel, /role="region"/)
  assert.match(panel, /aria-labelledby=\{headerId\}/)
  assert.match(panel, /aria-hidden=\{!expanded\}/)
})

test("proficiencies stage 3 presents trustworthy open and closed catalog counts", () => {
  assert.match(panel, /total === null[\s\S]*String\(current\)/)
  assert.match(panel, /\$\{current\} \/ \$\{total\}/)
  assert.match(panel, /владений в открытом каталоге/)
  assert.match(panel, /из \$\{total\} владений/)
})

test("proficiencies stage 3 distinguishes loading error and empty states", () => {
  assert.match(panel, /data-state=\{failed \? "error" : "loading"\}/)
  assert.match(panel, /data-empty=\{empty \|\| undefined\}/)
  assert.match(panel, /Нет владений этого типа/)
  assert.match(panel, /u1-character-proficiencies__warning/)
})

test("proficiencies stage 3 keeps the real sheet scroller stable while toggling", () => {
  assert.match(panel, /closest<HTMLElement>\("\.u1-character-sheet"\)/)
  assert.match(panel, /getBoundingClientRect\(\)\.top/)
  assert.match(panel, /scroller\.scrollTop \+= delta/)
})

test("proficiencies stage 3 animates layout without fixed-height clipping", () => {
  assert.match(styles, /grid-template-rows:\s*0fr/)
  assert.match(styles, /grid-template-rows:\s*1fr/)
  assert.match(styles, /prefers-reduced-motion:\s*reduce/)
  assert.doesNotMatch(styles, /max-height:\s*\d+px/)
})

test("the roadmap records stage 3 as ready and keeps class certification separate", () => {
  assert.match(roadmap, /Stage 3 — behaviour and states — READY/)
  assert.match(roadmap, /Stage 5 — class coverage and future-mechanics placeholders/)
})
