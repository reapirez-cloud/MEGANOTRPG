import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const detail = fs.readFileSync("src/components/characters/CharacterDetailSheet.tsx", "utf8")
const actions = fs.readFileSync("src/components/common/ContextActionSheet.tsx", "utf8")
const dialogHook = fs.readFileSync("src/hooks/useDialogSurface.ts", "utf8")
const interaction = fs.readFileSync("src/components/characters/CharacterInteraction.css", "utf8")
const specialized = fs.readFileSync("src/components/characters/CharacterSpecialized.css", "utf8")
const social = fs.readFileSync("src/components/characters/CharacterSocial.css", "utf8")

test("stage 9 gives shared bottom sheets one keyboard-modal contract", () => {
  assert.match(detail, /useDialogSurface<HTMLElement>\(onClose\)/)
  assert.match(actions, /useDialogSurface<HTMLDivElement>\(onClose, "\.context-action:not\(:disabled\)"\)/)
  assert.match(detail, /aria-labelledby=\{titleId\}/)
  assert.match(actions, /aria-labelledby=\{titleId\}/)
  assert.match(actions, /aria-describedby=\{subtitleId\}/)
  assert.match(detail, /tabIndex=\{-1\}/)
  assert.match(actions, /tabIndex=\{-1\}/)
  assert.doesNotMatch(detail, /document\.addEventListener\("keydown"/)
  assert.doesNotMatch(actions, /document\.addEventListener\("keydown"/)
})

test("shared dialog behavior traps focus restores the invoker and locks background scroll", () => {
  assert.match(dialogHook, /event\.key === "Escape"/)
  assert.match(dialogHook, /event\.key !== "Tab"/)
  assert.match(dialogHook, /last\.focus\(\{ preventScroll: true \}\)/)
  assert.match(dialogHook, /first\.focus\(\{ preventScroll: true \}\)/)
  assert.match(dialogHook, /previousFocus\?\.isConnected/)
  assert.match(dialogHook, /document\.body\.style\.overflow = "hidden"/)
  assert.match(dialogHook, /scrollLockDepth/)
})

test("stage 9 normalizes small character actions to phone-sized targets", () => {
  assert.match(interaction, /\.character-section-state-v5__action \.section-link \{[\s\S]*?min-height:\s*44px/)
  assert.match(specialized, /\.character-section-header-v5__action > button,[\s\S]*?min-height:\s*44px/)
  assert.match(specialized, /\.character-spell-detail-v5__actions button \{[\s\S]*?min-height:\s*44px/)
  assert.match(specialized, /\.inventory-detail-v5__actions button \{[\s\S]*?min-height:\s*44px/)
  assert.match(social, /\.v2-diary-compose button\[type="submit"\] \{[\s\S]*?min-height:\s*44px/)
  assert.match(social, /\.v2-comments-toggle \{[\s\S]*?min-height:\s*44px/)
  assert.match(social, /\.v2-comment-compose input \{[\s\S]*?min-height:\s*44px/)
  assert.match(social, /\.v2-comment-compose button \{[\s\S]*?min-height:\s*44px/)
})

test("social upload controls remain native-focusable and expose visible focus states", () => {
  assert.match(social, /Keep native file controls keyboard-focusable/)
  assert.match(social, /\.character-art-upload input \{[\s\S]*?position:\s*absolute/)
  assert.doesNotMatch(social, /\.character-art-upload input \{[\s\S]{0,220}?display:\s*none/)
  assert.match(social, /\.character-art-upload:focus-within/)
  assert.match(social, /\.character-art-grid > button:focus-visible/)
  assert.match(interaction, /\.character-detail-v5 button:focus-visible/)
  assert.match(specialized, /\.character-specialized-v5__directory-button:focus-visible/)
})

test("stage 9 remains presentation-only", () => {
  const combined = `${dialogHook}\n${interaction}\n${specialized}\n${social}`
  assert.doesNotMatch(combined, /supabase|GENA|Oracle|Shapoklyak|Cheburashka|resource_states/i)
  assert.doesNotMatch(dialogHook, /useCharacterSheet|ResolvedCharacterContract|character-engine/i)
})
