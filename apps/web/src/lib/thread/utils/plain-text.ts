import type { ThreadContentBlock } from '~/lib/thread/types'

export function blocksToPlainText(blocks: ThreadContentBlock[]): string {
	const parts: string[] = []

	for (const b of blocks) {
		if (b.type === 'text') {
			const t = b.data.text.trim()
			if (t) parts.push(t)
		} else if (b.type === 'quote') {
			const t = b.data.text.trim()
			if (t) parts.push(t)
		} else if (b.type === 'link') {
			const t = b.data.title?.trim() || b.data.url.trim()
			if (t) parts.push(t)
		}
	}

	return parts.join('\n\n')
}
