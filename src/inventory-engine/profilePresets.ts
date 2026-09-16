import type {
  InventoryPhysicalProfile,
} from "./profile.ts"

export type InventoryProfilePreset = {
  id: string
  label: string
  description: string
  profile: InventoryPhysicalProfile
}

function cloneProfile(profile: InventoryPhysicalProfile): InventoryPhysicalProfile {
  return {
    ...profile,
    shape_mask: [...profile.shape_mask],
    physical_dimensions_cm: profile.physical_dimensions_cm
      ? { ...profile.physical_dimensions_cm }
      : profile.physical_dimensions_cm,
    container_profile: profile.container_profile
      ? {
          ...profile.container_profile,
          specialized_capacity: profile.container_profile.specialized_capacity
            ? profile.container_profile.specialized_capacity.map((entry) => ({ ...entry }))
            : undefined,
        }
      : profile.container_profile,
  }
}

function compact(
  semanticRole: string,
  options: Partial<InventoryPhysicalProfile> = {},
): InventoryPhysicalProfile {
  return {
    semantic_role: semanticRole,
    packing_mode: "instance",
    footprint_mode: "compact_1x1",
    shape_mask: ["1"],
    shape_width: 1,
    shape_height: 1,
    rotatable: false,
    stack_max: null,
    ...options,
  }
}

function bulk(
  semanticRole: string,
  stackMax: number,
): InventoryPhysicalProfile {
  return compact(semanticRole, {
    packing_mode: "bulk_stack",
    stack_max: stackMax,
  })
}

function verticalShape(
  semanticRole: string,
  cells: number,
  dimensions: NonNullable<InventoryPhysicalProfile["physical_dimensions_cm"]>,
): InventoryPhysicalProfile {
  return {
    semantic_role: semanticRole,
    packing_mode: "instance",
    footprint_mode: "shape",
    shape_mask: Array.from({ length: cells }, () => "1"),
    shape_width: 1,
    shape_height: cells,
    rotatable: true,
    stack_max: null,
    physical_dimensions_cm: dimensions,
  }
}

