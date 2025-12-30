import { describe, expect, test } from 'vitest'
import { migrateThreadTemplateConfigBuiltinsToRepeat } from '../template-migrations'

function findFirstType(value: unknown, type: string): any | null {
	if (!value || typeof value !== 'object') return null
	if (Array.isArray(value)) {
		for (const v of value) {
			const found = findFirstType(v, type)
			if (found) return found
		}
		return null
	}
	const obj = value as any
	if (obj.type === type) return obj
	for (const v of Object.values(obj)) {
		const found = findFirstType(v, type)
		if (found) return found
	}
	return null
}

describe('migrateThreadTemplateConfigBuiltinsToRepeat', () => {
	test('converts Builtin(repliesListReplies) -> Repeat(replies)', () => {
		const input = {
			version: 1,
			scenes: {
				post: {
					root: {
						type: 'Stack',
						children: [
							{
								type: 'Builtin',
								kind: 'repliesListReplies',
								gap: 12,
								wrapItemRoot: true,
								highlight: { enabled: true, color: 'accent', thickness: 3 },
								itemRoot: { type: 'Text', bind: 'post.plainText', maxLines: 3 },
							},
						],
					},
				},
			},
		}

		const res = migrateThreadTemplateConfigBuiltinsToRepeat(input)
		expect(res.changed).toBe(true)
		expect(res.stats.builtinRepliesListReplies).toBe(1)

		const repeat = findFirstType(res.value, 'Repeat')
		expect(repeat).toBeTruthy()
		expect(repeat.source).toBe('replies')
		expect(repeat.gap).toBe(12)
		expect(repeat.wrapItemRoot).toBe(true)
		expect(repeat.highlight?.color).toBe('accent')
		expect(repeat.itemRoot?.bind).toBe('post.plainText')
	})

	test('converts Builtin(repliesListRootPost) and rewrites post.* binds to root.*', () => {
		const input = {
			version: 1,
			scenes: {
				post: {
					root: {
						type: 'Builtin',
						kind: 'repliesListRootPost',
						wrapRootRoot: true,
						rootRoot: { type: 'Text', bind: 'post.author.name', maxLines: 1 },
					},
				},
			},
		}

		const res = migrateThreadTemplateConfigBuiltinsToRepeat(input)
		expect(res.changed).toBe(true)
		expect(res.stats.builtinRepliesListRootPost).toBe(1)

		const text = findFirstType(res.value, 'Text')
		expect(text?.bind).toBe('root.author.name')
	})

	test('converts post.root Builtin(repliesList) into a split layout with Repeat', () => {
		const input = {
			version: 1,
			scenes: {
				post: {
					root: {
						type: 'Builtin',
						kind: 'repliesList',
						gap: 10,
						wrapItemRoot: false,
						itemRoot: { type: 'Text', bind: 'post.plainText', maxLines: 2 },
						rootRoot: { type: 'Text', bind: 'post.plainText', maxLines: 2 },
					},
				},
			},
		}

		const res = migrateThreadTemplateConfigBuiltinsToRepeat(input)
		expect(res.changed).toBe(true)
		expect(res.stats.builtinRepliesList).toBe(1)
		expect(findFirstType(res.value, 'Repeat')).toBeTruthy()
	})
})
