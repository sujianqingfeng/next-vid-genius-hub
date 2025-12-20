export async function mapWithConcurrency<TItem, TResult>(
	items: readonly TItem[],
	concurrency: number,
	mapper: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> {
	const safeConcurrency = Math.floor(concurrency)
	if (!Number.isFinite(safeConcurrency) || safeConcurrency < 1) {
		throw new Error(
			`Invalid concurrency: ${String(concurrency)} (expected integer >= 1)`,
		)
	}

	if (items.length === 0) return []

	const results = new Array<TResult>(items.length)
	let nextIndex = 0

	const workerCount = Math.min(safeConcurrency, items.length)
	const workers = Array.from({ length: workerCount }, async () => {
		while (true) {
			const index = nextIndex++
			if (index >= items.length) return
			results[index] = await mapper(items[index], index)
		}
	})

	await Promise.all(workers)
	return results
}
