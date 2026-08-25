import { supabase } from "./supabase"

const BUCKET = "campaign-media"
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_FILE_BYTES = 20 * 1024 * 1024

export type UploadImageResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

export type UploadFileResult = UploadImageResult

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

function contentTypeForExtension(extension: string) {
  const canonicalByExtension: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
    pdf: "application/pdf",
    txt: "text/plain",
    md: "text/markdown",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    zip: "application/zip",
  }

  return canonicalByExtension[extension] || null
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
    return { ok: false, error: "Изображение слишком большое. Максимум 20 МБ." }
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

export async function uploadCampaignFile(
  file: File,
  folder: string,
  campaignId: string,
): Promise<UploadFileResult> {
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: "Файл слишком большой. Максимум 20 МБ." }
  }

  if (!campaignId) {
    return { ok: false, error: "Кампания ещё не загружена." }
  }

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    return { ok: false, error: "Не удалось определить текущего пользователя." }
  }

  const safeFolder = folder.replace(/[^a-z0-9_-]/gi, "-") || "files"
  const id =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const extension =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 8) || "bin"
  const contentType = contentTypeForExtension(extension)
  if (!contentType) {
    return { ok: false, error: "Этот формат файла пока не поддерживается." }
  }
  const objectPath = `${campaignId}/${userData.user.id}/${safeFolder}/${id}.${extension}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType,
    })

  if (uploadError) {
    return { ok: false, error: uploadError.message }
  }

  return { ok: true, url: objectPath }
}
