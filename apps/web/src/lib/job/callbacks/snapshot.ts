export function normaliseEventSeq(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return Math.max(0, Math.trunc(value))
	}
	if (typeof value === 'string' && value.trim()) {
		const parsed = Number.parseInt(value, 10)
		if (Number.isFinite(parsed)) return Math.max(0, parsed)
	}
	return null
}

export function parseJsonish(value: unknown): unknown {
	if (!value) return null
	if (typeof value === 'object') return value
	if (typeof value === 'string') {
		try {
			return JSON.parse(value)
		} catch {
			return null
		}
	}
	return null
}

export function getLastCallbackEventSeq(task: {
	jobStatusSnapshot?: unknown
}): number | null {
	const snapshot = parseJsonish(task.jobStatusSnapshot) as any
	const seq =
		typeof snapshot?.callback?.lastEventSeq === 'number'
			? snapshot.callback.lastEventSeq
			: typeof snapshot?.lastCallbackEventSeq === 'number'
				? snapshot.lastCallbackEventSeq
				: null
	if (typeof seq === 'number' && Number.isFinite(seq))
		return Math.max(0, Math.trunc(seq))
	return null
}

export function mergeCallbackSnapshot(
	task: { jobStatusSnapshot?: unknown },
	input: { eventSeq: number; eventId?: string; eventTs?: number },
) {
	const snapshot = parseJsonish(task.jobStatusSnapshot)
	const base =
		snapshot && typeof snapshot === 'object'
			? (snapshot as Record<string, unknown>)
			: {}
	const existingCallback =
		base.callback && typeof base.callback === 'object'
			? (base.callback as Record<string, unknown>)
			: {}

	return {
		...base,
		callback: {
			...existingCallback,
			lastEventSeq: input.eventSeq,
			lastEventId: input.eventId ?? existingCallback.lastEventId ?? null,
			lastEventTs: input.eventTs ?? Date.now(),
		},
	}
}

export function mergeCallbackValidationSnapshot(
	task: { jobStatusSnapshot?: unknown },
	input: {
		at?: number
		schemaVersion?: number | null
		issues: unknown
	},
) {
	const snapshot = parseJsonish(task.jobStatusSnapshot)
	const base =
		snapshot && typeof snapshot === 'object'
			? (snapshot as Record<string, unknown>)
			: {}
	const existingCallback =
		base.callback && typeof base.callback === 'object'
			? (base.callback as Record<string, unknown>)
			: {}

	return {
		...base,
		callback: {
			...existingCallback,
			validationError: {
				at: input.at ?? Date.now(),
				schemaVersion: input.schemaVersion ?? null,
				issues: input.issues,
			},
		},
	}
}
