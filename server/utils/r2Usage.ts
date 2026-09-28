import { and, desc, eq, gte, lt, sql } from 'drizzle-orm'
import { PRIVATE_R2_PREFIX } from '~~/shared/r2Prefixes'

// "What points at this R2 object?" — the cross-reference behind the admin R2
// inventory and the largest-files view. Both pages offer deletion based on it,
// so a missed reference here is what makes an in-use photo look like an
// orphan. Keep every surface that can hold an image key in buildR2UsageMaps.

export interface ImageUsage {
  kind: 'gallery' | 'hero' | 'history' | 'clubroom' | 'post-cover' | 'event-cover' | 'event-gallery' | 'member-photo' | 'editorial-album' | 'contribution' | 'collection-cover' | 'competition-entry'
  label: string
  href?: string
  role?: string
}

function addUsage(map: Map<string, ImageUsage[]>, key: string | null | undefined, usage: ImageUsage) {
  if (!key) return
  const normalized = normalizeR2Key(key)
  if (!normalized) return
  const items = map.get(normalized) ?? []
  items.push(usage)
  map.set(normalized, items)
}

interface EditorialAlbumRef {
  id: string
  title: string
  coverSrc: string
  srcs: string[]
}

// The inventory only needs each album's id, title, cover and the image srcs
// buried in its layout rows. albumStore.list() would pull and JSON.parse every
// album's full rows_json — the same multi-second cost that made /api/photogrid
// time out. Push the extraction into SQLite instead (json_each, the same
// technique migration 0022 uses for photo_count) and return bare srcs.
async function listEditorialAlbumRefs(): Promise<EditorialAlbumRef[]> {
  const rows = await db.all<{ id: string, title: string, cover_src: string, srcs: string | null }>(sql`
    SELECT a.id,
           a.title,
           a.cover_src,
           (
             SELECT group_concat(c.value ->> '$.src', char(10))
             FROM json_each(a.rows_json) AS r,
                  json_each(r.value -> '$.cells') AS c
             WHERE c.value ->> '$.type' = 'image'
               AND trim(coalesce(c.value ->> '$.src', '')) <> ''
           ) AS srcs
    FROM content_albums AS a
  `)
  return rows.map(row => ({
    id: row.id,
    title: row.title,
    coverSrc: row.cover_src ?? '',
    srcs: row.srcs ? row.srcs.split('\n') : []
  }))
}

// The key range a view could possibly show a submission in, or null if it
// cannot show one at all. Every participant upload lives under
// PRIVATE_R2_PREFIX, so a view scoped to any other prefix (content-albums/,
// members/, …) needs none of these rows and skips the query outright.
function submissionKeyPrefix(prefix?: string): string | null {
  if (!prefix) return PRIVATE_R2_PREFIX
  if (prefix.startsWith(PRIVATE_R2_PREFIX)) return prefix
  // A partially typed prefix ('contrib') still narrows to the whole private tree.
  if (PRIVATE_R2_PREFIX.startsWith(prefix)) return PRIVATE_R2_PREFIX
  return null
}

// Participant uploads are referenced by their submission row, never by an
// album: approving COPIES the object to content-albums/<id>/<hash>.<ext>
// (collectionSubmissions.albumKey), so an album only ever points at the copy.
// Without this every original — including those of published photos — reads as
// unreferenced, and these pages offer bulk delete on that signal.
//
// Deliberately unlimited: a truncated result would mark real originals
// unreferenced, which is the exact deletion hazard the lookup exists to close.
// The bound is the key range instead, and the label is joined in JS from the
// (tiny) links table rather than in SQL, so a row stays three narrow columns
// instead of repeating a label string per submission.
async function listSubmissionRefs(prefix?: string) {
  const keyPrefix = submissionKeyPrefix(prefix)
  if (!keyPrefix) return []

  return db
    .select({
      r2Key: schema.collectionSubmissions.r2Key,
      review: schema.collectionSubmissions.review,
      linkId: schema.collectionSubmissions.linkId
    })
    .from(schema.collectionSubmissions)
    .where(and(
      gte(schema.collectionSubmissions.r2Key, keyPrefix),
      lt(schema.collectionSubmissions.r2Key, prefixUpperBound(keyPrefix))
    ))
}

