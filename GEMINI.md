# GEMINI.md

## Project Overview

This is a Next.js project called "Next Vid Genius Hub", a video download and processing platform. It uses Turbopack for development, and the UI is built with React, shadcn/ui, and Tailwind CSS. The backend is powered by oRPC and interacts with a SQLite database via Drizzle ORM. The application allows users to download videos from YouTube and TikTok, and stores media information in the database.

## Building and Running

### Prerequisites

- Node.js and pnpm

### Installation

```bash
pnpm install
```

### Development

To run the development server:

```bash
pnpm dev
```

The application will be available at [http://localhost:3000](http://localhost:3000).

### Database

The project uses Drizzle ORM for database management.

-   **Generate migrations:** `pnpm db:generate`
-   **Apply migrations:** `pnpm db:migrate`
-   **Open Drizzle Studio:** `pnpm db:studio`

### Testing

The project uses vitest for testing.

```bash
pnpm test
```

## Development Conventions

-   **UI:** The project uses shadcn/ui components, which are located in `components/ui`. The main dashboard page is at `app/(workspace)/page.tsx`.
-   **API:** The API is built with oRPC, and procedures are defined in the `orpc/procedures` directory. The main router is in `orpc/router.ts`.
    -   `orpc/procedures/download.ts`: Handles video downloading from YouTube, audio extraction, and database updates.
    -   `orpc/procedures/media.ts`: Provides a paginated list of media items from the database.
-   **Database:** The database schema is defined in `lib/db/schema.ts`. Drizzle is used for migrations and database access.
-   **Video Downloading:** The `lib/youtube/download.ts` file contains the core video download logic using `yt-dlp-wrap`.
-   **Linting:** The project uses Biome for linting and formatting.
-   **Styling:** Tailwind CSS is used for styling.
