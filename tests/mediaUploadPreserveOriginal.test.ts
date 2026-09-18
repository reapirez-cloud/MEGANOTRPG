import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const mediaUpload = fs.readFileSync("src/lib/mediaUpload.ts", "utf8")
const referenceMedia = fs.readFileSync(
  "src/ui-v1-isolated/useUiV1ReferenceMedia.ts",
  "utf8",
)

test("authored UI uploads can bypass image optimization entirely", () => {
  assert.match(
    mediaUpload,
    /preserveOriginal\?: boolean/,
  )
  assert.match(
    mediaUpload,
    /if \(options\?\.preserveOriginal\) \{\s*return file\s*\}/,
  )
})

test("reference icons and portrait frames preserve their original bytes", () => {
  assert.match(
    referenceMedia,
    /preserveOriginal:\s*isIcon \|\| isPortraitFrame/,
  )
  assert.match(
    referenceMedia,
    /preservePng:\s*isIcon \|\| isPortraitFrame/,
  )
})
