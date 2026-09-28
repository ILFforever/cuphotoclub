import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import type { AlbumRow, AlbumStyle, ContentStatus, HeroStyle, Placement, PostBlock, TextAlign, TextFont } from '~~/shared/types'

const createdAt = integer('created_at', { mode: 'timestamp' })
  .notNull()
  .default(sql`(unixepoch())`)
const updatedAt = integer('updated_at', { mode: 'timestamp' })
  .notNull()
  .default(sql`(unixepoch())`)

// Admins / allow-list. A row here = permission to sign in (OAuth or password).
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  role: text('role', { enum: ['owner', 'admin', 'editor'] })
    .notNull()
    .default('editor'),
  passwordHash: text('password_hash'),
  googleSub: text('google_sub'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt,
  lastLoginAt: integer('last_login_at', { mode: 'timestamp' })
})

// Galleries = event albums.
export const albums = sqliteTable('albums', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  eventDate: integer('event_date', { mode: 'timestamp' }),
  // plain id (no FK) to avoid a circular constraint with photos.album_id
  coverPhotoId: integer('cover_photo_id'),
  status: text('status', { enum: ['draft', 'published'] })
    .notNull()
    .default('draft'),
  publishedAt: integer('published_at', { mode: 'timestamp' }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdBy: integer('created_by').references(() => users.id),
  createdAt,
  updatedAt
})

export const photos = sqliteTable('photos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  albumId: integer('album_id')
    .notNull()
    .references(() => albums.id, { onDelete: 'cascade' }),
  r2Key: text('r2_key').notNull(),
  width: integer('width'),
  height: integer('height'),
  placeholder: text('placeholder'), // LQIP / blurhash for fast loads
  caption: text('caption'),
  alt: text('alt'),
  photographer: text('photographer'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt
}, table => [
  // SQLite doesn't index FKs automatically; album pages and the home feed all
  // filter or join photos on album_id, so without this each read is a full scan.
  index('photos_album_id_idx').on(table.albumId)
])

export const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  excerpt: text('excerpt'),
  body: text('body').notNull().default(''), // markdown
  coverR2Key: text('cover_r2_key'),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  status: text('status', { enum: ['draft', 'published'] })
    .notNull()
    .default('draft'),
  publishedAt: integer('published_at', { mode: 'timestamp' }),
  authorId: integer('author_id').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
  createdAt,
  updatedAt
})

export const events = sqliteTable('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  summary: text('summary'),
  body: text('body').notNull().default(''), // markdown
  galleryR2Keys: text('gallery_r2_keys', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  eventDate: integer('event_date', { mode: 'timestamp' }),
  endDate: integer('end_date', { mode: 'timestamp' }), // optional last day for multi-day events
  location: text('location'),
  coverR2Key: text('cover_r2_key'),
  registerUrl: text('register_url'), // optional external sign-up link
  status: text('status', { enum: ['draft', 'published'] })
    .notNull()
    .default('draft'),
  publishedAt: integer('published_at', { mode: 'timestamp' }),
  createdAt,
  updatedAt
})

// ── Photo collections (docs/dev/event-photo-submissions.md) ──────────────────
// Participants upload photos through a share link an admin creates from the
// dashboard. Standalone on purpose — no reference to events/activities, which
// run on their own lifecycle. Everything lands in an admin-only pool; an admin
// later consolidates the keepers into a real album.