export const STANDARD_ITEM_PROFILE_PRESETS: InventoryProfilePreset[] = [
  {
    id: "small-instance",
    label: "Мелкий отдельный предмет",
    description: "1×1, без стака. Для зелий, свитков, ключей и другой мелочи.",
    profile: compact("other.small"),
  },
  {
    id: "potion",
    label: "Зелье / флакон",
    description: "Готовый отдельный объект 1×1. Не стакуется.",
    profile: compact("consumable.potion"),
  },
  {
    id: "scroll",
    label: "Свиток",
    description: "Отдельный 1×1 экземпляр.",
    profile: compact("reference.scroll"),
  },
  {
    id: "coin",
    label: "Монеты",
    description: "Однородная валюта в 1×1 bulk-стаке.",
    profile: bulk("currency.coin", 100),
  },
  {
    id: "arrows",
    label: "Стрелы",
    description: "Обычная связка до 20; колчан может вмещать больше.",
    profile: bulk("ammo.arrow", 20),
  },
  {
    id: "bolts",
    label: "Болты",
    description: "Однородные боеприпасы 1×1.",
    profile: bulk("ammo.bolt", 20),
  },
  {
    id: "bullets",
    label: "Пули / патроны",
    description: "Однородные боеприпасы 1×1.",
    profile: bulk("ammo.bullet", 20),
  },
  {
    id: "herb",
    label: "Обычная трава",
    description: "Однородный мелкий ингредиент. Редкий/именной вариант должен быть instance.",
    profile: bulk("ingredient.herb", 20),
  },
  {
    id: "powder",
    label: "Порошок / пыль",
    description: "Однородная сыпучая масса 1×1.",
    profile: bulk("ingredient.powder", 20),
  },
  {
    id: "ore-chunk",
    label: "Кусок руды",
    description: "Ингредиент, но отдельный физический экземпляр.",
    profile: {
      semantic_role: "material.ore_chunk",
      packing_mode: "instance",
      footprint_mode: "shape",
      shape_mask: ["11", "11"],
      shape_width: 2,
      shape_height: 2,
      rotatable: true,
      stack_max: null,
      physical_dimensions_cm: { width: 10, height: 10, depth: 8 },
    },
  },
  {
    id: "ingot",
    label: "Слиток",
    description: "Отдельный экземпляр, не bulk-стак.",
    profile: {
      semantic_role: "material.ingot",
      packing_mode: "instance",
      footprint_mode: "shape",
      shape_mask: ["11", "11", "11"],
      shape_width: 2,
      shape_height: 3,
      rotatable: true,
      stack_max: null,
      physical_dimensions_cm: { width: 10, height: 15, depth: 5 },
    },
  },
  {
    id: "dagger",
    label: "Кинжал / нож",
    description: "Длинный узкий предмет примерно 25 см.",
    profile: verticalShape("weapon.dagger", 5, { width: 5, height: 25, depth: 3 }),
  },
  {
    id: "sword",
    label: "Меч",
    description: "Длинный узкий предмет примерно 90 см.",
    profile: verticalShape("weapon.sword", 18, { width: 5, height: 90, depth: 4 }),
  },
  {
    id: "spear",
    label: "Копьё",
    description: "Очень длинный предмет; обычная сумка его физически не вместит.",
    profile: verticalShape("weapon.spear", 36, { width: 5, height: 180, depth: 5 }),
  },
  {
    id: "shield",
    label: "Щит",
    description: "Широкий предмет с простой читаемой формой.",
    profile: {
      semantic_role: "armor.shield",
      packing_mode: "instance",
      footprint_mode: "shape",
      shape_mask: ["111111", "111111", "111111", "111111", "011110", "001100"],
      shape_width: 6,
      shape_height: 6,
      rotatable: true,
      stack_max: null,
      physical_dimensions_cm: { width: 30, height: 30, depth: 8 },
    },
  },
  {
    id: "rope",
    label: "Верёвка",
    description: "Отдельная бухта, не bulk-стак.",
    profile: {
      semantic_role: "tool.rope",
      packing_mode: "instance",
      footprint_mode: "shape",
      shape_mask: ["111", "111", "111"],
      shape_width: 3,
      shape_height: 3,
      rotatable: true,
      stack_max: null,
      physical_dimensions_cm: { width: 15, height: 15, depth: 10 },
    },
  },
  {
    id: "torch",
    label: "Факел",
    description: "Отдельный продолговатый предмет.",
    profile: verticalShape("tool.torch", 8, { width: 5, height: 40, depth: 5 }),
  },
]

