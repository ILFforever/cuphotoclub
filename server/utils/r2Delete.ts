import { eq, inArray } from 'drizzle-orm'

// D1 allows at most 100 bound parameters per query. Every inArray() below binds
// one parameter per value, and callers may pass up to 250 keys, so we chunk any
// caller-supplied list into groups small enough to stay under the cap (with
// headroom for the set/where extras on update statements).
const D1_INARRAY_CHUNK = 90

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function selectChunked<R>(keys: string[], run: (chunk: string[]) => Promise<R[]>): Promise<R[]> {
  const results = await Promise.all(chunk(keys, D1_INARRAY_CHUNK).map(run))
  return results.flat()
}

// How long folder membership alone (content-albums/<id>/...) keeps an image
// listed as referenced in the R2 admin inventory after upload — long enough to
// cover an editing session, so in-progress uploads don't show up in the
// "unreferenced" cleanup view while their author is still composing. Display
// only: it never blocks deletion.
export const R2_ALBUM_FOLDER_GRACE_MS = 24 * 60 * 60 * 1000

export interface R2DeleteReferenceInfo {
  galleryPhoto: boolean
  post: boolean
  activity: boolean
  member: boolean
  hero: boolean
  history: boolean
  clubroom: boolean
  editorialAlbum: boolean
  // A photo sitting in an event's submission pool. Nothing else in this scan
  // knows about the pool, so without this an admin tidying /admin/r2-images
  // deletes the object out from under a submission and the pool shows a hole.
  submission: boolean
  // The cover image on a photo collection's share link. Same reasoning as
  // `submission`: it can also be picked from the shared library, so the object
  // may be in use somewhere else entirely.
  collectionCover: boolean
  // An entry in a photo competition. Lives under contributions/ like the pool,
  // and nothing else in this scan knows about it either.
  competitionEntry: boolean
}

export function emptyR2DeleteReferenceInfo(): R2DeleteReferenceInfo {
  return {
    galleryPhoto: false,
    post: false,
    activity: false,
    member: false,
    hero: false,
    history: false,
    clubroom: false,
    editorialAlbum: false,
    submission: false,
    collectionCover: false,
    competitionEntry: false
  }
}

export function isR2DeleteReferenced(info: R2DeleteReferenceInfo) {
  return info.galleryPhoto || info.post || info.activity || info.member || info.hero || info.history || info.clubroom || info.editorialAlbum || info.submission || info.collectionCover || info.competitionEntry
}

export async function getR2DeleteReferences(keys: string[]) {
  const normalizedKeys = [...new Set(keys.map(key => normalizeR2Key(key)).filter((key): key is string => !!key))]
  const keySet = new Set(normalizedKeys)
  const references = new Map<string, R2DeleteReferenceInfo>()
  const ensure = (key: string) => {
    const existing = references.get(key)
    if (existing) return existing
    const created = emptyR2DeleteReferenceInfo()
    references.set(key, created)
    return created
  }

  if (!normalizedKeys.length) return references

  const [
    galleryPhotos,
    posts,
    activities,
    activityGalleries,
    members,
    heroRows,
    historyRows,
    clubroomRows,
    editorialAlbums,
    submissions,
    collectionCovers,
    competitionEntries
  ] = await Promise.all([
    selectChunked(normalizedKeys, c => db.select({ r2Key: schema.photos.r2Key }).from(schema.photos).where(inArray(schema.photos.r2Key, c))),
    selectChunked(normalizedKeys, c => db.select({ coverR2Key: schema.posts.coverR2Key }).from(schema.posts).where(inArray(schema.posts.coverR2Key, c))),
    selectChunked(normalizedKeys, c => db.select({ coverR2Key: schema.events.coverR2Key }).from(schema.events).where(inArray(schema.events.coverR2Key, c))),
    db.select({ galleryR2Keys: schema.events.galleryR2Keys }).from(schema.events),
    selectChunked(normalizedKeys, c => db.select({ photoR2Key: schema.members.photoR2Key }).from(schema.members).where(inArray(schema.members.photoR2Key, c))),
    db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, 'heroImages')),
    db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, 'historyImage')),
    db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, 'clubroomImage')),
    albumStore.list(),
    selectChunked(normalizedKeys, c => db.select({ r2Key: schema.collectionSubmissions.r2Key }).from(schema.collectionSubmissions).where(inArray(schema.collectionSubmissions.r2Key, c))),
    selectChunked(normalizedKeys, c => db.select({ coverR2Key: schema.collectionLinks.coverR2Key }).from(schema.collectionLinks).where(inArray(schema.collectionLinks.coverR2Key, c))),
    selectChunked(normalizedKeys, c => db.select({ r2Key: schema.competitionEntries.r2Key }).from(schema.competitionEntries).where(inArray(schema.competitionEntries.r2Key, c)))
  ])

  for (const item of competitionEntries) {
    const key = normalizeR2Key(item.r2Key)
    if (key) ensure(key).competitionEntry = true
  }

  for (const item of submissions) {
    const key = normalizeR2Key(item.r2Key)
    if (key) ensure(key).submission = true
  }

  for (const item of collectionCovers) {
    const key = normalizeR2Key(item.coverR2Key)
    if (key) ensure(key).collectionCover = true
  }

  for (const item of galleryPhotos) {
    const key = normalizeR2Key(item.r2Key)
    if (key) ensure(key).galleryPhoto = true
  }
  for (const item of posts) {
    const key = normalizeR2Key(item.coverR2Key)
    if (key) ensure(key).post = true
  }
  for (const item of activities) {
    const key = normalizeR2Key(item.coverR2Key)
    if (key) ensure(key).activity = true
  }
  for (const item of activityGalleries) {
    for (const value of item.galleryR2Keys) {
      const key = normalizeR2Key(value)
      if (key && keySet.has(key)) ensure(key).activity = true
    }
  }
  for (const item of members) {
    const key = normalizeR2Key(item.photoR2Key)
    if (key) ensure(key).member = true
  }

  for (const item of decodeHeroImages(heroRows[0]?.value)) {
    const key = normalizeR2Key(item)
    if (key && keySet.has(key)) ensure(key).hero = true
  }

  const historyKey = normalizeR2Key(decodeManagedImage(historyRows[0]?.value))
  if (historyKey && keySet.has(historyKey)) ensure(historyKey).history = true

  const clubroomKey = normalizeR2Key(decodeManagedImage(clubroomRows[0]?.value))
  if (clubroomKey && keySet.has(clubroomKey)) ensure(clubroomKey).clubroom = true

  for (const album of editorialAlbums) {
    const coverKey = normalizeR2Key(album.coverSrc)
    if (coverKey && keySet.has(coverKey)) ensure(coverKey).editorialAlbum = true
    for (const cell of album.rows.flatMap(row => row.cells)) {
      if (cell.type !== 'image') continue
      const key = normalizeR2Key(cell.src)
      if (key && keySet.has(key)) ensure(key).editorialAlbum = true
    }
  }

  return references
}