// One share link per collection. Carries every limit and policy the admin sets;
// closing it ends both uploading and contributor editing.
export const collectionLinks = sqliteTable('collection_links', {
  id: text('id').primaryKey(), // url-safe random token, ~22 chars
  label: text('label').notNull(),
  // Free-form context shown on the contribute page under the title — what the
  // collection is for, what kind of photos are wanted.
  description: text('description'),
  // Optional cover shown on the contribute page. Collections are standalone, so
  // there is no event to borrow an image from — an admin uploads one per
  // collection, and the page falls back to a gradient when it is null.
  coverR2Key: text('cover_r2_key'),
  // When and where the thing being photographed happened. Both optional, both
  // display-only — they name the occasion for the participant, nothing reads
  // them as data. Same column names as `events` for familiarity; there is still
  // no reference between the two tables.
  eventDate: integer('event_date', { mode: 'timestamp' }),
  location: text('location'),
  // The album approved photos land in. Created as a draft alongside the
  // collection so there is always somewhere for a photo to go — approving is
  // then one copy + one row, never "pick a destination first". Nullable because
  // collections created before this existed have none until first approve, and
  // because an album can be deleted out from under it (dangling is detected and
  // offered a relink rather than being prevented by an FK the album store,
  // which is not a relational table, could not enforce anyway).
  albumId: text('album_id'),
  status: text('status', { enum: ['open', 'closed'] }).notNull().default('open'),
  // Optional second factor. No admin UI ships for this yet — a link's token is
  // the credential; this exists so adding one later is not a migration.
  passcodeHash: text('passcode_hash'),
  requireName: integer('require_name', { mode: 'boolean' }).notNull().default(false),

  maxPerContributor: integer('max_per_contributor').notNull().default(100),
  maxTotal: integer('max_total').notNull().default(2000),

  // Client-side compression policy, handed to the uploader as props. Stored as
  // real numbers rather than a preset enum so the admin UI can offer presets and
  // still let someone nudge one value without a schema change. Defaults mirror
  // R2ImageUploader's own constants.
  compress: integer('compress', { mode: 'boolean' }).notNull().default(true),
  compressMaxDim: integer('compress_max_dim').notNull().default(3040),
  compressQuality: integer('compress_quality').notNull().default(85), // percent
  // The server-enforced half of that policy: compression runs in the browser and
  // can be bypassed, this cannot. Never above MAX_UPLOAD_BYTES.
  maxBytesPerPhoto: integer('max_bytes_per_photo').notNull().default(15 * 1024 * 1024),

  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  createdBy: integer('created_by').references(() => users.id),
  createdAt,
  updatedAt
})

// One row per participant per link. The id lives in the cu_contrib cookie; the
// claim code is what makes that identity portable to another device.
export const collectionContributors = sqliteTable('collection_contributors', {
  id: text('id').primaryKey(), // uuid
  linkId: text('link_id')
    .notNull()
    .references(() => collectionLinks.id, { onDelete: 'cascade' }),
  // SHA-256 of the Crockford-base32 claim code. Never the plaintext — that lives
  // only in this person's own sealed cookie.
  codeHash: text('code_hash').notNull(),
  displayName: text('display_name'), // null = anonymous
  contact: text('contact'), // admin-only, optional
  // Whether this person agreed to be credited by their handle when a photo of
  // theirs is published. Separate from displayName having a value: someone can
  // give us a name to reach them by without wanting it printed.
  creditHandle: integer('credit_handle', { mode: 'boolean' }).default(false),
  // Free-text note the contributor leaves with their batch — context about the
  // photos, not a caption on any one of them. Admin-only, like contact.
  note: text('note'),
  createdAt,
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' })
}, table => [
  // Redeem looks up by hash within a link, so two links can never collide.
  unique('collection_contributors_link_code_unq').on(table.linkId, table.codeHash),
  index('collection_contributors_code_idx').on(table.codeHash)
])

