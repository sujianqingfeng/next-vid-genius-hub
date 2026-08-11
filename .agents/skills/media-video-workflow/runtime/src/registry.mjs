// Local job registry for the media-video-workflow skill.
// Tracks one record per source video: outputs, the Bilibili submission
// (aid/bvid), and its review state. Self-contained — a single JSON file,
// no database. See SKILL.md "Registry Workflow".
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { ensureDir, pathExists, readJson, writeJson } from './lib.mjs'

export const REGISTRY_SCHEMA_VERSION = 1

export function resolveRegistryPath(flags = {}) {
	const explicit =
		(flags.registry && String(flags.registry)) || process.env.MEDIAFLOW_REGISTRY
	if (explicit) return path.resolve(explicit)
	// Default lives beside the cookies/work dir; override with --registry.
	return path.resolve('mediaflow-work', 'registry.json')
}

export async function loadRegistry(filePath) {
	if (!(await pathExists(filePath))) {
		return { path: filePath, records: [] }
	}
	const data = await readJson(filePath)
	return {
		path: filePath,
		records: Array.isArray(data.records) ? data.records : [],
	}
}

export async function saveRegistry(reg) {
	await ensureDir(path.dirname(reg.path))
	await writeJson(reg.path, {
		schemaVersion: REGISTRY_SCHEMA_VERSION,
		records: reg.records,
	})
}

export function findRecord(reg, id) {
	return reg.records.find((r) => r.id === id) || null
}

// Derive a stable record id from a source URL (YouTube video id when possible).
export function deriveRecordId(sourceUrl) {
	if (!sourceUrl) return null
	try {
		const u = new URL(sourceUrl)
		const h = u.hostname.toLowerCase()
		if (h === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null
		if (h.endsWith('youtube.com')) {
			if (u.searchParams.get('v')) return u.searchParams.get('v')
			const m = u.pathname.match(/\/(?:shorts|embed|live|v)\/([^/?#]+)/)
			if (m) return m[1]
		}
	} catch {
		// fall through
	}
	const fallback = String(sourceUrl).split(/[/?#]/).filter(Boolean).pop()
	return fallback || null
}

// Merge a patch into a record (by id). `outputs` appends; `publish` merges.
export function upsertRecord(reg, patch) {
	const id = patch.id
	if (!id) throw new Error('registry record id is required')
	const ts = new Date().toISOString()
	let rec = reg.records.find((r) => r.id === id)
	if (!rec) {
		rec = {
			id,
			sourceUrl: null,
			jobDir: null,
			title: null,
			outputs: [],
			publish: null,
			publishHistory: [],
			createdAt: ts,
			updatedAt: ts,
		}
		reg.records.push(rec)
	}
	for (const [k, v] of Object.entries(patch)) {
		if (v === undefined || v === null || k === 'id' || k === 'createdAt') continue
		if (k === 'outputs') {
			if (Array.isArray(v) && v.length) rec.outputs = [...(rec.outputs || []), ...v]
		} else if (k === 'publish') {
			rec.publish = { ...(rec.publish || {}), ...v }
		} else {
			rec[k] = v
		}
	}
	rec.updatedAt = ts
	return rec
}

// Map B站 member-API archive state to a review bucket.
// state 0 + no reject_reason => passed; state < 0 + reject_reason => rejected;
// otherwise (e.g. state -30) => processing.
export function mapReviewState(state, rejectReason) {
	if (state === 0) return 'passed'
	if (rejectReason && String(rejectReason).trim()) return 'rejected'
	return 'processing'
}

export async function readBiliCookies(cookieFile) {
	const text = await fs.readFile(cookieFile, 'utf8').catch(() => '')
	const env = {}
	for (const line of text.split('\n')) {
		const idx = line.indexOf('=')
		if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
	}
	return env
}

function cookieHeader(cookies) {
	return ['SESSDATA', 'bili_jct', 'DedeUserID', 'buvid3']
		.filter((k) => cookies[k])
		.map((k) => `${k}=${cookies[k]}`)
		.join('; ')
}

// Hit the member archive view API and return {aid, bvid, state, stateDesc, rejectReason}.
export async function fetchArchiveState(aid, cookies) {
	const url = `https://member.bilibili.com/x/vupre/web/archive/view?aid=${encodeURIComponent(aid)}`
	const res = await fetch(url, {
		headers: { 'User-Agent': 'Mozilla/5.0', Cookie: cookieHeader(cookies) },
	})
	const json = await res.json()
	if (json.code !== 0) {
		const err = new Error(`Bilibili member API error ${json.code}: ${json.message || ''}`)
		err.code = json.code
		throw err
	}
	const arc = (json.data && json.data.archive) || {}
	return {
		aid: arc.aid,
		bvid: arc.bvid,
		state: arc.state,
		stateDesc: arc.state_desc || '',
		rejectReason: arc.reject_reason || '',
	}
}
