import { readFile } from 'node:fs/promises'

export type MetadataSummary = {
  title?: string
  author?: string
  thumbnail?: string
  viewCount?: number
  likeCount?: number
}

export async function readMetadataSummary(metadataPath: string): Promise<MetadataSummary | null> {
  try {
    const raw = await readFile(metadataPath, 'utf8')
    if (!raw.trim()) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return summariseMetadata(parsed)
  } catch (error) {
    console.error('[metadata] failed to read metadata summary', error)
    return null
  }
}

export function summariseMetadata(raw: Record<string, unknown> | null | undefined): MetadataSummary {
  if (!raw) return {}

  const asString = (value: unknown): string | undefined => {
    if (typeof value === 'string' && value.trim()) return value
    return undefined
  }

  const asNumber = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number.parseInt(value, 10)
      if (!Number.isNaN(parsed)) return parsed
    }
    return undefined
  }

  let thumbnail = asString(raw.thumbnail)
  if (!thumbnail && Array.isArray((raw as any).thumbnails)) {
    const thumbnails = (raw as any).thumbnails as unknown[]
    for (let i = thumbnails.length - 1; i >= 0; i--) {
      const candidate = thumbnails[i]
      if (
        candidate &&
        typeof candidate === 'object' &&
        candidate !== null &&
        typeof (candidate as { url?: unknown }).url === 'string' &&
        (candidate as { url: string }).url.trim()
      ) {
        thumbnail = (candidate as { url: string }).url
        break
      }
    }
  }

  const author =
    asString((raw as any).uploader) ??
    asString((raw as any).channel) ??
    asString((raw as any).artist) ??
    asString((raw as any).owner) ??
    undefined

  return {
    title: asString(raw.title),
    author,
    thumbnail,
    viewCount: asNumber((raw as any)['view_count'] ?? (raw as any)['viewCount']),
    likeCount: asNumber((raw as any)['like_count'] ?? (raw as any)['likeCount']),
  }
}