// The pool. A row here *is* a photo an admin can use; deleting the row is how
// junk leaves. There is deliberately no review status — nothing here is public,
// so there is nothing to moderate for. `publishedTo` records where a photo has
// been used ('album:<id>', 'external'), not what state it is in.
export const collectionSubmissions = sqliteTable('collection_submissions', {
  id: text('id').primaryKey(), // uuid
  linkId: text('link_id')
    .notNull()
    .references(() => collectionLinks.id, { onDelete: 'cascade' }),
  contributorId: text('contributor_id')
    .notNull()
    .references(() => collectionContributors.id, { onDelete: 'cascade' }),
  caption: text('caption'), // contributor-editable while the link is open
  r2Key: text('r2_key').notNull(),
  hash: text('hash').notNull(),
  size: integer('size').notNull().default(0),
  type: text('type').notNull(),
  // The admin's decision. Stored rather than inferred, so a review pass resumes
  // after a refresh and a reversal days later is possible.
  //   pending  — not looked at yet
  //   approved — copied into the album
  //   rejected — deliberately not used; the row stays so the call is reversible
  review: text('review', { enum: ['pending', 'approved', 'rejected'] })
    .notNull()
    .default('pending'),
  reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
  reviewedBy: integer('reviewed_by').references(() => users.id),
  // Where the approved copy lives: content-albums/<albumId>/<hash>.<ext>.
  // Membership in the album is derived by matching this against the album's
  // current cell srcs — which is what makes reordering, re-spanning, style
  // changes and manual edits in the album canvas all safe. "Approved" and
  // "currently in the album" are two facts that may legitimately differ.
  albumKey: text('album_key'),
  publishedTo: text('published_to'),
  publishedAt: integer('published_at', { mode: 'timestamp' }),
  createdAt
}, table => [
  // The pool page filters by link + decision on every load.
  index('collection_submissions_link_review_idx').on(table.linkId, table.review),
  // Content-addressed keys mean re-sending the same photo yields the same key.
  // One person's duplicate must stay one row, or it double-counts against their
  // cap; two *different* people sharing a key still get a row each.
  unique('collection_submissions_contributor_key_unq').on(table.contributorId, table.r2Key),
  index('collection_submissions_link_idx').on(table.linkId),
  index('collection_submissions_contributor_idx').on(table.contributorId),
  // r2Delete's reference check looks up by key; without this it is a full scan.
  index('collection_submissions_key_idx').on(table.r2Key)
])

// Singleton editable pages (e.g. key = 'about').
export const pages = sqliteTable('pages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  title: text('title').notNull(),
  body: text('body').notNull().default(''), // markdown
  updatedBy: integer('updated_by').references(() => users.id),
  updatedAt
})

export const contactMessages = sqliteTable('contact_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull(),
  subject: text('subject'),
  message: text('message').notNull(),
  createdAt,
  readAt: integer('read_at', { mode: 'timestamp' }),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false)
})

export const members = sqliteTable('members', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  nickname:   text('nickname').notNull(),
  photoR2Key: text('photo_r2_key'),
  schoolYear: integer('school_year'),          // 1–4
  position:   text('position'),                // null = regular member
  instagram:  text('instagram'),               // handle only, no @
  bio:        text('bio'),
  interests:  text('interests', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  featuredLinks: text('featured_links', { mode: 'json' }).$type<{ label: string, url: string }[]>().notNull().default(sql`'[]'`),
  active:     integer('active', { mode: 'boolean' }).notNull().default(true),
  sortOrder:  integer('sort_order').notNull().default(0),
  createdAt
})

// Site-wide settings (nav, socials, footer, SEO defaults) as key/JSON pairs.
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }),
  updatedAt
})

// ─── Editorial content stores ────────────────────────────────────────────────
// Slug-keyed editorial content (Lego-grid albums, block-based posts) managed by
// albumStore / postStore. Separate from the relational `albums` / `posts` tables
// above, which model the photo-gallery domain (integer ids, R2 photos, FKs).

