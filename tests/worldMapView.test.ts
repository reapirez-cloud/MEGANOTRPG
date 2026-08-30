import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const world = fs.readFileSync("src/pages/World.tsx", "utf8")
const map = fs.readFileSync("src/components/world/WorldMapView.tsx", "utf8")
const styles = fs.readFileSync("src/world-map.css", "utf8")

test("World exposes a top-level LORE and MAP switch without replacing existing location lore", () => {
  assert.match(world, /world-mode-nav/)
  assert.match(world, />ЛОР<\/button>/)
  assert.match(world, />КАРТА<\/button>/)
  assert.match(world, /<WorldMapView/)
  assert.match(world, /setViewMode\("lore"\)/)
  assert.match(world, /openLocationFromMap/)
  assert.match(world, /Подробное описание/)
})

test("map derives arrows from authored location links and parent-child topology", () => {
  assert.match(map, /sectionLocation/)
  assert.match(map, /for \(const link of links\)/)
  assert.match(map, /link\.target_location_id/)
  assert.match(map, /child\.parent_location_id/)
  assert.match(map, /label: "Подзона"/)
  assert.match(map, /world-map-route__arrow">→/)
  assert.match(map, /onOpen\(route\.target\)/)
})

test("map stays mobile-first with narrow location panels and optional previews", () => {
  assert.match(map, /location\.image_url \? <CampaignImage/)
  assert.match(styles, /grid-template-columns: minmax\(0, 168px\) minmax\(0, 1fr\)/)
  assert.match(styles, /overflow-x: auto/)
  assert.match(styles, /world-map-card__image/)
  assert.match(styles, /world-map-route--child/)
  assert.doesNotMatch(map, /canvas/i)
})