export const STANDARD_CONTAINER_PROFILE_PRESETS: InventoryProfilePreset[] = [
  {
    id: "container-simple-1x1",
    label: "Простая сумка 1×1",
    description: "Единственный произвольный размер, который ГМ может назначить без расчёта геометрии.",
    profile: compact("container", {
      container_profile: {
        internal_grid_width: 1,
        internal_grid_height: 1,
        cell_size_cm: 5,
        allow_nested_containers: true,
        external_carry_slots: 0,
        specialized_capacity: [],
      },
    }),
  },
  {
    id: "container-coin-purse",
    label: "Кошель · 4×3",
    description: "20×15 см внутреннего пространства.",
    profile: compact("container.purse", {
      physical_dimensions_cm: { width: 20, height: 15, depth: 5 },
      container_profile: {
        internal_grid_width: 4,
        internal_grid_height: 3,
        cell_size_cm: 5,
        allow_nested_containers: false,
        external_carry_slots: 0,
        specialized_capacity: [],
      },
    }),
  },
  {
    id: "container-small-pouch",
    label: "Малый мешочек · 5×4",
    description: "25×20 см внутреннего пространства.",
    profile: compact("container.pouch", {
      physical_dimensions_cm: { width: 25, height: 20, depth: 8 },
      container_profile: {
        internal_grid_width: 5,
        internal_grid_height: 4,
        cell_size_cm: 5,
        allow_nested_containers: true,
        external_carry_slots: 0,
        specialized_capacity: [],
      },
    }),
  },
  {
    id: "container-satchel",
    label: "Сумка · 6×5",
    description: "30×25 см внутреннего пространства.",
    profile: compact("container.bag", {
      physical_dimensions_cm: { width: 30, height: 25, depth: 12 },
      container_profile: {
        internal_grid_width: 6,
        internal_grid_height: 5,
        cell_size_cm: 5,
        allow_nested_containers: true,
        external_carry_slots: 0,
        specialized_capacity: [],
      },
    }),
  },
  {
    id: "container-travel-bag",
    label: "Дорожная сумка · 8×6",
    description: "40×30 см внутреннего пространства.",
    profile: compact("container.travel_bag", {
      physical_dimensions_cm: { width: 40, height: 30, depth: 20 },
      container_profile: {
        internal_grid_width: 8,
        internal_grid_height: 6,
        cell_size_cm: 5,
        allow_nested_containers: true,
        external_carry_slots: 0,
        specialized_capacity: [],
      },
    }),
  },
  {
    id: "container-backpack",
    label: "Рюкзак · 6×8",
    description: "30×40 см внутреннего пространства.",
    profile: compact("container.backpack", {
      physical_dimensions_cm: { width: 30, height: 40, depth: 20 },
      container_profile: {
        internal_grid_width: 6,
        internal_grid_height: 8,
        cell_size_cm: 5,
        allow_nested_containers: true,
        external_carry_slots: 0,
        specialized_capacity: [],
      },
    }),
  },
  {
    id: "container-large-backpack",
    label: "Большой рюкзак · 8×10",
    description: "40×50 см внутреннего пространства.",
    profile: compact("container.large_backpack", {
      physical_dimensions_cm: { width: 40, height: 50, depth: 25 },
      container_profile: {
        internal_grid_width: 8,
        internal_grid_height: 10,
        cell_size_cm: 5,
        allow_nested_containers: true,
        external_carry_slots: 0,
        specialized_capacity: [],
      },
    }),
  },
  {
    id: "container-sack",
    label: "Большой мешок · 8×10",
    description: "40×50 см мягкого внутреннего пространства.",
    profile: compact("container.sack", {
      physical_dimensions_cm: { width: 40, height: 50, depth: 30 },
      container_profile: {
        internal_grid_width: 8,
        internal_grid_height: 10,
        cell_size_cm: 5,
        allow_nested_containers: true,
        external_carry_slots: 0,
        specialized_capacity: [],
      },
    }),
  },
  {
    id: "container-quiver",
    label: "Колчан · до 50 стрел",
    description: "Специализированная ёмкость для обычных стрел.",
    profile: compact("container.quiver", {
      physical_dimensions_cm: { width: 15, height: 60, depth: 10 },
      container_profile: {
        internal_grid_width: 2,
        internal_grid_height: 6,
        cell_size_cm: 5,
        allow_nested_containers: false,
        external_carry_slots: 0,
        specialized_capacity: [
          { semantic_role: "ammo.arrow", max_quantity: 50 },
        ],
      },
    }),
  },
  {
    id: "container-small-chest",
    label: "Малый сундук · 10×6",
    description: "50×30 см внутреннего пространства.",
    profile: compact("container.chest", {
      physical_dimensions_cm: { width: 50, height: 30, depth: 30 },
      container_profile: {
        internal_grid_width: 10,
        internal_grid_height: 6,
        cell_size_cm: 5,
        allow_nested_containers: true,
        external_carry_slots: 0,
        specialized_capacity: [],
      },
    }),
  },
  {
    id: "container-chest",
    label: "Сундук · 12×8",
    description: "60×40 см внутреннего пространства.",
    profile: compact("container.chest.large", {
      physical_dimensions_cm: { width: 60, height: 40, depth: 40 },
      container_profile: {
        internal_grid_width: 12,
        internal_grid_height: 8,
        cell_size_cm: 5,
        allow_nested_containers: true,
        external_carry_slots: 0,
        specialized_capacity: [],
      },
    }),
  },
]

export function inventoryProfilePreset(id: string): InventoryPhysicalProfile | null {
  const preset = [...STANDARD_ITEM_PROFILE_PRESETS, ...STANDARD_CONTAINER_PROFILE_PRESETS]
    .find((candidate) => candidate.id === id)
  return preset ? cloneProfile(preset.profile) : null
}

export function cloneInventoryProfile(profile: InventoryPhysicalProfile): InventoryPhysicalProfile {
  return cloneProfile(profile)
}
