import { eq } from 'drizzle-orm'
import { bucketPaths } from '@app/media-domain'
import { getDb, schema, type TranscriptionWord } from '~/lib/db'
import { putObjectByKey, presignGetByKey, upsertMediaManifest } from '~/lib/cloudflare'
import { logger } from '~/lib/logger'
import { normalizeVttContent, validateVttContent } from '~/lib/subtitle/utils/vtt'

interface PersistAsrResultInput {
	mediaId: string
	vttKey?: string | null
	wordsKey?: string | null
	vttUrl?: string | null
	wordsUrl?: string | null
	title?: string | null
}

async function resolveUrl({ key, url }: { key?: string | null; url?: string | null }) {
	if (url) return url
	if (key) return await presignGetByKey(key)
	throw new Error('ASR callback missing VTT URL/key')
}

export async function persistAsrResultFromBucket(input: PersistAsrResultInput) {
	const { mediaId, vttKey, wordsKey, vttUrl: rawVttUrl, wordsUrl: rawWordsUrl, title } = input

	const vttUrl = await resolveUrl({ key: vttKey ?? undefined, url: rawVttUrl ?? undefined })
	const vttResp = await fetch(vttUrl)
	if (!vttResp.ok) throw new Error()
	let vttContent = await vttResp.text()

	let transcriptionWords: TranscriptionWord[] | undefined
	const wordsSource = wordsKey || rawWordsUrl
	if (wordsSource) {
		try {
			const wordsUrl = rawWordsUrl || (await presignGetByKey(wordsKey!))
			const wr = await fetch(wordsUrl)
			if (wr.ok) transcriptionWords = (await wr.json()) as TranscriptionWord[]
		} catch (err) {
			logger.warn(
				'transcription',
				`[persistAsrResultFromBucket] Failed to fetch transcription words for media=${mediaId}: ${
					err instanceof Error ? err.message : String(err)
				}`,
			)
		}
	}

	const validation = validateVttContent(vttContent)
	if (!validation.isValid) {
		logger.warn(
			'transcription',
			`[persistAsrResultFromBucket] VTT validation failed for media=${mediaId}: ${validation.errors.join(
				', ',
			)}; attempting normalize`,
		)
		vttContent = normalizeVttContent(vttContent)
		const revalidation = validateVttContent(vttContent)
		if (!revalidation.isValid) {
			logger.error(
				'transcription',
				`[persistAsrResultFromBucket] VTT still invalid after normalization for media=${mediaId}: ${revalidation.errors.join(
					', ',
				)}`,
			)
			throw new Error('VTT validation failed after normalization')
		}
	}

	const db = await getDb()
	await db
		.update(schema.media)
		.set({ transcription: vttContent, transcriptionWords })
		.where(eq(schema.media.id, mediaId))

	try {
		const vttTargetKey = bucketPaths.inputs.subtitles(mediaId, { title: title || undefined })
		await putObjectByKey(vttTargetKey, 'text/vtt', vttContent)
		await upsertMediaManifest(mediaId, { vttKey: vttTargetKey }, title || undefined)
		logger.info(
			'transcription',
			`[persistAsrResultFromBucket] VTT materialized media=${mediaId} key=${vttTargetKey}`,
		)
	} catch (err) {
		logger.warn(
			'transcription',
			`[persistAsrResultFromBucket] VTT materialization skipped media=${mediaId}: ${
				err instanceof Error ? err.message : String(err)
			}`,
		)
	}
}