// Lego-grid albums seeded from content/albums/*.md.
export const contentAlbums = sqliteTable('content_albums', {
  id: text('id').primaryKey(),
  // Human-readable URL slug. Decoupled from `id` (which is the immutable R2
  // folder key) so albums can be renamed without moving any stored objects.
  slug: text('slug').notNull().unique().default(''),
  title: text('title').notNull(),
  category: text('category').notNull(),
  date: text('date').notNull(),
  dateEnd: text('date_end'),
  published: text('published').notNull(),
  visibility: text('visibility').$type<ContentStatus>().notNull().default('public'),
  location: text('location'),
  excerpt: text('excerpt').notNull(),
  style: text('style').$type<AlbumStyle>().notNull(),
  dark: integer('dark', { mode: 'boolean' }).notNull().default(false),
  placement: text('placement').$type<Placement>().notNull(),
  coverSrc: text('cover_src').notNull().default(''),
  // Derived from `rows` on every write (see albumStore.writeAlbum). List views
  // need only a cover and a photo count, and reading `rows_json` for 139 albums
  // pulled ~3MB out of D1 per request; these two columns let the list queries
  // skip the JSON blob entirely.
  autoCoverSrc: text('auto_cover_src').notNull().default(''),
  photoCount: integer('photo_count').notNull().default(0),
  rows: text('rows_json', { mode: 'json' }).$type<AlbumRow[]>().notNull().default(sql`'[]'`),
  textDefaults: text('text_defaults_json', { mode: 'json' }).$type<{ align?: TextAlign, font?: TextFont }>(),
  createdAt,
  updatedAt
})

// Block-based editorial posts.
export const contentPosts = sqliteTable('content_posts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  tag: text('tag').notNull(),
  date: text('date').notNull(),
  published: text('published').notNull(),
  visibility: text('visibility').$type<ContentStatus>().notNull().default('public'),
  image: text('image').notNull(),
  excerpt: text('excerpt').notNull(),
  blocks: text('body', { mode: 'json' }).$type<PostBlock[]>().notNull().default(sql`'[]'`),
  heroStyle: text('hero_style').$type<HeroStyle>().notNull().default('standard'),
  author: text('author').notNull().default(''),
  authorBio: text('author_bio').notNull().default(''),
  authorAvatar: text('author_avatar').notNull().default(''),
  createdBy: integer('created_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
  createdAt,
  updatedAt
})

