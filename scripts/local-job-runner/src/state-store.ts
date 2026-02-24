import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type {
	LocalJobEvent,
	LocalJobSpec,
	LocalJobStateDoc,
	LocalRunResult,
} from './contracts'

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'canceled'])
const MAX_EVENTS_PER_JOB = 500

function isTerminal(status: string): boolean {
	return TERMINAL_STATUSES.has(status)
}

function clampProgress(value: number | undefined): number | undefined {
	if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
	return Math.max(0, Math.min(1, value))
}

function normalizeStateDir(stateDir?: string): string {
	return path.resolve(stateDir || '.local-jobs')
}

function getJobPath(stateDir: string, jobId: string): string {
	return path.join(normalizeStateDir(stateDir), `${jobId}.json`)
}

export async function ensureStateDir(stateDir?: string): Promise<string> {
	const resolved = normalizeStateDir(stateDir)
	await fs.mkdir(resolved, { recursive: true })
	return resolved
}

async function writeJobAtomic(filePath: string, doc: LocalJobStateDoc): Promise<void> {
	const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${randomUUID().replace(/-/g, '')}.tmp`
	await fs.writeFile(tmpPath, JSON.stringify(doc, null, 2), 'utf8')
	await fs.rename(tmpPath, filePath)
}

export function createJobId(): string {
	return `job_${randomUUID().replace(/-/g, '')}`
}

export async function initJob(
	stateDir: string,
	spec: LocalJobSpec,
	jobId = createJobId(),
): Promise<LocalJobStateDoc> {
	const resolved = await ensureStateDir(stateDir)
	const now = Date.now()
	const doc: LocalJobStateDoc = {
		jobId,
		kind: spec.kind,
		status: 'queued',
		phase: 'queued',
		progress: 0,
		createdAt: spec.createdAt ?? now,
		updatedAt: now,
		startedAt: now,
		lastEventSeq: 0,
		input:
			spec.input && typeof spec.input === 'object'
				? (spec.input as Record<string, unknown>)
				: {},
		outputs: {},
		metadata: {},
		events: [],
	}
	await writeJobAtomic(getJobPath(resolved, jobId), doc)
	return doc
}

export async function getJobStatus(
	stateDir: string,
	jobId: string,
): Promise<LocalJobStateDoc> {
	const filePath = getJobPath(stateDir, jobId)
	const raw = await fs.readFile(filePath, 'utf8')
	return JSON.parse(raw) as LocalJobStateDoc
}

export async function maybeGetJobStatus(
	stateDir: string,
	jobId: string,
): Promise<LocalJobStateDoc | null> {
	try {
		return await getJobStatus(stateDir, jobId)
	} catch {
		return null
	}
}

export async function emitEvent(
	stateDir: string,
	jobId: string,
	event: LocalJobEvent,
): Promise<LocalJobStateDoc> {
	const filePath = getJobPath(stateDir, jobId)
	const doc = await getJobStatus(stateDir, jobId)
	const isAlreadyTerminal = isTerminal(doc.status)
	const isIncomingTerminal = isTerminal(event.status)

	if (isAlreadyTerminal && !isIncomingTerminal) {
		return doc
	}

	const incomingSeq =
		typeof event.eventSeq === 'number' && Number.isFinite(event.eventSeq)
			? Math.max(1, Math.trunc(event.eventSeq))
			: doc.lastEventSeq + 1

	if (incomingSeq <= doc.lastEventSeq) {
		return doc
	}

	const now = Date.now()
	const eventId = event.eventId || `${jobId}:${incomingSeq}`
	const eventTs =
		typeof event.eventTs === 'number' && Number.isFinite(event.eventTs)
			? Math.trunc(event.eventTs)
			: now
	const progress = clampProgress(event.progress)

	doc.lastEventSeq = incomingSeq
	doc.lastEventId = eventId
	doc.updatedAt = now
	doc.status = event.status
	if (event.phase) doc.phase = event.phase
	if (typeof progress === 'number') doc.progress = progress
	if (event.message) doc.message = event.message
	if (typeof event.error === 'string') doc.error = event.error
	if (event.outputs && typeof event.outputs === 'object') {
		doc.outputs = { ...doc.outputs, ...event.outputs }
	}
	if (event.metadata && typeof event.metadata === 'object') {
		doc.metadata = { ...doc.metadata, ...event.metadata }
	}
	if (isIncomingTerminal) {
		doc.finishedAt = now
		if (event.status === 'completed') doc.progress = 1
	}

	doc.events.push({
		eventSeq: incomingSeq,
		eventId,
		eventTs,
		status: event.status,
		phase: event.phase,
		progress,
		message: event.message,
		error: event.error,
	})
	if (doc.events.length > MAX_EVENTS_PER_JOB) {
		doc.events = doc.events.slice(doc.events.length - MAX_EVENTS_PER_JOB)
	}

	await writeJobAtomic(filePath, doc)
	return doc
}

export async function cancelJob(
	stateDir: string,
	jobId: string,
	reason?: string,
): Promise<LocalRunResult> {
	const doc = await emitEvent(stateDir, jobId, {
		status: 'canceled',
		phase: 'canceled',
		message: reason || 'Canceled by user',
		error: reason || 'Canceled by user',
	})
	return { jobId, status: doc.status }
}
