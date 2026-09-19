import assert from "node:assert/strict"
import test from "node:test"

import {
  characterAbilityIconVisual,
} from "../src/ui-v1-isolated/characterAbilityMedia.ts"

test("direct authored ability media accepts public, remote and relative image paths", () => {
  assert.deepEqual(
    characterAbilityIconVisual("/abilities/second-wind.png"),
    {
      kind: "image",
      src: "/abilities/second-wind.png",
    },
  )

  assert.deepEqual(
    characterAbilityIconVisual("https://cdn.example.test/icon.webp"),
    {
      kind: "image",
      src: "https://cdn.example.test/icon.webp",
    },
  )

  assert.deepEqual(
    characterAbilityIconVisual("assets/icons/feature.svg"),
    {
      kind: "image",
      src: "assets/icons/feature.svg",
    },
  )
})

test("semantic feature icons reuse existing sheet atlas assets when an exact resource identity exists", () => {
  const visual = characterAbilityIconVisual("feature:second-wind")

  assert.equal(visual.kind, "atlas")
  if (visual.kind !== "atlas") return

  assert.equal(visual.render, "mask")
  assert.match(
    String(visual.style["--u1-ability-icon"]),
    /resources\.png/,
  )
  assert.match(
    String(visual.style["--u1-ability-icon-size"]),
    /500% 400%/,
  )
})

test("class semantic icon slots reuse the existing authored class atlas", () => {
  const visual = characterAbilityIconVisual("class:fighter:resource")

  assert.equal(visual.kind, "atlas")
  if (visual.kind !== "atlas") return

  assert.equal(visual.render, "image")
  assert.match(
    String(visual.style["--u1-ability-icon"]),
    /class-resources\.png/,
  )
})

test("unknown semantic ability ids stay honest fallbacks instead of pretending to be image URLs", () => {
  assert.deepEqual(
    characterAbilityIconVisual("feature:unknown-future-feature"),
    { kind: "fallback" },
  )
  assert.deepEqual(
    characterAbilityIconVisual("ability:class"),
    { kind: "fallback" },
  )
  assert.deepEqual(
    characterAbilityIconVisual(""),
    { kind: "fallback" },
  )
})
