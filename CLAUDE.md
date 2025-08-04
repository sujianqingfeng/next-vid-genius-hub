# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
- `pnpm dev` - Start development server with Turbopack
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint linting
- `pnpm test` - Run Vitest tests

### Database Management
- `pnpm db:generate` - Generate Drizzle database migrations
- `pnpm db:migrate` - Apply database migrations
- `pnpm db:studio` - Open Drizzle Studio for database management

## Architecture Overview

### Tech Stack
- **Framework**: Next.js 15 with App Router and Turbopack
- **Styling**: Tailwind CSS v4 with shadcn/ui components
- **Database**: SQLite with Drizzle ORM
- **RPC**: oRPC for type-safe client-server communication
- **State Management**: TanStack Query for server state
- **Video Processing**: yt-dlp-wrap, fluent-ffmpeg for YouTube/media downloads
- **AI**: Vercel AI SDK with OpenAI integration
- **Testing**: Vitest
- **Linting**: Biome + ESLint

### Directory Structure
```
app/                    # Next.js App Router
  (workspace)/          # Workspace route group with sidebar layout
    media/              # Media library and download pages
  api/orpc/            # oRPC API endpoints
components/
  ui/                  # shadcn/ui base components
  business/            # Business logic components organized by feature
  layout/              # Layout components (Header, Footer, etc.)
  shared/              # Shared components used across features
  sidebar.tsx          # Main navigation sidebar
lib/
  ai/                  # AI integration utilities
  db/                  # Database schema and connection
  orpc/               # oRPC client configuration
  query/              # QueryClient configuration and hydration
  youtube/            # YouTube download and processing
  constants.ts        # Environment variables and constants
orpc/
  procedures/         # oRPC procedure definitions
  router.ts          # Main oRPC router
```

### Key Architectural Patterns

#### oRPC Integration
- Uses oRPC for type-safe API communication between client and server
- Router defined in `orpc/router.ts` with procedures in `orpc/procedures/`
- Client configured in `lib/orpc/client.ts` with automatic header forwarding
- TanStack Query integration via `lib/orpc/query-client.ts`
- All procedures use lazy loading for better cold start performance
- Type-safe input/output validation with Zod schemas

#### Database Schema
- Single `media` table for storing downloaded video metadata
- Supports YouTube and TikTok sources with quality options (720p, 1080p)
- Tracks engagement metrics (views, likes, comments)
- Stores file paths for both video and extracted audio
- Database operations centralized in `lib/db/index.ts`

#### Media Processing Pipeline
- YouTube downloads via `yt-dlp-wrap` in `lib/youtube/download.ts`
- Audio extraction using `fluent-ffmpeg`
- Metadata extraction and thumbnail handling
- Database storage of media records

#### UI Patterns
- Workspace layout with persistent sidebar navigation
- Paginated media library with loading/error states
- Download form with real-time progress feedback
- shadcn/ui components for consistent design system
- Component organization: base UI in `components/ui/`, business logic in `components/business/`

### Path Aliasing
- Use `~/` prefix for absolute imports from project root
- Configured in `tsconfig.json` with `"~/*": ["./*"]`

### Environment Setup
- Database URL configured via `DATABASE_URL` environment variable
- Local SQLite database at `./local.db` for development
- Next.js image optimization configured for YouTube thumbnails (`i.ytimg.com`)

## Code Conventions

### Next.js 15 Conventions
- **Component Structure**: Use functional components with TypeScript
- **Server Components**: Prefer server components by default, use client components only when necessary
- **Component Organization**:
  - Base UI components: `components/ui/` (shadcn components)
  - Business components: `components/business/` organized by feature
  - Layout components: `components/layout/`
  - Shared components: `components/shared/`
- **Styling**: Use Tailwind CSS utility classes exclusively (no custom CSS)
- **Icons**: Import from `lucide-react` with PascalCase naming (e.g., `HomeIcon`)
- **Language**: All user-facing text must be in English

### oRPC Conventions
- **Procedures**: Define in `orpc/procedures/` with explicit input/output validation
- **Lazy Loading**: Use `os.lazy()` for all procedure imports to optimize cold start
- **Context**: Create context in `orpc/context.ts` with database connection and auth
- **Router**: Define main router in `orpc/router.ts` with nested structure
- **Middleware**: Apply authentication and logging middleware as needed

### Drizzle ORM Conventions
- **Schema**: Define all tables in `lib/db/schema.ts`
- **Database Instance**: Import `db` and `schema` from `~/lib/db`
- **Queries**: Use `db.query` for selects, `db.insert`/`db.update` for mutations
- **Type Safety**: Use `.$inferSelect` and `.$inferInsert` for type inference
- **Migrations**: Generate with `pnpm db:generate`, apply with `pnpm db:migrate`

### TanStack Query Integration
- **Query Client**: Configure in `lib/query/client.ts` with SSR support
- **Query Utils**: Create utilities in `lib/orpc/query-client.ts`
- **Query Keys**: Use oRPC auto-generated keys, avoid manual key creation
- **Caching**: Set appropriate `staleTime` to prevent unnecessary refetches
- **Error Handling**: Use React Error Boundaries for query errors

### Linting and Formatting
- **ESLint**: Use for code quality and error detection. Lint specific files with `pnpm lint --file [file-path]` instead of the entire codebase
- **Biome**: Use for consistent code formatting
- **TypeScript**: Strict mode enabled with comprehensive type checking

### Testing
- Use `pnpm dlx vitest run xxx` to run specific test files
- Use `pnpm test` to run all tests