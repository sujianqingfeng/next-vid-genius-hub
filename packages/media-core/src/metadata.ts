import { readFile } from 'node:fs/promises'
import type { MetadataSummary } from './types'

export async function readMetadataSummary(metadataPath: string): Promise<MetadataSummary | null> {
  try {
    const raw = await readFile(metadataPath, 'utf8')
    if (!raw.trim()) return null
    const parsed = JSON.parse(raw)
    return summariseMetadata(parsed)
  } catch (error) {
    console.error('[media-core/metadata] failed to read metadata summary', error)
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

  let thumbnail = asString((raw as any)?.thumbnail)
  if (!thumbnail && Array.isArray((raw as any)?.thumbnails)) {
    const thumbnails = (raw as any).thumbnails as any[]
    for (let i = thumbnails.length - 1; i >= 0; i--) {
      const candidate = thumbnails[i]
      if (
        candidate &&
        typeof candidate === 'object' &&
        candidate !== null &&
        typeof (candidate as any).url === 'string' &&
        (candidate as any).url.trim()
      ) {
        thumbnail = (candidate as any).url
        break
      }
    }
  }

  const author =
    asString((raw as any)?.uploader) ??
    asString((raw as any)?.channel) ??
    asString((raw as any)?.artist) ??
    asString((raw as any)?.owner) ??
    undefined

  return {
    title: asString((raw as any)?.title),
    author,
    thumbnail,
    viewCount: asNumber((raw as any)?.['view_count'] ?? (raw as any)?.['viewCount']),
    likeCount: asNumber((raw as any)?.['like_count'] ?? (raw as any)?.['likeCount']),
  }
}

