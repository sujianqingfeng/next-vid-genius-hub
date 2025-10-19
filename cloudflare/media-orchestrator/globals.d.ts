// Minimal ambient types to satisfy Next.js TypeScript build without requiring
// Cloudflare workers type packages in the Next runtime.
// These declarations are intentionally lightweight and scoped to the worker dir.

// eslint-disable-next-line @typescript-eslint/no-empty-interface
declare interface KVNamespace {}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
declare interface R2Bucket {}

