import { useState } from "react"

import { useAIViewContextLayer } from "../../../ai/AIProvider"
import type {
  SnakeEditorRequest,
  SnakeEntityRef,
} from "../../../snake-engine"

function validateRequiredFields(
  fields: SnakeEditorRequest["fields"],
  values: Record<string, unknown>,
) {
  return fields.find((field) => {
    if (!("required" in field) || !field.required) return false
    const value = values[field.id]
    return value === undefined || value === null || String(value).trim() === ""
  })
}

export function SnakeEditorSurface({
  request,
  busy,
  error,
  entity,
  contextSource,
  onSubmit,
  onCancel,
}: {
  request: SnakeEditorRequest
  busy: boolean
  error?: string
  entity?: SnakeEntityRef
  contextSource: string
  onSubmit: (input: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const [values, setValues] = useState<Record<string, unknown>>(
    request.initialValues || {},
  )
  const [validation, setValidation] = useState<string | null>(null)

  const initialValues = request.initialValues || {}
  const dirty = JSON.stringify(values) !== JSON.stringify(initialValues)

  useAIViewContextLayer(
    contextSource,
    {
      screen: "snake-editor",
      title: request.title,
      text: dirty
        ? "Открыт Snake Editor. В форме есть ещё не сохранённые изменения."
        : "Открыт Snake Editor. Значения пока совпадают с сохранёнными.",
      entity: entity
        ? {
            type: entity.type,
            id: entity.id,
            label: request.title,
          }
        : null,
      facts: {
        editor: {
          eyebrow: request.eyebrow || null,
          title: request.title,
          fields: request.fields.map((field) => ({
            id: field.id,
            label: field.label,
            type: field.type,
            required: "required" in field ? Boolean(field.required) : false,
          })),
        },
      },
      draft: {
        dirty,
        editorTitle: request.title,
        values,
        initialValues,
      },
    },
    100,
  )

  function submit() {
    const missing = validateRequiredFields(request.fields, values)

    if (missing) {
      setValidation(`Заполните поле «${missing.label}».`)
      return
    }

    setValidation(null)
    onSubmit(values)
  }

  return (
    <>
      <div className="u1-snake-window__fields">
        {request.fields.map((field) => {
          const value = values[field.id]

          if (field.type === "checkbox") {
            return (
              <label className="u1-snake-field u1-snake-field--check" key={field.id}>
                <input
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [field.id]: event.target.checked,
                    }))
                  }
                />
                <span>{field.label}</span>
              </label>
            )
          }

          if (field.type === "select") {
            return (
              <label className="u1-snake-field" key={field.id}>
                <span>{field.label}</span>
                <select
                  value={typeof value === "string" ? value : ""}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [field.id]: event.target.value,
                    }))
                  }
                >
                  <option value="">Выбрать</option>
                  {field.options.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )
          }

          if (field.type === "textarea") {
            return (
              <label className="u1-snake-field" key={field.id}>
                <span>{field.label}</span>
                <textarea
                  value={typeof value === "string" ? value : ""}
                  placeholder={field.placeholder}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [field.id]: event.target.value,
                    }))
                  }
                />
              </label>
            )
          }

          return (
            <label className="u1-snake-field" key={field.id}>
              <span>{field.label}</span>
              <input
                type={field.type}
                value={
                  typeof value === "string" || typeof value === "number"
                    ? value
                    : ""
                }
                placeholder={field.placeholder}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [field.id]:
                      field.type === "number"
                        ? event.target.value === ""
                          ? ""
                          : Number(event.target.value)
                        : event.target.value,
                  }))
                }
              />
            </label>
          )
        })}
      </div>

      {(validation || error) && (
        <div className="u1-snake-window__error">{validation || error}</div>
      )}

      <footer className="u1-snake-window__footer">
        <button type="button" onClick={onCancel} disabled={busy}>
          {request.cancelLabel || "Отмена"}
        </button>
        <button type="button" data-primary onClick={submit} disabled={busy}>
          {busy ? "…" : request.submitLabel || "Сохранить"}
        </button>
      </footer>
    </>
  )
}
