# CU Photo Club

The website for **CU Photo Club** (ชมรมศิลปะการถ่ายภาพแห่งจุฬาลงกรณ์มหาวิทยาลัย) — the official photography club of Chulalongkorn University. It's an editorial photography showcase (albums, activities/events, a gallery of event websites, member profiles) plus a small CMS the club's own admins use to run it, and a no-login upload flow for event attendees to submit photos.

**Live site: [cuphotoclub.com](https://cuphotoclub.com/)**

Bilingual throughout: every page ships in English and Thai.

## Tech stack

- **[Nuxt 4](https://nuxt.com/)** (Vue 3) — SSR web app
- **[NuxtHub](https://hub.nuxt.com/)** (`@nuxthub/core`) deploying to **Cloudflare**:
  - **D1** (SQLite) as the database, via **Drizzle ORM** (`server/db/schema.ts`)
  - **R2** for photo/object storage
  - **KV** for small key/value needs (rate limiting, etc.)
  - **Cloudflare Image Transformations** (`/cdn-cgi/image/`) for on-the-fly resizing in production, via `@nuxt/image`
- **`nuxt-auth-utils`** for admin session auth (password + optional Google OAuth)
- **`@nuxtjs/i18n`** for English/Thai routing and translations
- **Scoped `<style>` + CSS variables** (BEM-ish) everywhere — Tailwind CSS v4 is wired up but is legacy on a handful of older files, not the active convention. See [Styling](#styling--conventions) below.
- **`@nuxt/content`** for a handful of markdown-seeded albums (`content/albums`)
- **Zod**, **exifr** (EXIF reading), **heic2any** (HEIC→JPEG conversion for uploads)

## Getting started

Requires the [pnpm](https://pnpm.io/) package manager (`packageManager` is pinned in `package.json`; currently pnpm 11.9).

```bash
pnpm install
```

Copy the example env file and fill in what you need:

```bash
cp .env.example .env
```

`.env.example` documents every variable, but the notable ones:

- `NUXT_SESSION_PASSWORD` — required, any long random string (session encryption for `nuxt-auth-utils`).
- `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` — a dev owner account auto-seeded on first `pnpm dev`, so you can log into `/admin` locally without touching the database by hand.
- `NUXT_OAUTH_GOOGLE_CLIENT_ID` / `_SECRET` — optional; leave blank to use password-only admin login.
- `NUXT_R2_ACCOUNT_ID` / `NUXT_R2_BUCKET_NAME` / `NUXT_R2_ACCESS_KEY_ID` / `NUXT_R2_SECRET_ACCESS_KEY` — only needed for direct browser-to-R2 uploads against a *real* R2 bucket; local dev can run without them (NuxtHub emulates blob storage locally).
- `NUXT_REAL_DATA_ONLY` / `NUXT_PUBLIC_REAL_DATA_ONLY` — production always runs "real data only"; set to `false` locally if you want to preview mock/placeholder content paths.

### Running it

There are three ways to run the app locally, depending on what you're touching:

| Script | What it does |
|---|---|
| `pnpm dev` | Standard `nuxt dev`. Uses NuxtHub's local emulation of D1 (a local SQLite file via libsql)/R2/KV — nothing touches production. This is what you want almost all the time. |
| `pnpm dev:real` | Same as `pnpm dev` but forces `NUXT_REAL_DATA_ONLY=true`, i.e. runs the app the way production runs it (no mock-content fallbacks). |
| `pnpm online` | Builds the app for Cloudflare, then runs it under `wrangler pages dev` bound to the **real, remote** D1/R2/KV resources (`wrangler d1 migrations apply --remote` first). Every write is live on production data immediately — only use this deliberately, and only if you're already `wrangler login`'d against the right account. |

Other scripts:

- `pnpm build` — production build, `--preset=cloudflare-pages` (what CI uses).
- `pnpm build:node` — a plain Node build, useful for sanity-checking output outside Cloudflare's preset.
- `pnpm typecheck` — `nuxi typecheck` (Vue + TS across the app).
- `pnpm lint` — ESLint (`eslint .`).
- `pnpm db:generate` — regenerates Drizzle migrations from `server/db/schema.ts` (`nuxt prepare && drizzle-kit generate`).

Run `pnpm typecheck` and `pnpm lint` before opening a PR.

## A tour of the app

```
app/pages/            public + admin routes (file-based routing)
app/components/       Vue components (admin/* vs public split by convention)
app/middleware/        admin.ts, admin-manage.ts (route guards)
server/api/            API routes (mirrors public/admin/contribute split)
server/db/schema.ts     Drizzle schema — source of truth for the D1 database
server/db/migrations/  generated SQL migrations
server/utils/           shared server logic (auth, albumStore, r2, settings, slug…)
shared/types.ts         types shared between client and server (Album, AlbumStyle, etc.)
i18n/locales/           en.json / th.json — all user-facing strings
content/albums                    a handful of markdown-seeded albums (@nuxt/content)
```

**Public site** — `app/pages/index.vue` (home, with a hero section), `albums/` (the photography showcase — each album renders in one of several visual "styles": `essay`, `sticky`, `contact`, `darkroom`, `chapters`), `events/` (gallery of event websites, each linking to its own site), `activities/` (club events), `members/`, `about.vue`, `contacts.vue`. Most public pages are cached at the edge via `swr` route rules (see `nuxt.config.ts`) to survive traffic bursts.

**Contribute flow** — `app/pages/contribute/[token].vue` and `server/api/contribute/[token]/**`. An admin creates a share link (a "collection") from `/admin`; anyone with the link can upload photos without an account. Identity is a lightweight per-device **claim code** (stored in a `collection_contributors` row, hashed) rather than a real login, so the same contributor can come back and edit/delete their own submissions from another device by entering the code. Uploaded photos land in an admin-only **submissions pool** (`collection_submissions`) — nothing here is public until an admin reviews and approves it into a real album. See `docs/dev/event-photo-submissions.md` for the fuller design.

**Admin CMS** — everything under `app/pages/admin/**`, guarded by one of two route middlewares:

| Middleware | Server check | Who |
|---|---|---|
| `admin` | `requireAdmin()` | any logged-in user (owner/admin/editor) |
| `admin-manage` | `requireManageUsers()` | `owner` or `admin` role only |

Content management (albums, hero images, activities, members, upload links, the submissions pool) uses `admin`, so editors can do their job; user management and site-wide settings use `admin-manage`. Admin pages use scoped CSS + CSS variables rather than Tailwind (see below).

## Styling & conventions

- **All new pages/components** (public and admin): `<style scoped>`, BEM-style class names, CSS variables (`var(--dark)`, `var(--muted)`, `var(--accent)`, etc.) — not Tailwind utilities. `CLAUDE.md` describes this as an admin-only rule with Tailwind on public pages, but that's stale: every current public page (`index.vue`, `albums/`, `events/`, `contribute/[token].vue`, etc.) is already scoped CSS. A few older admin components (e.g. `CoverUploader.vue`) still carry Tailwind classes from before the convention settled — don't add more to them, migrate opportunistically when you're already touching one.
- **i18n**: every user-facing string goes through `useI18n()` / `t()`, with keys added to both `i18n/locales/en.json` and `i18n/locales/th.json`. Never hardcode English or Thai text in a template.

A repo-root `CLAUDE.md` documents these (and a few other) conventions in more depth for AI-assisted development (Claude Code) — worth a read if you're contributing with an AI pair-programmer, but it's not required reading for normal human contribution.

## Deployment

Deploys go out via **GitHub CI/CD on push to `master`** — Cloudflare Pages builds and deploys automatically. Do not run `wrangler pages deploy` by hand; the only sanctioned way to test against real Cloudflare resources locally is `pnpm online` (see above), which is separate from actually shipping a deploy.
