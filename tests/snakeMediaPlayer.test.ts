import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const art = fs.readFileSync("src/ui-v1-isolated/ArtSection.tsx", "utf8")
const types = fs.readFileSync("src/snake-engine/types.ts", "utf8")
const snakeIndex = fs.readFileSync("src/snake-engine/index.ts", "utf8")
const host = fs.readFileSync("src/ui-v1-isolated/snake/surfaces/SnakeWindowHost.tsx", "utf8")
const media = fs.readFileSync("src/ui-v1-isolated/snake/surfaces/SnakeMediaSurface.tsx", "utf8")
const player = fs.readFileSync("src/components/media/ArtPlayer.tsx", "utf8")
const playerStyles = fs.readFileSync("src/components/media/art-player.css", "utf8")
const agentShell = fs.readFileSync("src/ai/AgentShell.tsx", "utf8")
const agentStyles = fs.readFileSync("src/ai/ai-voss.css", "utf8")
const snakeStyles = fs.readFileSync("src/ui-v1-isolated/snake.css", "utf8")
const artStyles = fs.readFileSync("src/ui-v1-isolated/art-library.css", "utf8")

test("one shared ArtPlayer owns viewing while Snake only adapts media requests", () => {
  assert.match(types, /kind: "media"/)
  assert.match(types, /items: SnakeMediaItem\[\]/)
  assert.match(snakeIndex, /SnakeMediaRequest/)
  assert.match(host, /SnakeMediaSurface/)
  assert.match(host, /session\.request\.kind === "media"/)
  assert.match(media, /import ArtPlayer/)
  assert.match(media, /<ArtPlayer/)
  assert.match(art, /snake\.openSurface\([\s\S]*?kind: "media"/)
  assert.doesNotMatch(art + artStyles, /u1-art-lightbox/)
})

test("shared ArtPlayer is a restrained fullscreen MEGANOT surface", () => {
  assert.match(snakeStyles, /\.u1-snake-window-layer\[data-media="true"\][\s\S]*?padding:\s*0/)
  assert.match(playerStyles, /\.u1-art-player[\s\S]*?background:\s*#050607/)
  assert.match(player, /<CampaignImage/)
  assert.match(player, /setChromeVisible/)
  assert.doesNotMatch(player, /backdrop-filter|glass|gradient-button/i)
})

test("shared ArtPlayer supports zoom, pan, swipe, wheel and keyboard controls", () => {
  assert.match(player, /onPointerDown/)
  assert.match(player, /pointDistance/)
  assert.match(player, /nextScale/)
  assert.match(player, /Math\.abs\(dx\) >= 58/)
  assert.match(player, /setScale\(2\.25\)/)
  assert.match(player, /onWheel/)
  assert.match(player, /ArrowLeft/)
  assert.match(player, /ArrowRight/)
  assert.match(player, /event\.key === "Escape"/)
  assert.match(art, /<SnakeTrigger/)
})

test("AI view context follows the exact open shared-player item and page", () => {
  assert.match(media, /useAIViewContextLayer\(\s*"snake-media"/)
  assert.match(media, /mediaId: snapshot\.item\?\.id/)
  assert.match(media, /mediaSource: snapshot\.item\?\.src/)
  assert.match(media, /mediaIndex: snapshot\.index \+ 1/)
  assert.match(media, /mediaCount: snapshot\.count/)
  assert.match(media, /entity: session\.entity/)
})


test("art sections pass the whole current collection into Snake media navigation", () => {
  assert.match(art, /collectionItems\.map\(\(candidate\) => \(\{/)
  assert.match(art, /data\.generated\.map\(\(candidate\) => \{/)
  assert.match(art, /initialIndex/)
  assert.match(media, /count > 1/)
  assert.match(media, /showIndex\(index \+ \(dx < 0 \? 1 : -1\)\)/)
})


test("AI generated art uses the same shared ArtPlayer instead of a private image overlay", () => {
  assert.match(agentShell, /import ArtPlayer/)
  assert.match(agentShell, /<ArtPlayer/)
  assert.match(agentShell, /u1-art-player-layer/)
  assert.doesNotMatch(agentShell + agentStyles, /u1-agent-image-preview/)
  assert.doesNotMatch(agentShell, /previewImageUrl/)
})
