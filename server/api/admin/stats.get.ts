import { count, inArray } from 'drizzle-orm'

// Counts for the admin dashboard cards. The dashboard used to fetch eight full
// list endpoints just to read `.length` off each — including the album list,
// which meant pulling every album's `rows` JSON (~3MB) to render one number.
// These are count(*) queries plus one settings read.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const [albums, posts, [events], [members], [collections], [competitions], imageSettings] = await Promise.all([
    // Albums and posts go through their stores so the seed-on-first-read and the
    // mock-data filter behave the same as on the list endpoints they link to.
    albumStore.count(),
    postStore.count(),
    db.select({ c: count() }).from(schema.events),
    db.select({ c: count() }).from(schema.members),
    db.select({ c: count() }).from(schema.collectionLinks),
    db.select({ c: count() }).from(schema.competitions),
    db
      .select({ key: schema.settings.key, value: schema.settings.value })
      .from(schema.settings)
      .where(inArray(schema.settings.key, ['heroImages', 'historyImage', 'clubroomImage']))
  ])

  const setting = (key: string) => imageSettings.find(row => row.key === key)?.value
  const historyImage = decodeManagedImage(setting('historyImage'))
  const clubroomImage = decodeManagedImage(setting('clubroomImage'))

  return {
    albums,
    posts,
    events: events?.c ?? 0,
    members: members?.c ?? 0,
    collections: collections?.c ?? 0,
    competitions: competitions?.c ?? 0,
    heroImages: decodeHeroImages(setting('heroImages')).length,
    // History + Clubroom share one page; the card counts how many of the two
    // slots currently have an image set.
    landingImages: (historyImage ? 1 : 0) + (clubroomImage ? 1 : 0)
  }
})
