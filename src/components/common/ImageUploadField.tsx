import { useState } from "react"

import { uploadCampaignImage } from "../../lib/mediaUpload"
import CampaignImage from "./CampaignImage"

type Props = {
  value: string
  onChange: (value: string) => void
  folder: string
  campaignId: string
  label?: string
  hint?: string
}

export default function ImageUploadField({
  value,
  onChange,
  folder,
  campaignId,
  label = "Арт",
  hint = "Можно выбрать изображение прямо из галереи телефона.",
}: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")

  async function choose(file: File | null) {
    if (!file) return
    setUploading(true)
    setError("")
    const result = await uploadCampaignImage(file, folder, campaignId)
    setUploading(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    onChange(result.url)
  }

  return (
    <div className="image-upload-field">
      <div className="image-upload-field__head">
        <label className="field-label">{label}</label>
        <small>{hint}</small>
      </div>

      {value && (
        <div className="image-upload-preview">
          <CampaignImage value={value} alt="" />
        </div>
      )}

      <div className="image-upload-actions">
        <label
          className={`media-file-button ${
            uploading ? "media-file-button--disabled" : ""
          }`}
        >
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0] || null
              event.currentTarget.value = ""
              void choose(file)
            }}
          />
          {uploading
            ? "Загружаем…"
            : value
              ? "Заменить с телефона"
              : "Выбрать с телефона"}
        </label>

        {value && (
          <button
            className="media-clear-button"
            type="button"
            onClick={() => {
              setError("")
              onChange("")
            }}
            disabled={uploading}
          >
            Убрать
          </button>
        )}
      </div>

      <details className="media-url-details">
        <summary>Или вставить ссылку</summary>
        <input
          className="app-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://..."
        />
      </details>

      {error && <div className="auth-error">{error}</div>}
    </div>
  )
}
