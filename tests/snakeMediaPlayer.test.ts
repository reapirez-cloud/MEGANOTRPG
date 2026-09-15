import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const art = fs.readFileSync("src/ui-v1-isolated/ArtSection.tsx", "utf8")
const types = fs.readFileSync("src/snake-engine/types.ts", "utf8")
const host = fs.readFileSync("src/ui-v1-isolated/snake/surfaces/SnakeWindowHost.tsx", "utf8")
const media = fs.readFileSync("src/ui-v1-isolated/snake/surfaces/SnakeMediaSurface.tsx", "utf8")
const snakeStyles = fs.readFileSync("src/ui-v1-isolated/snake.css", "utf8")
const artStyles = fs.readFileSync("src/ui-v1-isolated/art-library.css", "utf8")

test("Snake owns one universal media player instead of ArtSection owning a second lightbox", () => {
  assert.match(types, /kind: "media"/)
  assert.match(types, /items: SnakeMediaItem\[\]/)
  assert.match(host, /SnakeMediaSurface/)
  assert.match(host, /session\.request\.kind === "media"/)
  assert.match(art, /snake\.openSurface\([\s\S]*?kind: "media"/)
  assert.doesNotMatch(art + artStyles, /u1-art-lightbox/)
})

test("media player is a restrained fullscreen MEGANOT surface", () => {
  assert.match(snakeStyles, /\.u1-snake-window-layer\[data-media="true"\][\s\S]*?padding:\s*0/)
  assert.match(snakeStyles, /\.u1-snake-media[\s\S]*?background:\s*#050607/)
  assert.match(media, /<CampaignImage/)
  assert.match(media, /setChromeVisible/)
  assert.doesNotMatch(media, /backdrop-filter|glass|gradient-button/i)
})

test("media player supports native viewing gestures without stealing domain actions", () => {
  assert.match(media, /onPointerDown/)
  assert.match(media, /pointDistance/)
  assert.match(media, /nextScale/)
  assert.match(media, /Math\.abs\(dx\) >= 58/)
  assert.match(media, /setScale\(2\.25\)/)
  assert.match(media, /ArrowLeft/)
  assert.match(media, /ArrowRight/)
  assert.match(art, /<SnakeTrigger/)
})

test("AI view context follows the exact open media item and page", () => {
  assert.match(media, /useAIViewContextLayer\(\s*"snake-media"/)
  assert.match(media, /mediaId: active\.id/)
  assert.match(media, /mediaSource: active\.src/)
  assert.match(media, /mediaIndex: index \+ 1/)
  assert.match(media, /mediaCount: count/)
  assert.match(media, /entity: session\.entity/)
})
