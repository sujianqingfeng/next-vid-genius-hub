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

## Project Conventions

### Next.js 15 Project Basics

- **Tech Stack**
    - **Framework**: Next.js 15 with App Router
    - **Styling**: Tailwind CSS v4
    - **Icons**: lucide-react
    - **Language**: English for all user-facing text
    - **Component Library**: shadcn/ui

- **Key Conventions**
    - **Component Structure**: Use functional components with TypeScript, prefer server components, and place components in `components/` with PascalCase naming.
    - **Styling Guidelines**: Use Tailwind CSS utility classes exclusively, follow a mobile-first approach, and use a consistent spacing scale.
    - **Component Library Usage**: Use shadcn/ui components as the foundation for all UI elements, and install new components using `pnpm dlx shadcn@latest add [component-name]`.
    - **File Organization**:
        ```
        app/                    # App Router pages
          (workspace)/          # Route groups for organization
            page.tsx           # Main page components
            layout.tsx         # Layout components
        components/            # Reusable components
          ui/                  # Base UI components (Button, Input, etc.)
          business/            # Business logic components organized by feature
          layout/              # Layout components (Header, Footer, etc.)
          shared/              # Shared components used across features
        lib/                   # Utilities and shared logic
          db/                  # Database schema and queries
          ai/                  # AI-related utilities
        ```
    - **Path Aliasing**: Use `~/*` for absolute imports from the project root.

### oRPC + React Query Integration

- **Query Usage**: Use `useQuery` for basic queries, `useInfiniteQuery` for infinite scrolling, and `useMutation` for changes.
- **Query Keys**: Use the auto-generated keys from oRPC and invalidate them on mutation success.
- **File Organization**:
    ```
    lib/
      orpc/
        client.ts          # oRPC客户端配置
        query-utils.ts     # React Query工具函数
      query/
        client.ts          # QueryClient配置
        hydration.tsx      # SSR hydration支持
    components/
      business/
        media/
          media-list.tsx   # 使用查询的组件
          media-form.tsx   # 使用变更的组件
    ```

### Development Conventions

-   **UI:** The project uses shadcn/ui components, which are located in `components/ui`. The main dashboard page is at `app/(workspace)/page.tsx`.
-   **API:** The API is built with oRPC, and procedures are defined in the `orpc/procedures` directory. The main router is in `orpc/router.ts`.
    -   `orpc/procedures/download.ts`: Handles video downloading from YouTube, audio extraction, and database updates.
    -   `orpc/procedures/media.ts`: Provides a paginated list of media items from the database.
-   **Database:** The database schema is defined in `lib/db/schema.ts`. Drizzle is used for migrations and database access.
-   **Video Downloading:** The `lib/youtube/download.ts` file contains the core video download logic using `yt-dlp-wrap`.
-   **Linting:** The project uses Biome for linting and formatting.
-   **Styling:** Tailwind CSS is used for styling.