// Competition entries share the private contributions/ tree and the same
// deletion hazard as submissions, so they are bounded by the same key range.
async function listCompetitionEntryRefs(prefix?: string) {
  const keyPrefix = submissionKeyPrefix(prefix)
  if (!keyPrefix) return []

  return db
    .select({
      r2Key: schema.competitionEntries.r2Key,
      competitionId: schema.competitionEntries.competitionId
    })
    .from(schema.competitionEntries)
    .where(and(
      gte(schema.competitionEntries.r2Key, keyPrefix),
      lt(schema.competitionEntries.r2Key, prefixUpperBound(keyPrefix))
    ))
}

export interface R2UsageMaps {
  // Gallery-album photos, kept apart because the inventory counts them
  // separately from every other kind of reference.
  albumUsage: Map<string, ImageUsage[]>
  otherUsage: Map<string, ImageUsage[]>
  editorialById: Map<string, EditorialAlbumRef>
  trashedKeys: Set<string>
}

// Reads every surface that can hold an image key. `prefix` only narrows the
// submission lookup — the other tables are small enough to read whole.
export async function buildR2UsageMaps(prefix?: string): Promise<R2UsageMaps> {
  const [galleryPhotos, posts, events, members, heroRows, historyRows, clubroomRows, editorialAlbums, collectionLinkRows, submissions, competitionRows, competitionEntries, trashedKeys] = await Promise.all([
    db
      .select({
        photoId: schema.photos.id,
        r2Key: schema.photos.r2Key,
        albumId: schema.albums.id,
        albumSlug: schema.albums.slug,
        albumTitle: schema.albums.title,
        coverPhotoId: schema.albums.coverPhotoId
      })
      .from(schema.photos)
      .leftJoin(schema.albums, eq(schema.photos.albumId, schema.albums.id)),
    db.select({
      id: schema.posts.id,
      slug: schema.posts.slug,
      title: schema.posts.title,
      coverR2Key: schema.posts.coverR2Key
    }).from(schema.posts).orderBy(desc(schema.posts.createdAt)),
    db.select({
      id: schema.events.id,
      slug: schema.events.slug,
      title: schema.events.title,
      coverR2Key: schema.events.coverR2Key,
      galleryR2Keys: schema.events.galleryR2Keys
    }).from(schema.events).orderBy(desc(schema.events.createdAt)),
    db.select({
      id: schema.members.id,
      nickname: schema.members.nickname,
      photoR2Key: schema.members.photoR2Key
    }).from(schema.members).orderBy(schema.members.sortOrder),
    db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, 'heroImages')),
    db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, 'historyImage')),
    db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, 'clubroomImage')),
    listEditorialAlbumRefs(),
    db.select({
      id: schema.collectionLinks.id,
      label: schema.collectionLinks.label,
      coverR2Key: schema.collectionLinks.coverR2Key
    }).from(schema.collectionLinks),
    listSubmissionRefs(prefix),
    db.select({ id: schema.competitions.id, title: schema.competitions.title }).from(schema.competitions),
    listCompetitionEntryRefs(prefix),
    trashedKeySet()
  ])

  const albumUsage = new Map<string, ImageUsage[]>()
  const otherUsage = new Map<string, ImageUsage[]>()

  for (const row of galleryPhotos) {
    if (!row.albumId || !row.albumSlug || !row.albumTitle) continue
    addUsage(albumUsage, row.r2Key, {
      kind: 'gallery',
      label: row.albumTitle,
      href: `/admin/galleries/${row.albumId}`,
      role: row.photoId === row.coverPhotoId ? 'cover' : 'photo'
    })
  }

  for (const post of posts) {
    addUsage(otherUsage, post.coverR2Key, {
      kind: 'post-cover',
      label: post.title,
      href: `/admin/blog/${post.id}`,
      role: 'post cover'
    })
  }

  for (const item of events) {
    addUsage(otherUsage, item.coverR2Key, {
      kind: 'event-cover',
      label: item.title,
      href: `/admin/activities/${item.id}`,
      role: 'activity cover'
    })
    for (const key of item.galleryR2Keys) {
      addUsage(otherUsage, key, {
        kind: 'event-gallery',
        label: item.title,
        href: `/admin/activities/${item.id}`,
        role: 'activity gallery'
      })
    }
  }

  for (const member of members) {
    addUsage(otherUsage, member.photoR2Key, {
      kind: 'member-photo',
      label: member.nickname,
      href: '/admin/members',
      role: 'member photo'
    })
  }

  // Every state counts as referenced, not just 'approved': pending is still to
  // be looked at, and a rejected row is kept precisely so the call stays
  // reversible. Only a contributions/ blob with no row at all is an orphan.
  // A row whose link somehow went missing still counts: an inner join would
  // drop it, and dropping it here would offer the original up for deletion.
  const collectionLabelById = new Map(collectionLinkRows.map(row => [row.id, row.label]))
  for (const row of submissions) {
    addUsage(otherUsage, row.r2Key, {
      kind: 'contribution',
      label: collectionLabelById.get(row.linkId) || 'Untitled collection',
      href: `/admin/submissions/${row.linkId}`,
      role: `submission · ${row.review}`
    })
  }

  const competitionTitleById = new Map(competitionRows.map(row => [row.id, row.title]))
  for (const row of competitionEntries) {
    addUsage(otherUsage, row.r2Key, {
      kind: 'competition-entry',
      label: competitionTitleById.get(row.competitionId) || 'Untitled competition',
      href: `/admin/competitions/${row.competitionId}`,
      role: 'competition entry'
    })
  }

  // A collection's own cover, uploaded by an admin under covers/collections/.
  // Nothing else references it, so without this it reads as unreferenced —
  // same hazard as the submission originals above, on pages that offer bulk
  // delete on exactly that signal.
  for (const link of collectionLinkRows) {
    addUsage(otherUsage, link.coverR2Key, {
      kind: 'collection-cover',
      label: link.label || 'Untitled collection',
      href: `/admin/submissions/${link.id}`,
      role: 'collection cover'
    })
  }

  for (const key of decodeHeroImages(heroRows[0]?.value)) {
    addUsage(otherUsage, key, {
      kind: 'hero',
      label: 'Homepage hero',
      href: '/admin/hero-images',
      role: 'hero image'
    })
  }

  const historyImage = decodeManagedImage(historyRows[0]?.value)
  if (historyImage) {
    addUsage(otherUsage, historyImage, {
      kind: 'history',
      label: 'Our History',
      href: '/admin/history-image',
      role: 'history image'
    })
  }

  const clubroomImage = decodeManagedImage(clubroomRows[0]?.value)
  if (clubroomImage) {
    addUsage(otherUsage, clubroomImage, {
      kind: 'clubroom',
      label: 'Clubroom',
      href: '/admin/clubroom-image',
      role: 'clubroom image'
    })
  }

  for (const album of editorialAlbums) {
    addUsage(otherUsage, album.coverSrc, {
      kind: 'editorial-album',
      label: album.title,
      href: `/admin/albums/${album.id}`,
      role: 'editorial cover'
    })
    for (const src of album.srcs) {
      addUsage(otherUsage, src, {
        kind: 'editorial-album',
        label: album.title,
        href: `/admin/albums/${album.id}`,
        role: 'editorial image'
      })
    }
  }

  return {
    albumUsage,
    otherUsage,
    editorialById: new Map(editorialAlbums.map(album => [album.id, album])),
    trashedKeys
  }
}

// The references for one object. `uploadedAt` drives the folder-membership
// grace: images upload into content-albums/<id>/ the moment they're dropped on
// the canvas — before the album is saved. Recent uploads count as referenced
// by folder membership so they don't show as "unreferenced" and get cleaned up
// while the author is still composing. Older unplaced images (removed from the
// canvas) fall back to unreferenced.
export function usagesForKey(maps: R2UsageMaps, key: string, uploadedAt: Date) {
  const albums = maps.albumUsage.get(key) ?? []
  const usages = [...(maps.otherUsage.get(key) ?? [])]
  const folderId = key.match(/^content-albums\/([^/]+)\//)?.[1]
  const folderAlbum = folderId ? maps.editorialById.get(folderId) : undefined
  const uploadedRecently = uploadedAt.getTime() > Date.now() - R2_ALBUM_FOLDER_GRACE_MS
  if (folderAlbum && uploadedRecently && !usages.some(usage => usage.kind === 'editorial-album')) {
    usages.push({
      kind: 'editorial-album',
      label: folderAlbum.title || 'Album in progress',
      href: `/admin/albums/${folderAlbum.id}`,
      role: 'album folder'
    })
  }
  return { albums, usages }
}