export async function scrubR2DeleteReferences(keys: string[]) {
  const normalizedKeys = [...new Set(keys.map(key => normalizeR2Key(key)).filter((key): key is string => !!key))]
  const keySet = new Set(normalizedKeys)
  if (!normalizedKeys.length) return

  const [galleryPhotos, activityGalleries, heroRows, historyRows, clubroomRows, editorialAlbums] = await Promise.all([
    selectChunked(normalizedKeys, c => db.select({ id: schema.photos.id }).from(schema.photos).where(inArray(schema.photos.r2Key, c))),
    db.select({ id: schema.events.id, galleryR2Keys: schema.events.galleryR2Keys }).from(schema.events),
    db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, 'heroImages')),
    db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, 'historyImage')),
    db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, 'clubroomImage')),
    albumStore.list()
  ])

  const doomedIds = galleryPhotos.map(photo => photo.id)
  if (doomedIds.length) {
    for (const c of chunk(doomedIds, D1_INARRAY_CHUNK)) {
      await db.update(schema.albums)
        .set({ coverPhotoId: null })
        .where(inArray(schema.albums.coverPhotoId, c))
    }
    for (const c of chunk(doomedIds, D1_INARRAY_CHUNK)) {
      await db.delete(schema.photos).where(inArray(schema.photos.id, c))
    }
  }

  await Promise.all([
    ...chunk(normalizedKeys, D1_INARRAY_CHUNK).map(c => db.delete(schema.collectionSubmissions).where(inArray(schema.collectionSubmissions.r2Key, c))),
    ...chunk(normalizedKeys, D1_INARRAY_CHUNK).map(c => db.delete(schema.competitionEntries).where(inArray(schema.competitionEntries.r2Key, c))),
    ...chunk(normalizedKeys, D1_INARRAY_CHUNK).map(c => db.update(schema.posts).set({ coverR2Key: null }).where(inArray(schema.posts.coverR2Key, c))),
    ...chunk(normalizedKeys, D1_INARRAY_CHUNK).map(c => db.update(schema.events).set({ coverR2Key: null }).where(inArray(schema.events.coverR2Key, c))),
    ...chunk(normalizedKeys, D1_INARRAY_CHUNK).map(c => db.update(schema.members).set({ photoR2Key: null }).where(inArray(schema.members.photoR2Key, c)))
  ])

  await Promise.all(activityGalleries.map((item) => {
    const next = item.galleryR2Keys.filter(key => !keySet.has(normalizeR2Key(key) || ''))
    if (next.length === item.galleryR2Keys.length) return Promise.resolve()
    return db.update(schema.events).set({ galleryR2Keys: next }).where(eq(schema.events.id, item.id))
  }))

  const heroImages = decodeHeroImages(heroRows[0]?.value)
  if (heroImages.some(item => keySet.has(normalizeR2Key(item) || ''))) {
    await db.update(schema.settings)
      .set({ value: heroImages.filter(item => !keySet.has(normalizeR2Key(item) || '')), updatedAt: new Date() })
      .where(eq(schema.settings.key, 'heroImages'))
  }

  const historyImage = normalizeR2Key(decodeManagedImage(historyRows[0]?.value))
  if (historyImage && keySet.has(historyImage)) {
    await db.update(schema.settings)
      .set({ value: '', updatedAt: new Date() })
      .where(eq(schema.settings.key, 'historyImage'))
  }

  const clubroomImage = normalizeR2Key(decodeManagedImage(clubroomRows[0]?.value))
  if (clubroomImage && keySet.has(clubroomImage)) {
    await db.update(schema.settings)
      .set({ value: '', updatedAt: new Date() })
      .where(eq(schema.settings.key, 'clubroomImage'))
  }

  for (const album of editorialAlbums) {
    const coverHit = keySet.has(normalizeR2Key(album.coverSrc) || '')
    const cellHit = album.rows.some(row =>
      row.cells.some(cell => cell.type === 'image' && keySet.has(normalizeR2Key(cell.src) || '')))
    if (!coverHit && !cellHit) continue

    await albumStore.update(album.id, {
      ...album,
      coverSrc: coverHit ? '' : album.coverSrc,
      rows: album.rows.map(row => ({
        ...row,
        cells: row.cells.map(cell =>
          cell.type === 'image' && keySet.has(normalizeR2Key(cell.src) || '')
            ? { ...cell, src: '' }
            : cell)
      }))
    })
  }
}
