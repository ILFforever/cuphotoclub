import { alias } from 'drizzle-orm/sqlite-core'
import { and, asc, desc, eq, sql } from 'drizzle-orm'

// Aggregated data for the home page: featured albums and recent events.
export default defineEventHandler(async () => {
  const cover = alias(schema.photos, 'cover')

  // The four sources are independent — fetch them in parallel (each await in
  // sequence would add a full D1/KV round trip to the response time).
  const albumRowsQuery = db
    .select({
      id: schema.albums.id,
      slug: schema.albums.slug,
      title: schema.albums.title,
      eventDate: schema.albums.eventDate,
      explicitCoverKey: cover.r2Key,
      firstPhotoKey: sql<string | null>`(select r2_key from photos where photos.album_id = albums.id order by photos.sort_order, photos.id limit 1)`,
      photoCount: sql<number>`(select count(*) from photos where photos.album_id = albums.id)`
    })
    .from(schema.albums)
    .leftJoin(cover, eq(cover.id, schema.albums.coverPhotoId))
    .where(eq(schema.albums.status, 'published'))
    .orderBy(desc(schema.albums.eventDate), desc(schema.albums.createdAt))
    .limit(10)

  // The home page presents these as what's coming next, so a finished event must
  // never appear. Keep anything whose last day is today or later — endDate covers
  // multi-day events that are already under way — and order soonest-first rather
  // than newest-first. Undated "TBA" events can't be sequenced, so they live on
  // /activities only. Timestamps are unixepoch seconds, matching the column type.
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const todayEpoch = Math.floor(todayStart.getTime() / 1000)

  const eventsQuery = db
    .select({
      id: schema.events.id,
      slug: schema.events.slug,
      title: schema.events.title,
      summary: schema.events.summary,
      coverR2Key: schema.events.coverR2Key,
      eventDate: schema.events.eventDate,
      endDate: schema.events.endDate,
      location: schema.events.location
    })
    .from(schema.events)
    .where(and(
      eq(schema.events.status, 'published'),
      sql`coalesce(${schema.events.endDate}, ${schema.events.eventDate}) >= ${todayEpoch}`
    ))
    .orderBy(asc(schema.events.eventDate), asc(schema.events.createdAt))
    .limit(3)

  const [albumRows, contentAlbumList, events] = await Promise.all([
    albumRowsQuery,
    // Metadata only: the feed needs a cover and a photo count, both of which are
    // stored as columns. Reading every album's `rows` JSON for that was ~3MB of
    // D1 traffic on a page that renders a handful of cards.
    albumStore.listMeta({ visibility: ['public'] }),
    eventsQuery
  ])

  // Match the public activities endpoint in an empty local database so the
  // landing activity strip can be reviewed without seeding D1. Production
  // always uses the published database rows above.
  const landingEvents = import.meta.dev && !events.length
    ? devMockEvents()
        // Same upcoming-only rule as the query above, so dev exercises the real
        // shape instead of whichever three happen to come first in the array.
        .filter((event) => {
          const lastDay = event.endDate ?? event.eventDate
          return lastDay ? lastDay.getTime() >= todayStart.getTime() : false
        })
        .sort((a, b) => (a.eventDate?.getTime() ?? 0) - (b.eventDate?.getTime() ?? 0))
        .slice(0, 3)
        .map(({ body, publishedAt, registerUrl, ...event }) => event)
    : events

  // "Lego-grid" albums built in the canvas editor (schema.contentAlbums, via albumStore) are a
  // separate system from the relational galleries above (schema.albums/photos) — merge both so
  // the home feed reflects everything admins actually publish. See CLAUDE.md / schema.ts comments.
  const contentAlbums = contentAlbumList.items
    .map(a => ({
      id: 0,
      slug: a.id,
      title: a.title,
      eventDate: a.published || a.date,
      // listMeta already resolves the cover (explicit, else first image).
      coverKey: a.coverSrc || null,
      photoCount: a.photoCount,
      source: 'content' as const
    }))

  const galleryAlbums = albumRows.map(({ explicitCoverKey, firstPhotoKey, eventDate, ...a }) => ({
    ...a,
    // Relational albums store eventDate as a Date; content albums use ISO strings.
    // Normalize to string so the merged sort below can localeCompare safely.
    eventDate: eventDate instanceof Date ? eventDate.toISOString().slice(0, 10) : eventDate,
    coverKey: explicitCoverKey ?? firstPhotoKey ?? null,
    source: 'gallery' as const
  }))

  const albums = [...galleryAlbums, ...contentAlbums]
    .sort((a, b) => (b.eventDate ?? '').localeCompare(a.eventDate ?? ''))
    .slice(0, 10)

  return {
    albums,
    events: landingEvents
  }
})
