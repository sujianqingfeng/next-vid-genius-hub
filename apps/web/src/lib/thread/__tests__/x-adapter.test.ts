import { describe, expect, it } from 'vitest'
import {
	buildThreadPostsInsertFromDraft,
	parseXThreadImportDraft,
} from '~/lib/thread/adapters/x'

describe('thread.adapters.x', () => {
	it('parses X thread json into root + one-layer replies blocks', () => {
		const raw = {
			sourceUrl: 'https://x.com/a/status/1',
			total: 2,
			root: {
				statusId: '1',
				url: 'https://x.com/a/status/1',
				author: { displayName: 'A', handle: '@a', profileUrl: 'https://x.com/a' },
				createdAt: '2025-12-25T03:47:05.000Z',
				text: 'Root text',
				metrics: { replies: 1, likes: 10 },
				isRoot: true,
			},
			replies: [
				{
					statusId: '2',
					url: 'https://x.com/b/status/2',
					author: {
						displayName: 'B',
						handle: '@b',
						profileUrl: 'https://x.com/b',
					},
					createdAt: '2025-12-25T05:10:05.000Z',
					text: 'Reply 1',
					metrics: { replies: 0, likes: 3 },
					isRoot: false,
				},
			],
			all: [],
		}

		const draft = parseXThreadImportDraft(raw)
		expect(draft.title).toBe('Root text')
		expect(draft.root.author.handle).toBe('@a')
		expect(draft.replies).toHaveLength(1)
		expect(draft.replies[0]?.author.name).toBe('B')
		expect(draft.replies[0]?.contentBlocks[0]?.type).toBe('text')

		const posts = buildThreadPostsInsertFromDraft({
			threadId: 't1',
			draft,
		})
		expect(posts).toHaveLength(2)
		expect(posts[0]?.role).toBe('root')
		expect(posts[1]?.role).toBe('reply')
		expect(posts[1]?.depth).toBe(1)
		expect(posts[1]?.plainText).toBe('Reply 1')
	})
})