export const adminAuditLogs = sqliteTable('admin_audit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  actorId: integer('actor_id'),
  actorEmail: text('actor_email').notNull(),
  actorName: text('actor_name'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  entityTitle: text('entity_title'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
  createdAt
})

// Shared by the admin uploader and the public contribute page. `kind` says which
// owns a session, and exactly one of actorId / contributorId is set — the
// endpoints for each kind check their own field and never the other's.
export const uploadSessions = sqliteTable('upload_sessions', {
  id: text('id').primaryKey(),
  kind: text('kind', { enum: ['admin', 'contribution', 'competition'] }).notNull().default('admin'),
  // Stays NOT NULL so this table can be migrated with plain ADD COLUMNs.
  // Dropping the constraint would force SQLite to rebuild the table, and the
  // generated rebuild wraps DROP TABLE in `PRAGMA foreign_keys=OFF` — a pragma
  // that does not survive into the next statement when each one is its own D1
  // request, so the DROP would cascade-wipe upload_session_items and a failed
  // pragma would half-apply the migration. Contribution sessions store 0, which
  // no autoincrement user id can ever be.
  actorId: integer('actor_id').notNull(),
  contributorId: text('contributor_id'), // set when kind = 'contribution' (contributor id) or 'competition' (participant id)
  prefix: text('prefix').notNull(),
  createdAt,
  updatedAt
})

export const uploadSessionItems = sqliteTable('upload_session_items', {
  sessionId: text('session_id')
    .notNull()
    .references(() => uploadSessions.id, { onDelete: 'cascade' }),
  id: text('id').notNull(),
  position: integer('position').notNull().default(0),
  name: text('name').notNull(),
  hash: text('hash').notNull(),
  ext: text('ext').notNull(),
  r2Key: text('r2_key').notNull(),
  size: integer('size').notNull().default(0),
  type: text('type').notNull(),
  status: text('status').notNull(),
  error: text('error')
}, table => [
  primaryKey({ columns: [table.sessionId, table.id] }),
  index('upload_session_items_session_idx').on(table.sessionId)
])

export const r2DeleteSessions = sqliteTable('r2_delete_sessions', {
  id: text('id').primaryKey(),
  actorId: integer('actor_id').notNull(),
  force: integer('force', { mode: 'boolean' }).notNull().default(false),
  createdAt,
  updatedAt
})

export const r2DeleteSessionItems = sqliteTable('r2_delete_session_items', {
  sessionId: text('session_id')
    .notNull()
    .references(() => r2DeleteSessions.id, { onDelete: 'cascade' }),
  key: text('object_key').notNull(),
  position: integer('position').notNull().default(0),
  status: text('status').notNull(),
  referenced: integer('referenced', { mode: 'boolean' }).notNull().default(false),
  error: text('error')
}, table => [
  primaryKey({ columns: [table.sessionId, table.key] }),
  index('r2_delete_session_items_session_idx').on(table.sessionId)
])

// Soft-delete "trash can" for R2 images. A row here means the object has been
// removed from active use (its live references are scrubbed) but the underlying
// R2 object is kept in place, so it can be restored or purged later. The admin
// inventory hides any key present in this table; the trash view lists them.
export const r2Trash = sqliteTable('r2_trash', {
  key: text('object_key').primaryKey(),
  contentType: text('content_type'),
  size: integer('size'),
  // Whether the image was still referenced by a live surface when trashed
  // (i.e. it was a forced delete whose references we scrubbed).
  referenced: integer('referenced', { mode: 'boolean' }).notNull().default(false),
  // Snapshot of which reference kinds pointed at it, for the trash UI/audit.
  references: text('references_json', { mode: 'json' }).$type<Record<string, boolean>>(),
  deletedBy: integer('deleted_by'),
  deletedByEmail: text('deleted_by_email'),
  deletedByName: text('deleted_by_name'),
  deletedAt: integer('deleted_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`)
}, table => [
  index('r2_trash_deleted_at_idx').on(table.deletedAt)
])

// Index of every object in the R2 bucket: one row per key, kept in step with
// R2 by the helpers in server/utils/r2Objects.ts. READ THAT FILE'S HEADER
// before touching R2 — any code that puts, copies or deletes an object must go
// through those helpers, or this table (and the storage/cost numbers built on
// it) drifts from what Cloudflare actually bills.
export const r2Objects = sqliteTable('r2_objects', {
  key: text('object_key').primaryKey(),
  // Top-level folder ('content-albums', 'members', …; '(root)' for none).
  // Stored rather than derived so per-folder totals are one indexed GROUP BY.
  folder: text('folder').notNull(),
  size: integer('size').notNull().default(0),
  contentType: text('content_type'),
  uploadedAt: integer('uploaded_at', { mode: 'timestamp_ms' }).notNull(),
  // Upload-queue order stamp (the object's `seq` custom metadata), falling
  // back to uploadedAt. Same value the admin R2 inventory sorts by.
  orderAt: integer('order_at').notNull().default(0)
}, table => [
  index('r2_objects_folder_idx').on(table.folder),
  index('r2_objects_size_idx').on(table.size)
])

// ── Photo competitions ──────────────────────────────────────────────────────
// Attendees upload entries, then attendees and/or judges vote on them; the
// tally drives a ranked results page and a presenter-mode reveal. Separate from
// photo collections on purpose: a collection is an admin-only pool, whereas a
// competition's entries are shown to every voter.
//
// Entry objects live under contributions/competitions/… so the existing
// PRIVATE_R2_PREFIX gate keeps them off /images/ — voters see them through
// /api/compete/[id]/entries/[entryId]/image, which checks the phase first.

export const competitions = sqliteTable('competitions', {
  id: text('id').primaryKey(), // url-safe random token, part of the public URL
  title: text('title').notNull(),
  description: text('description'),
  // draft       — hidden from everyone but admins
  // submissions — joining + uploading open, gallery shows only your own entries
  // voting      — uploads closed, gallery + votes open
  // closed      — votes frozen, results not yet public
  // results     — ranked results + reveal page are public
  status: text('status', { enum: ['draft', 'submissions', 'voting', 'closed', 'results'] })
    .notNull()
    .default('draft'),
  // roster — only people on the imported attendee list, via phone + accessCode
  // open   — anyone with the link; identity is a cookie + claim code
  accessMode: text('access_mode', { enum: ['roster', 'open'] }).notNull().default('roster'),
  // Shared event code attendees type alongside their phone in roster mode.
  // Stored plain: the admin has to read it out at the event, and on its own it
  // grants nothing without a phone number that is on the roster.
  accessCode: text('access_code'),
  // Who decides: attendee votes, judge votes, or both (weighted).
  scoring: text('scoring', { enum: ['public', 'judges', 'both'] }).notNull().default('public'),
  publicWeight: integer('public_weight').notNull().default(1),
  judgeWeight: integer('judge_weight').notNull().default(1),
  maxEntriesPerPerson: integer('max_entries_per_person').notNull().default(3),
  votesPerPerson: integer('votes_per_person').notNull().default(2),
  votesPerJudge: integer('votes_per_judge').notNull().default(5),
  maxBytesPerPhoto: integer('max_bytes_per_photo').notNull().default(15 * 1024 * 1024),
  createdBy: integer('created_by').references(() => users.id),
  createdAt,
  updatedAt
})

// Everyone who can act in a competition. Attendees come from the roster import
// (roster mode) or are created on first visit (open mode); judges are added by
// an admin and sign in with their own code.
export const competitionParticipants = sqliteTable('competition_participants', {
  id: text('id').primaryKey(), // uuid
  competitionId: text('competition_id')
    .notNull()
    .references(() => competitions.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['attendee', 'judge'] }).notNull().default('attendee'),
  name: text('name').notNull(),
  // Digits only (see normalizePhone). Roster attendees only.
  phone: text('phone'),
  groupName: text('group_name'),
  // SHA-256 of a Crockford claim code: open-mode attendees (to move devices)
  // and judges (their sign-in credential).
  codeHash: text('code_hash'),
  // Judges' code in plain text, so an admin can re-read it to hand out. Null
  // for attendees, whose code is only ever held by themselves.
  judgeCode: text('judge_code'),
  createdAt,
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' })
}, table => [
  unique('competition_participants_phone_unq').on(table.competitionId, table.phone),
  index('competition_participants_competition_idx').on(table.competitionId),
  index('competition_participants_code_idx').on(table.competitionId, table.codeHash)
])

export const competitionEntries = sqliteTable('competition_entries', {
  id: text('id').primaryKey(), // uuid
  competitionId: text('competition_id')
    .notNull()
    .references(() => competitions.id, { onDelete: 'cascade' }),
  participantId: text('participant_id')
    .notNull()
    .references(() => competitionParticipants.id, { onDelete: 'cascade' }),
  title: text('title'),
  r2Key: text('r2_key').notNull(),
  hash: text('hash').notNull(),
  size: integer('size').notNull().default(0),
  type: text('type').notNull(),
  createdAt
}, table => [
  // Re-sending the same photo is one entry, not two against the cap.
  unique('competition_entries_participant_key_unq').on(table.participantId, table.r2Key),
  index('competition_entries_competition_idx').on(table.competitionId),
  index('competition_entries_key_idx').on(table.r2Key)
])

// One row per (voter, entry). The per-person vote cap is enforced by the
// conditional INSERT in server/utils/competition.ts, not by a constraint.
export const competitionVotes = sqliteTable('competition_votes', {
  competitionId: text('competition_id')
    .notNull()
    .references(() => competitions.id, { onDelete: 'cascade' }),
  entryId: text('entry_id')
    .notNull()
    .references(() => competitionEntries.id, { onDelete: 'cascade' }),
  participantId: text('participant_id')
    .notNull()
    .references(() => competitionParticipants.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['attendee', 'judge'] }).notNull(),
  createdAt
}, table => [
  primaryKey({ columns: [table.participantId, table.entryId] }),
  index('competition_votes_competition_idx').on(table.competitionId),
  index('competition_votes_entry_idx').on(table.entryId)
])
