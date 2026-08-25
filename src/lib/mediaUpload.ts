import { supabase } from "./supabase"

const BUCKET = "campaign-media"
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

export type UploadImageResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

function extensionFor(file: File) {
  const fromName = file.name
    .split(".")
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, "")

  if (fromName && fromName.length <= 5) return fromName

  const mimeMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/heic": "heic",
    "image/heif": "heif",
  }

  return mimeMap[file.type] || "jpg"
}

export async function uploadCampaignImage(
  file: File,
  folder: string,
  campaignId: string,
): Promise<UploadImageResult> {
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "Выбери файл изображения." }
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Изображение слишком большое. Максимум 10 МБ." }
  }

  if (!campaignId) {
    return { ok: false, error: "Кампания ещё не загружена." }
  }

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    return { ok: false, error: "Не удалось определить текущего пользователя." }
  }

  const safeFolder = folder.replace(/[^a-z0-9_-]/gi, "-") || "misc"
  const id =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const objectPath = `${campaignId}/${userData.user.id}/${safeFolder}/${id}.${extensionFor(file)}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    })

  if (uploadError) {
    return { ok: false, error: uploadError.message }
  }

  return { ok: true, url: objectPath }
}
