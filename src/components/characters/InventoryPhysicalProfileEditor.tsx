import type { InventoryCategory } from "../../types/characterSheet.ts"
import type { InventoryPhysicalProfile } from "../../inventory-engine/profile.ts"
import {
  STANDARD_CONTAINER_PROFILE_PRESETS,
  STANDARD_ITEM_PROFILE_PRESETS,
  cloneInventoryProfile,
} from "../../inventory-engine/profilePresets.ts"

type Props = {
  value: InventoryPhysicalProfile
  category: InventoryCategory
  onChange: (profile: InventoryPhysicalProfile) => void
}

function asPositiveNumber(value: string, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function asPositiveInteger(value: string, fallback: number, max = 80) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(max, parsed) : fallback
}

function resizeMask(mask: string[], width: number, height: number) {
  return Array.from({ length: height }, (_, y) => {
    const source = mask[y] || ""
    return Array.from({ length: width }, (_, x) => source[x] === "1" ? "1" : "0").join("")
  })
}

function ensureCell(mask: string[]) {
  if (mask.some((row) => row.includes("1"))) return mask
  const next = [...mask]
  next[0] = "1" + (next[0]?.slice(1) || "")
  return next
}

function rotateMask(mask: string[]) {
  const height = mask.length
  const width = mask[0]?.length || 1
  return Array.from({ length: width }, (_, y) =>
    Array.from({ length: height }, (_, x) => mask[height - 1 - x]?.[y] === "1" ? "1" : "0").join(""),
  )
}

function dimensions(profile: InventoryPhysicalProfile) {
  return profile.physical_dimensions_cm || {}
}

