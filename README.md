# bunrift

A production-ready opinionated starter template for building full-stack applications with Next.js 16 Canary, Better Auth, PostgreSQL, and Bun.

## Overview

This template provides a solid foundation for full-stack development with industry-standard technologies pre-configured and ready to use.

### Included Technologies

- **Next.js 16 Canary** - Latest React framework with App Router
- **Bun** - Fast JavaScript runtime and package manager
- **Better Auth** - Complete authentication solution
- **PostgreSQL** - Relational database
- **Drizzle ORM** - Type-safe SQL ORM for edge runtimes
- **Tailwind CSS 4** - Utility-first CSS framework
- **Biome** - Code formatter and linter
- **TypeScript** - Type-safe JavaScript

## Quick Start

### Prerequisites

- Bun (latest version)
- PostgreSQL database

### Installation

1. Clone the repository:

```bash
git clone https://github.com/Asgarrrr/bunrift
cd bunrift
```

2. Install dependencies:

```bash
bun install
```

3. Configure environment variables:

```bash
cp .env.example .env.local
```

Configure your PostgreSQL connection string and required secrets in `.env.local`.

4. Initialize the database:

```bash
bun run drizzle:generate
bun run drizzle:push
```

5. Start development:

```bash
bun run dev
```

The application will be available at http://localhost:3000.

## Scripts

| Command                    | Purpose                       |
| -------------------------- | ----------------------------- |
| `bun run dev`              | Start development server      |
| `bun run build`            | Build for production          |
| `bun run start`            | Start production server       |
| `bun run lint`             | Check code quality with Biome |
| `bun run format`           | Format code with Biome        |
| `bun run drizzle:generate` | Generate database migrations  |
| `bun run drizzle:push`     | Apply database migrations     |

## Authentication

Better Auth provides a complete authentication system with:

- User registration and login
- Session management
- Built-in security measures
- OAuth provider support

Configuration is handled in `src/lib/auth.ts`. Refer to the Better Auth documentation for advanced setup options.

## Database

Database schema and migrations are managed through Drizzle ORM. Schema files are located in `src/lib/db/schema/`.

To add new tables:

1. Update your schema files
2. Run `bun run drizzle:generate` to create migrations
3. Run `bun run drizzle:push` to apply changes

## Styling

Tailwind CSS 4 is configured and ready to use. Customize the design system through `tailwind.config.ts`.

## Code Quality

Biome handles formatting and linting across JavaScript, TypeScript, and JSON:

```bash
bun run lint      # Check code quality
bun run format    # Auto-format code
```

## Environment Configuration

Required environment variables in `.env.local`:

```
DATABASE_URL=postgresql://user:password@localhost:5432/your-database
BETTER_AUTH_SECRET=your-secret-key
```

## Documentation

- Next.js: https://nextjs.org/docs
- Better Auth: https://better-auth.dev
- Drizzle ORM: https://orm.drizzle.team
- Tailwind CSS: https://tailwindcss.com/docs
- Bun: https://bun.sh/docs
- Biome: https://biomejs.dev

## License

MIT
