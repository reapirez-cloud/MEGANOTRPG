import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const chatsPath = new URL("../src/pages/Chats.tsx", import.meta.url)
const uploadPath = new URL("../src/components/common/ImageUploadField.tsx", import.meta.url)
const cropperPath = new URL("../src/components/common/WideImageCropper.tsx", import.meta.url)
const catalogStylesPath = new URL("../src/chats-v3.css", import.meta.url)

test("chat preview crop primitive stays available for the later catalog editor", async () => {
  const upload = await readFile(uploadPath, "utf8")
  const cropper = await readFile(cropperPath, "utf8")

  assert.match(upload, /folder === "chat-previews" \? "wide"/)
  assert.match(upload, /WideImageCropper/)
  assert.match(cropper, /OUTPUT_WIDTH = 1600/)
  assert.match(cropper, /OUTPUT_HEIGHT = 900/)
  assert.match(cropper, /aspect-ratio|Выбери кадр/)
})

test("stage 1 catalog keeps room artwork and readable message preview as separate content", async () => {
  const chats = await readFile(chatsPath, "utf8")
  const styles = await readFile(catalogStylesPath, "utf8")

  assert.match(chats, /CampaignImage/)
  assert.match(chats, /room\.preview \|\| "Пока без сообщений"/)
  assert.match(styles, /\.chat-catalog__art img/)
  assert.match(styles, /object-fit: cover/)
  assert.match(styles, /\.chat-catalog__preview/)
  assert.match(styles, /text-overflow: ellipsis/)
})
