// Channel watchlist for the media-video-workflow skill.
// A lightweight "upstream board": a list of source channels to check for new
// uploads. check reports the latest N per channel (read-only — it does not
// download or write to the registry). Stored in mediaflow-work/channels.json.
import path from 'node:path'
import { ensureDir, pathExists, readJson, writeJson } from './lib.mjs'

export const CHANNELS_SCHEMA_VERSION = 1

export function resolveChannelsPath(flags = {}) {
	const explicit =
		(flags.channels && String(flags.channels)) || process.env.MEDIAFLOW_CHANNELS
	if (explicit) return path.resolve(explicit)
	return path.resolve('mediaflow-work', 'channels.json')
}

export async function loadChannels(filePath) {
	if (!(await pathExists(filePath))) {
		return { path: filePath, channels: [] }
	}
	const data = await readJson(filePath)
	return {
		path: filePath,
		channels: Array.isArray(data.channels) ? data.channels : [],
	}
}

export async function saveChannels(store) {
	await ensureDir(path.dirname(store.path))
	await writeJson(store.path, {
		schemaVersion: CHANNELS_SCHEMA_VERSION,
		channels: store.channels,
	})
}

export function findChannel(store, id) {
	return store.channels.find((c) => c.id === id) || null
}

function slug(value) {
	return (
		String(value)
			.toLowerCase()
			.replace(/^@/, '')
			.replace(/[^a-z0-9_-]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'channel'
	)
}

// Derive { id, name, platform } from a channel URL.
export function deriveChannel(url) {
	let handle = null
	let platform = 'other'
	try {
		const u = new URL(url)
		const h = u.hostname.toLowerCase()
		const isYt = h === 'youtu.be' || h.endsWith('youtube.com')
		platform = isYt ? 'youtube' : 'other'
		if (isYt) {
			let m = u.pathname.match(/\/@([\w.\-]+)/)
			if (m) handle = m[1]
			if (!handle) {
				m = u.pathname.match(/\/(?:channel|c|user)\/([^/?#]+)/)
				if (m) handle = m[1]
			}
		}
	} catch {
		// fall through to last-segment fallback
	}
	if (!handle) {
		const seg = String(url).split(/[/?#]/).filter(Boolean).pop()
		handle = seg || 'channel'
	}
	return { id: slug(handle), name: handle, platform }
}

// Bare YouTube channel URL -> its uploads (latest) tab so flat-playlist lists
// newest uploads deterministically.
export function normalizeChannelUrl(url) {
	try {
		const u = new URL(url)
		if (
			u.hostname.toLowerCase().endsWith('youtube.com') &&
			!/(\/videos|\/streams|\/shorts|\/playlists|\/featured)\b/.test(u.pathname)
		) {
			return u.href.replace(/\/$/, '') + '/videos'
		}
	} catch {
		// leave as-is
	}
	return url
}
