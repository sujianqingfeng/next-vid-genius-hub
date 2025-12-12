// Lightweight shim for '@cloudflare/containers' to enable local builds with wrangler
// when the official package/module is not available in the environment.
// This implements the minimal surface used by our worker:
// - class Container (for metadata on [[containers]] entries)
// - function getContainer(binding, id) -> returns an object with fetch()

 
export class Container {
  // Default port the container exposes; used only as metadata by Wrangler/Workers
  // Concrete values are set by subclasses in containers.ts
  defaultPort?: number
  sleepAfter?: string
}

export function getContainer(binding: DurableObjectNamespace, name: string) {
  const id = binding.idFromName(name)
  const stub = binding.get(id)
  return {
    fetch(input: Request | string, init?: RequestInit) {
      // If a string URL is provided, construct a Request compatible with DO fetch
      const req = typeof input === 'string' ? new Request(input, init) : input
      // @ts-ignore - DO stub fetch signature matches the runtime
      return stub.fetch(req)
    },
  }
}

