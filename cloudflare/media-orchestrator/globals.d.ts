// Minimal ambient types to satisfy Next.js TypeScript build without requiring
// Cloudflare workers type packages in the Next runtime.
// These declarations are intentionally lightweight and scoped to the worker dir.

// eslint-disable-next-line @typescript-eslint/no-empty-interface
declare interface KVNamespace {}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
declare interface R2Bucket {}

// Minimal Durable Objects ambient declarations
interface DurableObjectId {}
interface DurableObjectStub {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>
}
interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId
  get(id: DurableObjectId): DurableObjectStub
}
