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
  sidebar.tsx          # Main navigation sidebar
lib/
  ai/                  # AI integration utilities
  db/                  # Database schema and connection
  orpc/               # oRPC client configuration
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

#### Database Schema
- Single `media` table for storing downloaded video metadata
- Supports YouTube and TikTok sources with quality options (720p, 1080p)
- Tracks engagement metrics (views, likes, comments)
- Stores file paths for both video and extracted audio

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

### Path Aliasing
- Use `~/` prefix for absolute imports from project root
- Configured in `tsconfig.json` with `"~/*": ["./*"]`

### Environment Setup
- Database URL configured via `DATABASE_URL` environment variable
- Local SQLite database at `./local.db` for development
- Next.js image optimization configured for YouTube thumbnails (`i.ytimg.com`)

### Code Conventions
- Follow Cursor rules in `.cursor/rules/` for Next.js 15 and oRPC patterns
- Use TypeScript with strict mode enabled
- Prefer server components, use client components only when necessary
- Component organization: `ui/` for base components, business logic in route-specific files
- Use lucide-react for icons with consistent sizing classes