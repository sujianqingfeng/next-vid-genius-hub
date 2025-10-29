/**
 * Client-safe file utilities
 * These functions work in both client and server environments
 */

// Import server-side functions with dynamic imports
let fileExistsImpl: ((path: string) => Promise<boolean>) | null = null;

async function getFileExistsImpl() {
  if (fileExistsImpl === null) {
    // Only import the server implementation on the server side
    if (typeof window === "undefined") {
      fileExistsImpl = async (path: string) => {
        try {
          // Use eval to prevent Next.js from bundling fs
          const { promises: fs } = await eval('import("fs")');
          await fs.access(path);
          return true;
        } catch {
          return false;
        }
      };
    } else {
      // Client-side fallback
      fileExistsImpl = async () => false;
    }
  }
  return fileExistsImpl;
}

/**
 * Client-safe version of fileExists
 * On server: uses fs.access
 * On client: always returns false (no file system access)
 */
export async function fileExists(path: string): Promise<boolean> {
  const impl = await getFileExistsImpl();
  return impl(path);
}
