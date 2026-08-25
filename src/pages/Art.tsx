import { useCallback, useEffect, useRef, useState } from "react"

import { useAuth } from "../context/AuthContext"
import { useCharacters } from "../context/CharacterContext"
import { uploadCampaignImage } from "../lib/mediaUpload"
import { supabase } from "../lib/supabase"
import CampaignImage from "../components/common/CampaignImage"
import { useLongPressItem } from "../hooks/useLongPressItem"

type ArtItem = {
  id: string
  campaign_id: string
  uploaded_by: string | null
  title: string
  image_url: string
  created_at: string
}

export default function Art() {
  const { user } = useAuth()
  const { campaignId, canManage } = useCharacters()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [items, setItems] = useState<ArtItem[]>([])
  const [selected, setSelected] = useState<ArtItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const bindArtLongPress = useLongPressItem<ArtItem>((art) => setSelected(art))

  const load = useCallback(async () => {
    if (!campaignId) return
    setLoading(true)
    setError("")

    const { data, error: loadError } = await supabase
      .from("campaign_art_items")
      .select("id, campaign_id, uploaded_by, title, image_url, created_at")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })

    if (loadError) {
      setError(loadError.message)
      setLoading(false)
      return
    }

    setItems((data || []) as ArtItem[])
    setLoading(false)
  }, [campaignId])

  useEffect(() => {
    void load()
  }, [load])

  async function addArt(file: File | null) {
    if (!file || !campaignId) return
    setUploading(true)
    setError("")

    const upload = await uploadCampaignImage(file, "gallery", campaignId)
    if (!upload.ok) {
      setError(upload.error)
      setUploading(false)
      return
    }

    const title = file.name.replace(/\.[^.]+$/, "").slice(0, 120) || "Арт"
    const { error: insertError } = await supabase
      .from("campaign_art_items")
      .insert({
        campaign_id: campaignId,
        uploaded_by: user.id,
        title,
        image_url: upload.url,
      })

    setUploading(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    await load()
  }

  async function deleteSelected() {
    if (!selected) return
    const { error: deleteError } = await supabase
      .from("campaign_art_items")
      .delete()
      .eq("id", selected.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    setSelected(null)
    await load()
  }

  return (
    <>
      <div className="page-stack">
        <section className="section">
          <div className="section-head">
            <div>
              <h3 className="section-title">Галерея кампании</h3>
              <p className="item-meta">
                Арты, карты, портреты и памятные моменты игроков
              </p>
            </div>

            <>
              <button
                className="section-link media-add-art"
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? "Загрузка…" : "+ Добавить"}
              </button>
              <input
                ref={fileRef}
                className="media-hidden-input"
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null
                  event.currentTarget.value = ""
                  void addArt(file)
                }}
              />
            </>
          </div>

          {error && <div className="auth-error">{error}</div>}
          {loading && (
            <div className="center-state">
              <span className="status-spinner" />
              <span>Загружаем арты…</span>
            </div>
          )}

          {!loading && items.length === 0 && (
            <div className="character-empty surface">
              Артов пока нет. Нажми «+ Добавить» и выбери картинку на телефоне.
            </div>
          )}

          {!loading && items.length > 0 && (
            <div className="art-grid art-grid--real" aria-label="Галерея артов">
              {items.map((art) => (
                <button
                  {...bindArtLongPress(art)}
                  type="button"
                  className="art-tile art-tile--real"
                  key={art.id}
                  aria-label={art.title}
                  onClick={() => setSelected(art)}
                  style={{ touchAction: "pan-y" }}
                >
                  <CampaignImage value={art.image_url} alt={art.title} loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {selected && (
        <div className="sheet-backdrop" onMouseDown={() => setSelected(null)}>
          <div
            className="bottom-sheet art-viewer-sheet"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" />
            <div className="character-editor-head">
              <div>
                <h3 className="sheet-title">{selected.title || "Арт"}</h3>
                <p className="sheet-copy">
                  Галерея кампании
                </p>
              </div>
              <button
                className="sheet-close"
                type="button"
                onClick={() => setSelected(null)}
              >
                ×
              </button>
            </div>
            <CampaignImage
              className="art-viewer-image"
              value={selected.image_url}
              alt={selected.title}
            />
            {(canManage || selected.uploaded_by === user.id) && (
              <button
                className="danger-mini-button art-viewer-delete"
                type="button"
                onClick={() => void deleteSelected()}
              >
                Удалить арт
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
