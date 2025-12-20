import { createId as createIdImpl } from '~/lib/utils/id'

export type InitOptions = {
	length?: number
	// Keep signature flexible for downstream callers without pulling in the real lib.
	[key: string]: unknown
}

export function init(_options?: InitOptions) {
	return () => createIdImpl()
}

export function createId() {
	return createIdImpl()
}
