import { and, eq, like, or } from 'drizzle-orm'

// Light public search across published albums and events.
export default defineEventHandler(async (event) => {
  if (!(await rateLimit(`search:${clientIp(event)}`, 30, 60 * 1000))) {
    throw createError({ statusCode: 429, message: 'ค้นหาบ่อยเกินไป กรุณาลองใหม่' })
  }

  const q = String(getQuery(event).q || '').trim()
  if (!q) return { query: '', albums: [], events: [] }
  const term = `%${q}%`

  const albums = await db
    .select({ slug: schema.albums.slug, title: schema.albums.title, eventDate: schema.albums.eventDate })
    .from(schema.albums)
    .where(and(eq(schema.albums.status, 'published'), or(like(schema.albums.title, term), like(schema.albums.description, term))))
    .limit(12)

  const events = await db
    .select({ slug: schema.events.slug, title: schema.events.title, summary: schema.events.summary, eventDate: schema.events.eventDate })
    .from(schema.events)
    .where(and(eq(schema.events.status, 'published'), or(like(schema.events.title, term), like(schema.events.summary, term))))
    .limit(12)

  return { query: q, albums, events }
})
