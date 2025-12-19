// Ambient Cloudflare Workers types for local/Next builds.
// Keep this file scoped to the worker directory to avoid pulling in full
// @cloudflare/workers-types in the Next runtime.

// ---------------- KV ----------------
type KVGetType = 'text' | 'json' | 'arrayBuffer' | 'stream'

interface KVNamespaceGetOptions {
	type?: KVGetType
	cacheTtl?: number
}

interface KVNamespacePutOptions {
	expiration?: number
	expirationTtl?: number
	metadata?: unknown
}

interface KVNamespaceListOptions {
	prefix?: string
	limit?: number
	cursor?: string
}

interface KVNamespaceListKey {
	name: string
	expiration?: number
	metadata?: unknown
}

interface KVNamespaceListResult {
	keys: KVNamespaceListKey[]
	list_complete: boolean
	cursor?: string
}

declare interface KVNamespace {
	get(key: string, type?: 'text'): Promise<string | null>
	get<T = unknown>(key: string, type: 'json'): Promise<T | null>
	get(key: string, type: 'arrayBuffer'): Promise<ArrayBuffer | null>
	get(key: string, type: 'stream'): Promise<ReadableStream | null>
	get(key: string, options?: KVNamespaceGetOptions): Promise<any>
	getWithMetadata<T = unknown, M = unknown>(
		key: string,
		type?: KVGetType,
	): Promise<{ value: T | null; metadata: M | null }>
	put(
		key: string,
		value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
		options?: KVNamespacePutOptions,
	): Promise<void>
	delete(key: string): Promise<void>
	list(options?: KVNamespaceListOptions): Promise<KVNamespaceListResult>
}

// ---------------- R2 ----------------
type R2PutValue = ReadableStream | ArrayBuffer | ArrayBufferView | Blob | string

interface R2HTTPMetadata {
	contentType?: string
	contentLanguage?: string
	contentDisposition?: string
	contentEncoding?: string
	cacheControl?: string
	cacheExpiry?: Date
}

interface R2Conditional {
	etagMatches?: string
	etagDoesNotMatch?: string
	uploadedBefore?: Date
	uploadedAfter?: Date
}

interface R2Range {
	offset?: number
	length?: number
	suffix?: number
}

interface R2GetOptions {
	range?: R2Range
	onlyIf?: R2Conditional
}

interface R2PutOptions {
	httpMetadata?: R2HTTPMetadata
	customMetadata?: Record<string, string>
	sha256?: string
	onlyIf?: R2Conditional
}

interface R2ListOptions {
	prefix?: string
	delimiter?: string
	cursor?: string
	limit?: number
	include?: Array<'httpMetadata' | 'customMetadata'>
}

interface R2Object {
	key: string
	size: number
	etag: string
	uploaded: Date
	httpMetadata?: R2HTTPMetadata
	customMetadata?: Record<string, string>
}

interface R2ObjectBody extends R2Object {
	body: ReadableStream
	arrayBuffer(): Promise<ArrayBuffer>
	text(): Promise<string>
	json<T = unknown>(): Promise<T>
	blob(): Promise<Blob>
}

interface R2Objects {
	objects: R2Object[]
	truncated: boolean
	cursor?: string
	delimitedPrefixes: string[]
}

declare interface R2Bucket {
	head(key: string): Promise<R2Object | null>
	get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | null>
	put(key: string, value: R2PutValue, options?: R2PutOptions): Promise<R2Object>
	delete(key: string | string[]): Promise<void>
	list(options?: R2ListOptions): Promise<R2Objects>
}

// ---------------- Durable Objects ----------------
interface DurableObjectId {}

interface DurableObjectStub {
	fetch(input: Request | string, init?: RequestInit): Promise<Response>
}

interface DurableObjectNamespace {
	idFromName(name: string): DurableObjectId
	idFromString(id: string): DurableObjectId
	get(id: DurableObjectId): DurableObjectStub
}

interface DurableObjectStorage {
	get<T = unknown>(key: string): Promise<T | undefined>
	put<T = unknown>(key: string, value: T): Promise<void>
	delete(key: string): Promise<boolean>
	list<T = unknown>(options?: unknown): Promise<Map<string, T>>
	// Durable Objects alarms API (subset)
	setAlarm(scheduledTime: number): Promise<void>
}

interface DurableObjectState {
	id: DurableObjectId
	storage: DurableObjectStorage
	waitUntil(promise: Promise<unknown>): void
	blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>
}
