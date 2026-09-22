import assert from "node:assert/strict"
import test from "node:test"

import {
  imageProfileForPurpose,
  type ImagePurpose,
} from "../supabase/functions/voss-agent/image-profiles.ts"

const purposes: ImagePurpose[] = [
  "icon",
  "ui_preview",
  "portrait",
  "panel",
  "hero_art",
  "master_art",
]

test("every image purpose routes to GPT Image 2.5 Sunburst", () => {
  for (const purpose of purposes) {
    assert.equal(
      imageProfileForPurpose(purpose).model,
      "gpt-image-2.5-sunburst",
      purpose,
    )
  }
})

test("icons use low quality and every other image purpose uses high", () => {
  assert.equal(imageProfileForPurpose("icon").quality, "low")

  for (const purpose of purposes.filter((value) => value !== "icon")) {
    assert.equal(imageProfileForPurpose(purpose).quality, "high", purpose)
  }
})
