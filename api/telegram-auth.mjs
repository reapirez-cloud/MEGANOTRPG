import { createHmac, timingSafeEqual } from "node:crypto"
import { createClient } from "@supabase/supabase-js"

const MAX_INIT_DATA_AGE_SECONDS = 24 * 60 * 60
const FALLBACK_SUPABASE_URL = "https://msjvdnrpzuavqjcndeqj.supabase.co"

function json(res, status, body) {
  res.status(status).json(body)
}

function validateTelegramInitData(initData, botToken) {
  const params = new URLSearchParams(initData)
  const receivedHash = params.get("hash")

  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) {
    throw new Error("Telegram hash is missing or invalid")
  }

  // For bot-token HMAC validation Telegram says the data-check-string
  // contains every received field except `hash`, sorted alphabetically.
  // Newer clients also send `signature`; it MUST stay in this HMAC string.
  params.delete("hash")

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")

  const secretKey = createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest()

  const expectedHash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex")

  const expectedBuffer = Buffer.from(expectedHash, "hex")
  const receivedBuffer = Buffer.from(receivedHash, "hex")

  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    throw new Error("Telegram hash check failed")
  }

  const authDate = Number(params.get("auth_date"))
  const now = Math.floor(Date.now() / 1000)

  if (!Number.isFinite(authDate)) {
    throw new Error("Telegram auth_date is missing")
  }

  if (authDate > now + 60 || now - authDate > MAX_INIT_DATA_AGE_SECONDS) {
    throw new Error("Telegram authorization data is expired")
  }

  const rawUser = params.get("user")
  if (!rawUser) {
    throw new Error("Telegram user is missing")
  }

  let telegramUser
  try {
    telegramUser = JSON.parse(rawUser)
  } catch {
    throw new Error("Telegram user data is invalid")
  }

  if (
    !telegramUser ||
    typeof telegramUser.id !== "number" ||
    !Number.isSafeInteger(telegramUser.id) ||
    typeof telegramUser.first_name !== "string"
  ) {
    throw new Error("Telegram user data is incomplete")
  }

  return telegramUser
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store")

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    return json(res, 405, { error: "Method not allowed" })
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    FALLBACK_SUPABASE_URL
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY

  const missing = []
  if (!botToken) missing.push("TELEGRAM_BOT_TOKEN")
  if (!supabaseSecretKey) missing.push("SUPABASE_SECRET_KEY")

  if (missing.length > 0) {
    console.error("Telegram auth missing env vars:", missing.join(", "))
    return json(res, 500, {
      error: `На Vercel не найдены переменные: ${missing.join(", ")}.`,
    })
  }

  let body = req.body
  if (typeof body === "string") {
    try {
      body = JSON.parse(body)
    } catch {
      return json(res, 400, { error: "Некорректный JSON." })
    }
  }

  const initData = body?.initData
  if (typeof initData !== "string" || initData.length < 10 || initData.length > 20000) {
    return json(res, 400, { error: "Telegram initData не передан." })
  }

  let telegramUser
  try {
    telegramUser = validateTelegramInitData(initData, botToken)
  } catch (error) {
    console.warn("Telegram initData rejected:", error)
    return json(res, 401, {
      error: "Telegram не смог подтвердить этот вход. Закрой Mini App и открой его заново.",
    })
  }

  const admin = createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const internalEmail = `tg_${telegramUser.id}@telegram.meganotrpg.invalid`

  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email: internalEmail,
    })

  if (linkError || !linkData?.user || !linkData?.properties?.hashed_token) {
    console.error("Supabase generateLink failed:", linkError)
    return json(res, 500, {
      error: "Не удалось создать сессию игрока.",
    })
  }

  const cleanTelegramUser = {
    id: telegramUser.id,
    first_name: telegramUser.first_name,
    last_name:
      typeof telegramUser.last_name === "string" ? telegramUser.last_name : null,
    username:
      typeof telegramUser.username === "string" ? telegramUser.username : null,
    photo_url:
      typeof telegramUser.photo_url === "string" ? telegramUser.photo_url : null,
  }

  const { error: metadataError } = await admin.auth.admin.updateUserById(
    linkData.user.id,
    {
      user_metadata: {
        app: "MEGANOTRPG",
        auth_source: "telegram",
        telegram_id: String(cleanTelegramUser.id),
        telegram_username: cleanTelegramUser.username,
        telegram_first_name: cleanTelegramUser.first_name,
        telegram_last_name: cleanTelegramUser.last_name,
        telegram_photo_url: cleanTelegramUser.photo_url,
      },
    },
  )

  if (metadataError) {
    console.error("Supabase Telegram metadata update failed:", metadataError)
  }

  return json(res, 200, {
    token_hash: linkData.properties.hashed_token,
    telegram_user: cleanTelegramUser,
  })
}
