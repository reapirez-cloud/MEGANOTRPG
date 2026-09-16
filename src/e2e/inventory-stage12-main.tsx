import { StrictMode, useState } from "react"
import { createRoot } from "react-dom/client"
import type { User } from "@supabase/supabase-js"

import { AIProvider } from "../ai/AIProvider"
import { AuthProvider } from "../context/AuthContext"
import type { InventoryPlacementTarget } from "../inventory-engine"
import type { SnakeAction } from "../snake-engine"
import type { InventoryItem } from "../types/characterSheet"
import InventorySpatialView from "../ui-v1-isolated/InventorySpatialView"
import { SnakeProvider } from "../ui-v1-isolated/SnakeProvider"
import "../ui-v1-isolated/styles.css"
import "../ui-v1-isolated/snake.css"
import "../ui-v1-isolated/inventory-spatial.css"

const CHARACTER_ID = "00000000-0000-4000-8000-000000001212"
const USER_ID = "00000000-0000-4000-8000-000000001213"

const user = {
  id: USER_ID,
  app_metadata: {},
  user_metadata: { auth_source: "stage12-e2e" },
  aud: "authenticated",
  created_at: "2026-09-16T00:00:00.000Z",
} as User

const profile = {
  user_id: USER_ID,
  display_name: "Stage12",
  created_at: user.created_at,
  updated_at: user.created_at,
}

const compact = {
  semantic_role: "test.small",
  packing_mode: "instance",
  footprint_mode: "compact_1x1",
  shape_mask: ["1"],
  shape_width: 1,
  shape_height: 1,
  rotatable: false,
  stack_max: null,
}

const bagProfile = {
  ...compact,
  semantic_role: "container.stage12",
  container_profile: {
    internal_grid_width: 4,
    internal_grid_height: 4,
    cell_size_cm: 5,
    allow_nested_containers: true,
    external_carry_slots: 1,
    specialized_capacity: [],
  },
}

function item(id: string, name: string, overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id,
    character_id: CHARACTER_ID,
    world_storage_id: null,
    surface_id: null,
    name,
    quantity: 1,
    weight: 0.5,
    equipped: false,
    category: "other",
    equipment_slot: null,
    image_url: null,
    description: "Тестовый предмет.",
    definition_id: "00000000-0000-4000-8000-000000001299",
    definition_revision: 1,
    mechanics: [],
    usage_mode: "none",
    charges_current: null,
    charges_max: null,
    stack_mode: "instance",
    holder_item_id: null,
    placement_kind: "root",
    placement_index: null,
    grid_x: null,
    grid_y: null,
    grid_rotation: 0,
    inventory_profile: compact,
    item_state: {},
    version: 1,
    sort_order: 0,
    created_at: "2026-09-16T00:00:00.000Z",
    updated_at: "2026-09-16T00:00:00.000Z",
    ...overrides,
  }
}

const initialItems: InventoryItem[] = [
  item("00000000-0000-4000-8000-000000001221", "Рюкзак", {
    category: "container",
    inventory_profile: bagProfile,
  }),
  item("00000000-0000-4000-8000-000000001222", "Зелье"),
  item("00000000-0000-4000-8000-000000001223", "Меч", {
    category: "equipment",
    equipment_slot: "main_hand",
    inventory_profile: {
      semantic_role: "weapon.sword",
      packing_mode: "instance",
      footprint_mode: "shape",
      shape_mask: ["1", "1", "1"],
      shape_width: 1,
      shape_height: 3,
      rotatable: true,
      stack_max: null,
    },
  }),
]

function applyPlacement(item: InventoryItem, target: InventoryPlacementTarget): InventoryItem {
  if (target.kind === "grid") {
    return {
      ...item,
      equipped: false,
      holder_item_id: target.holderItemId,
      placement_kind: "grid",
      placement_index: null,
      grid_x: target.gridX,
      grid_y: target.gridY,
      grid_rotation: target.rotation,
      version: (item.version || 1) + 1,
    }
  }
  if (target.kind === "hand" || target.kind === "external") {
    return {
      ...item,
      equipped: false,
      holder_item_id: null,
      placement_kind: target.kind,
      placement_index: target.index,
      grid_x: null,
      grid_y: null,
      grid_rotation: 0,
      version: (item.version || 1) + 1,
    }
  }
  return {
    ...item,
    equipped: false,
    holder_item_id: null,
    placement_kind: "root",
    placement_index: null,
    grid_x: null,
    grid_y: null,
    grid_rotation: 0,
    version: (item.version || 1) + 1,
  }
}

function Harness() {
  const [items, setItems] = useState(initialItems)
  const [holderId, setHolderId] = useState<string | null>(null)
  const [opened, setOpened] = useState("")

  const actionsForItem = (entry: InventoryItem): SnakeAction[] => [{
    id: "inspect",
    label: "Осмотреть",
    surface: {
      kind: "detail",
      eyebrow: "Stage 12",
      title: entry.name,
      body: entry.description || "Без описания.",
    },
  }]

  return (
    <main style={{ minHeight: "100vh", padding: 12 }}>
      <h1 style={{ fontSize: 14 }}>STAGE 12 INVENTORY E2E</h1>
      <InventorySpatialView
        items={items}
        activeHolderId={holderId}
        canControl
        actionsForItem={actionsForItem}
        onActiveHolderChange={setHolderId}
        onOpenItem={(entry) => setOpened(entry.name)}
        onMove={async (entry, target) => {
          setItems((current) => current.map((candidate) =>
            candidate.id === entry.id ? applyPlacement(candidate, target) : candidate
          ))
          return { ok: true }
        }}
        onEquip={async (entry) => {
          setItems((current) => current.map((candidate) =>
            candidate.id === entry.id
              ? {
                  ...candidate,
                  equipped: true,
                  holder_item_id: null,
                  placement_kind: "root",
                  placement_index: null,
                  grid_x: null,
                  grid_y: null,
                  grid_rotation: 0,
                  version: (candidate.version || 1) + 1,
                }
              : candidate
          ))
          return { ok: true }
        }}
      />
      <output data-testid="opened-item">{opened}</output>
      <output data-testid="inventory-state">
        {JSON.stringify(items.map((entry) => ({
          name: entry.name,
          placement: entry.placement_kind,
          index: entry.placement_index,
          holder: entry.holder_item_id,
          equipped: entry.equipped,
        })))}
      </output>
    </main>
  )
}

const root = document.getElementById("stage12-inventory-root")
if (!root) throw new Error("Stage 12 inventory E2E root not found")

createRoot(root).render(
  <StrictMode>
    <AuthProvider user={user} profile={profile}>
      <AIProvider>
        <SnakeProvider>
          <Harness />
        </SnakeProvider>
      </AIProvider>
    </AuthProvider>
  </StrictMode>,
)