export default function InventoryPhysicalProfileEditor({ value, category, onChange }: Props) {
  const isContainer = category === "container" || Boolean(value.container_profile)

  function patch(next: Partial<InventoryPhysicalProfile>) {
    onChange({ ...value, ...next })
  }

  function chooseStarter(id: string) {
    const source = [...STANDARD_ITEM_PROFILE_PRESETS, ...STANDARD_CONTAINER_PROFILE_PRESETS]
      .find((candidate) => candidate.id === id)
    if (!source) return
    onChange(cloneInventoryProfile(source.profile))
  }

  function setPackingMode(mode: "instance" | "bulk_stack") {
    if (mode === "bulk_stack") {
      patch({
        packing_mode: "bulk_stack",
        footprint_mode: "compact_1x1",
        shape_mask: ["1"],
        shape_width: 1,
        shape_height: 1,
        rotatable: false,
        stack_max: value.stack_max && value.stack_max >= 2 ? value.stack_max : 20,
        container_profile: null,
      })
      return
    }
    patch({ packing_mode: "instance", stack_max: null })
  }

  function setFootprintMode(mode: "compact_1x1" | "shape") {
    if (mode === "compact_1x1") {
      patch({
        footprint_mode: mode,
        shape_mask: ["1"],
        shape_width: 1,
        shape_height: 1,
        rotatable: false,
      })
      return
    }
    patch({
      footprint_mode: mode,
      shape_mask: value.footprint_mode === "shape" ? value.shape_mask : ["1", "1"],
      shape_width: value.footprint_mode === "shape" ? value.shape_width : 1,
      shape_height: value.footprint_mode === "shape" ? value.shape_height : 2,
      rotatable: true,
    })
  }

  function resizeShape(width: number, height: number) {
    const next = ensureCell(resizeMask(value.shape_mask, width, height))
    patch({ shape_width: width, shape_height: height, shape_mask: next })
  }

  function toggleCell(x: number, y: number) {
    const rows = value.shape_mask.map((row) => row.split(""))
    const row = rows[y]
    if (!row || row[x] === undefined) return
    row[x] = row[x] === "1" ? "0" : "1"
    patch({ shape_mask: ensureCell(rows.map((cells) => cells.join(""))) })
  }

  function rotate() {
    const next = rotateMask(value.shape_mask)
    patch({ shape_mask: next, shape_width: value.shape_height, shape_height: value.shape_width })
  }

  function setDimension(key: "width" | "height" | "depth", raw: string) {
    const current = dimensions(value)
    const fallback = Number(current[key] || 5)
    patch({
      physical_dimensions_cm: {
        ...current,
        [key]: asPositiveNumber(raw, fallback),
      },
    })
  }

  function patchContainer(next: Partial<NonNullable<InventoryPhysicalProfile["container_profile"]>>) {
    const current = value.container_profile || {
      internal_grid_width: 1,
      internal_grid_height: 1,
      cell_size_cm: 5,
      allow_nested_containers: true,
      external_carry_slots: 0,
      specialized_capacity: [],
    }
    patch({
      packing_mode: "instance",
      stack_max: null,
      footprint_mode: "compact_1x1",
      shape_mask: ["1"],
      shape_width: 1,
      shape_height: 1,
      rotatable: false,
      container_profile: { ...current, ...next },
    })
  }

  const selectedContainerPreset = STANDARD_CONTAINER_PROFILE_PRESETS.find((preset) => {
    const left = preset.profile.container_profile
    const right = value.container_profile
    return Boolean(
      left && right &&
      left.internal_grid_width === right.internal_grid_width &&
      left.internal_grid_height === right.internal_grid_height &&
      left.cell_size_cm === right.cell_size_cm &&
      preset.profile.semantic_role === value.semantic_role,
    )
  })?.id || ""

  return <section className="inventory-physical-editor">
    <div className="inventory-physical-editor__head">
      <div>
        <strong>Физический профиль</strong>
        <small>Это хранение и геометрия, а не механика CE.</small>
      </div>
      <span>{value.packing_mode === "bulk_stack" ? "BULK" : "INSTANCE"}</span>
    </div>

    {!isContainer && <label>
      <span className="field-label">Готовый физический шаблон</span>
      <select className="app-select" value="" onChange={(event) => { if (event.target.value) chooseStarter(event.target.value) }}>
        <option value="">Не менять</option>
        {STANDARD_ITEM_PROFILE_PRESETS.map((preset) =>
          <option key={preset.id} value={preset.id}>{preset.label}</option>
        )}
      </select>
    </label>}

    {isContainer && <>
      <label>
        <span className="field-label">Готовый тип контейнера</span>
        <select className="app-select" value={selectedContainerPreset} onChange={(event) => chooseStarter(event.target.value)}>
          <option value="" disabled>Выбрать готовый размер</option>
          {STANDARD_CONTAINER_PROFILE_PRESETS.map((preset) =>
            <option key={preset.id} value={preset.id}>{preset.label}</option>
          )}
        </select>
      </label>
      <div className="inventory-physical-editor__note">
        Обычные размеры контейнеров фиксированы заранее. Для необычной или магической внутренней геометрии используй Восса: он создаст отдельную campaign-definition. Размер внутренней сетки никогда не меняет размер клетки интерфейса.
      </div>
    </>}

    <div className="v2-field-grid">
      <label>
        <span className="field-label">Вес единицы, кг</span>
        <input
          className="app-input"
          type="number"
          min="0"
          step="0.001"
          value={value.weight_per_unit ?? ""}
          onChange={(event) => {
            const raw = event.target.value
            patch({ weight_per_unit: raw === "" ? null : Math.max(0, Number(raw) || 0) })
          }}
          placeholder="Неизвестно"
        />
      </label>
      <label>
        <span className="field-label">Смысловая роль</span>
        <input className="app-input" value={value.semantic_role} onChange={(event) => patch({ semantic_role: event.target.value.trimStart().slice(0, 80) || "other" })} />
      </label>
      <label>
        <span className="field-label">Упаковка</span>
        <select className="app-select" value={value.packing_mode} disabled={isContainer} onChange={(event) => setPackingMode(event.target.value as "instance" | "bulk_stack")}>
          <option value="instance">Отдельный экземпляр</option>
          <option value="bulk_stack">Однородный bulk-стак</option>
        </select>
      </label>
    </div>

    {value.packing_mode === "bulk_stack" && <label>
      <span className="field-label">Максимум в обычном стаке</span>
      <input className="app-input" type="number" min="2" max="100000" value={value.stack_max || 20} onChange={(event) => patch({ stack_max: Math.max(2, asPositiveInteger(event.target.value, 20, 100000)) })} />
    </label>}

    {!isContainer && value.packing_mode === "instance" && <>
      <label>
        <span className="field-label">След в сумке</span>
        <select className="app-select" value={value.footprint_mode} onChange={(event) => setFootprintMode(event.target.value as "compact_1x1" | "shape")}>
          <option value="compact_1x1">Компактный 1×1</option>
          <option value="shape">Форма по клеткам</option>
        </select>
      </label>

      {value.footprint_mode === "shape" && <>
        <div className="inventory-physical-editor__shape-tools">
          <label>
            <span>Ширина</span>
            <input type="number" min="1" max="80" value={value.shape_width} onChange={(event) => resizeShape(asPositiveInteger(event.target.value, value.shape_width), value.shape_height)} />
          </label>
          <label>
            <span>Высота</span>
            <input type="number" min="1" max="80" value={value.shape_height} onChange={(event) => resizeShape(value.shape_width, asPositiveInteger(event.target.value, value.shape_height))} />
          </label>
          <button type="button" onClick={rotate} disabled={!value.rotatable}>Повернуть</button>
        </div>
        <div
          className="inventory-shape-grid"
          style={{ gridTemplateColumns: "repeat(" + value.shape_width + ", 18px)" }}
          aria-label="Редактор формы предмета"
        >
          {value.shape_mask.flatMap((row, y) =>
            row.split("").map((cell, x) =>
              <button
                type="button"
                key={x + ":" + y}
                className={cell === "1" ? "is-filled" : ""}
                onClick={() => toggleCell(x, y)}
                aria-label={"Клетка " + (x + 1) + ", " + (y + 1)}
              />,
            ),
          )}
        </div>
        <label className="inventory-physical-editor__check">
          <input type="checkbox" checked={value.rotatable} onChange={(event) => patch({ rotatable: event.target.checked })} />
          <span>Предмет можно вращать при укладке</span>
        </label>
      </>}
    </>}

    {!isContainer && <div className="v2-field-grid inventory-physical-editor__dimensions">
      <label><span className="field-label">Ширина, см</span><input className="app-input" type="number" min="0.1" step="0.1" value={dimensions(value).width ?? ""} onChange={(event) => setDimension("width", event.target.value)} /></label>
      <label><span className="field-label">Высота / длина, см</span><input className="app-input" type="number" min="0.1" step="0.1" value={dimensions(value).height ?? ""} onChange={(event) => setDimension("height", event.target.value)} /></label>
      <label><span className="field-label">Глубина, см</span><input className="app-input" type="number" min="0.1" step="0.1" value={dimensions(value).depth ?? ""} onChange={(event) => setDimension("depth", event.target.value)} /></label>
    </div>}

    {isContainer && value.container_profile && <>
      <div className="inventory-physical-editor__container-readout">
        <strong>{value.container_profile.internal_grid_width}×{value.container_profile.internal_grid_height}</strong>
        <span>логических клеток · {value.container_profile.cell_size_cm} см ориентир клетки</span>
      </div>
      <label className="inventory-physical-editor__check">
        <input type="checkbox" checked={value.container_profile.allow_nested_containers !== false} onChange={(event) => patchContainer({ allow_nested_containers: event.target.checked })} />
        <span>Можно вкладывать другие контейнеры</span>
      </label>
      <label>
        <span className="field-label">Дополнительные внешние 1×1 carry-ячейки</span>
        <input
          className="app-input"
          type="number"
          min="0"
          max="50"
          value={value.container_profile.external_carry_slots || 0}
          onChange={(event) => patchContainer({ external_carry_slots: Math.max(0, Math.min(50, Number.parseInt(event.target.value || "0", 10) || 0)) })}
        />
      </label>
      {value.container_profile.specialized_capacity?.length ? <div className="inventory-physical-editor__capacity">
        {value.container_profile.specialized_capacity.map((entry) =>
          <span key={entry.semantic_role}>{entry.semantic_role}: до {entry.max_quantity}</span>
        )}
      </div> : null}
    </>}
  </section>
}
