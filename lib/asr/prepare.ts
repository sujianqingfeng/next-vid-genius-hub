import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { execa } from 'execa'
import { logger } from '~/lib/logger'
import { CLOUDFLARE_ASR_MAX_UPLOAD_BYTES } from '~/lib/config/app.config'

/**
 * Ensure audio payload meets Cloudflare Workers AI size constraints.
 * If buffer exceeds CLOUDFLARE_ASR_MAX_UPLOAD_BYTES, downsample to mono 16kHz and lower bitrate.
 * Returns the original buffer if already under threshold or if ffmpeg is unavailable.
 */
export async function prepareAudioForCloudflare(
  buffer: ArrayBuffer,
  opts?: { targetBitrateKbps?: number; sampleRate?: number }
): Promise<ArrayBuffer> {
  const maxBytes = CLOUDFLARE_ASR_MAX_UPLOAD_BYTES
  const size = buffer.byteLength
  if (size <= maxBytes) return buffer

  let bitrate = Math.max(16, Math.min(96, opts?.targetBitrateKbps ?? 48)) // 16–96 kbps
  const sampleRate = opts?.sampleRate ?? 16000

  const tmp = tmpdir()
  const id = randomBytes(6).toString('hex')
  const inPath = path.join(tmp, `cf-asr-${id}-in.mp3`)
  const outPath = path.join(tmp, `cf-asr-${id}-out.mp3`)

  try {
    await fs.writeFile(inPath, Buffer.from(buffer))
    for (const attempt of [0, 1]) {
      // ffmpeg -y -i in -vn -ac 1 -ar 16000 -b:a 48k out.mp3
      await execa('ffmpeg', [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-i', inPath,
        '-vn',
        '-ac', '1',
        '-ar', String(sampleRate),
        '-b:a', `${bitrate}k`,
        outPath,
      ])
      const out = await fs.readFile(outPath)
      const outBytes = out.byteLength
      logger.info('transcription', `Downsampled audio: ${size} -> ${outBytes} bytes (~${(outBytes/1048576).toFixed(2)} MB) @ ${bitrate}kbps/${sampleRate}Hz`)
      if (outBytes <= maxBytes || attempt === 1) {
        await Promise.allSettled([fs.unlink(inPath), fs.unlink(outPath)])
        // Clone to a fresh ArrayBuffer to avoid SharedArrayBuffer typing
        const view = new Uint8Array(out.buffer, out.byteOffset, out.byteLength)
        const cloned = new Uint8Array(view)
        return cloned.buffer
      }
      // If still too large, lower bitrate and try once more.
      bitrate = Math.max(16, Math.floor(bitrate / 2)) // e.g., 48 -> 24
    }
    // Should not reach here
    await Promise.allSettled([fs.unlink(inPath), fs.unlink(outPath)])
    return buffer
  } catch (err) {
    logger.warn('transcription', `Downsampling skipped: ${err instanceof Error ? err.message : String(err)}`)
    await Promise.allSettled([fs.unlink(inPath), fs.unlink(outPath)])
    return buffer
  }
}
