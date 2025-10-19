import { readFile } from 'node:fs/promises'

export async function readMetadataSummary(metadataPath) {
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

export function summariseMetadata(raw) {
  if (!raw) return {}

  const asString = (value) => {
    if (typeof value === 'string' && value.trim()) return value
    return undefined
  }

  const asNumber = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number.parseInt(value, 10)
      if (!Number.isNaN(parsed)) return parsed
    }
    return undefined
  }

  let thumbnail = asString(raw?.thumbnail)
  if (!thumbnail && Array.isArray(raw?.thumbnails)) {
    const thumbnails = raw.thumbnails
    for (let i = thumbnails.length - 1; i >= 0; i--) {
      const candidate = thumbnails[i]
      if (
        candidate &&
        typeof candidate === 'object' &&
        candidate !== null &&
        typeof candidate.url === 'string' &&
        candidate.url.trim()
      ) {
        thumbnail = candidate.url
        break
      }
    }
  }

  const author =
    asString(raw?.uploader) ??
    asString(raw?.channel) ??
    asString(raw?.artist) ??
    asString(raw?.owner) ??
    undefined

  return {
    title: asString(raw?.title),
    author,
    thumbnail,
    viewCount: asNumber(raw?.['view_count'] ?? raw?.['viewCount']),
    likeCount: asNumber(raw?.['like_count'] ?? raw?.['likeCount']),
  }
}

