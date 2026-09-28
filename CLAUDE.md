# CU Photo Club — Claude Instructions

## Styling rules

**Admin pages use scoped CSS + CSS variables — never Tailwind utilities.**
All admin pages (`app/pages/admin/**`, `app/components/Admin*.vue`, `app/components/admin/**`) use `<style scoped>` with BEM class names and CSS variables (`var(--dark)`, `var(--muted)`, `var(--subtle)`, `var(--paper)`, `var(--accent)`). Tailwind utility classes are used only on public-facing pages. Note: theme utilities like `text-ink` / `border-line` / `bg-paper-soft` *do* exist (defined via `@theme` in `app/assets/css/main.css`) and render fine — the rule is a convention, not a breakage risk. A handful of older admin pages/components still use Tailwind; don't add more, and migrate them to scoped CSS when touching them.

## i18n rule

Every user-facing string (admin and public) must go through `useI18n()` / `t()`. Add keys to **both** `i18n/locales/en.json` and `i18n/locales/th.json`. Never hardcode Thai or English directly in templates.

## Admin role/middleware system

| Middleware | Server util | Who can access |
|---|---|---|
| `admin` | `requireAdmin()` | Any logged-in user |
| `admin-manage` | `requireManageUsers()` | `owner` or `admin` role only |

Use `admin-manage` / `requireManageUsers` only for user management and site settings. Content management pages (albums, posts, hero images) use `admin` / `requireAdmin` so editors can access them too.

## Key file locations

- **Admin roles**: `server/utils/auth.ts`
- **DB swap point**: `server/utils/albumStore.ts` (in-memory → real DB later)
- **Image upload**: `app/components/admin/R2ImageUploader.vue` (handles compress + queue)
- **Image picker modal**: `app/components/admin/ImagePickerModal.vue` (used by hero-images page)
- **Photos modal** (album canvas): inline in `app/components/AdminAlbumForm.vue` around line 909
- **Hero images page**: `app/pages/admin/hero-images.vue` → `/admin/hero-images`
- **Dashboard**: `app/pages/admin/index.vue`
- **Photo competitions**: admin at `app/pages/admin/competitions/` → `/admin/competitions`; public page + reveal at `app/pages/compete/[id]/`; rules (phases, vote cap, scoring) in `server/utils/competition.ts`. Entries live under `contributions/competitions/…` so `/images/` never serves them; participants use the `cu_comp` cookie, never the admin session.

## R2 object index (`r2_objects`)

The `r2_objects` D1 table lists every object in the R2 bucket. The storage & cost page reads it instead of walking the bucket. **Never call `blob.put` / `blob.delete` directly.** Use `putR2Object` / `deleteR2Object` from `server/utils/r2Objects.ts`, call `recordR2Objects` after a browser upload is confirmed, and call `forgetR2Objects` after a browser-side delete. `copyR2Object` records itself. Skipping these makes the storage numbers drift. The file header explains the full rule. **Never list the whole bucket inside one request.** Some R2 list calls take 15–90 s, so a full walk can't reliably finish inside Cloudflare's 100 s limit. Re-checks go through the stepped `syncR2ObjectsStep` / `POST /api/admin/r2-objects/sync`.

## Upload queue behaviour

`R2ImageUploader` has a `pendingQueue` — dragging new files while an upload is running appends them; they process after the current batch finishes. Do not reset `total`/`done` counters on a concurrent call. Queued files enter `total` only at the point they're queued (concurrent branch) — the drain loop must not re-count them. Files that can't be uploaded (limit reached / single-file mode) are surfaced via `skippedCount`, never dropped silently.
