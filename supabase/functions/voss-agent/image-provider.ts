import type { ImageProfile } from "./image-profiles.ts"

export type GeneratedImagePayload = {
  b64Json: string
  revisedPrompt: string | null
}

export class ImageProviderError extends Error {
  code: string
  status: number
  providerStatus: number | null
  detail: string

  constructor(
    message: string,
    options: {
      code: string
      status: number
      providerStatus?: number | null
      detail?: string
    },
  ) {
    super(message)
    this.name = "ImageProviderError"
    this.code = options.code
    this.status = options.status
    this.providerStatus = options.providerStatus ?? null
    this.detail = options.detail || ""
  }
}

function getEnv(...names: string[]) {
  for (const name of names) {
    const value = Deno.env.get(name)
    if (value) return value
  }
  return ""
}

function imageApiKey() {
  const value = getEnv("OPENAI_IMAGE_API_KEY", "OPENAI_API_KEY", "AI_API_KEY")
  if (!value) {
    throw new ImageProviderError("Image provider is not configured", {
      code: "image_provider_not_configured",
      status: 503,
      detail: "OPENAI_IMAGE_API_KEY is missing",
    })
  }
  return value
}

function apiBase() {
  return (getEnv("OPENAI_IMAGE_API_BASE_URL") || "https://api.openai.com/v1")
    .replace(/\/+$/, "")
}

async function parseImageResponse(response: Response) {
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1800)
    throw new ImageProviderError("Image provider returned an error", {
      code: "image_provider_error",
      status: 502,
      providerStatus: response.status,
      detail,
    })
  }

  let payload: any
  try {
    payload = await response.json()
  } catch (error) {
    throw new ImageProviderError("Image provider returned invalid JSON", {
      code: "image_provider_invalid_response",
      status: 502,
      detail: error instanceof Error ? error.message : String(error),
    })
  }

  const rows = Array.isArray(payload?.data) ? payload.data : []
  const images: GeneratedImagePayload[] = rows
    .map((row: any) => ({
      b64Json: typeof row?.b64_json === "string" ? row.b64_json : "",
      revisedPrompt:
        typeof row?.revised_prompt === "string" ? row.revised_prompt : null,
    }))
    .filter((row: GeneratedImagePayload) => row.b64Json.length > 0)

  return {
    images,
    usage:
      payload?.usage && typeof payload.usage === "object"
        ? payload.usage
        : null,
  }
}

export type ImageReference = {
  bytes: Uint8Array
  mimeType: string
  fileName: string
}

export async function requestImageBatch(input: {
  prompt: string
  count: number
  profile: ImageProfile
  references?: ImageReference[]
}) {
  const apiKey = imageApiKey()
  const references = input.references || []
  const count = Math.max(1, Math.min(2, Math.trunc(input.count)))

  let response: Response
  try {
    if (!references.length) {
      response = await fetch(apiBase() + "/images/generations", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: input.profile.model,
          prompt: input.prompt,
          n: count,
          size: input.profile.size,
          quality: input.profile.quality,
          response_format: "b64_json",
        }),
      })
    } else {
      const images: GeneratedImagePayload[] = []
      const usages: unknown[] = []

      for (let variant = 0; variant < count; variant += 1) {
        const form = new FormData()
        form.append("model", input.profile.model)
        form.append("prompt", input.prompt)
        form.append("size", input.profile.size)
        form.append("quality", input.profile.quality)

        for (const reference of references.slice(0, 4)) {
          form.append(
            "image",
            new Blob([reference.bytes], { type: reference.mimeType }),
            reference.fileName,
          )
        }

        response = await fetch(apiBase() + "/images/edits", {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + apiKey,
          },
          body: form,
        })

        const parsed = await parseImageResponse(response)
        if (parsed.images[0]) images.push(parsed.images[0])
        if (parsed.usage) usages.push(parsed.usage)
      }

      return {
        images,
        usage: usages.length ? usages : null,
      }
    }
  } catch (error) {
    throw new ImageProviderError("Image provider request failed", {
      code: "image_provider_request_failed",
      status: 502,
      detail: error instanceof Error ? error.message : String(error),
    })
  }

  return parseImageResponse(response)
}
