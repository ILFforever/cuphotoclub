import type { H3Event } from 'h3'
import { and, asc, eq, inArray, lt } from 'drizzle-orm'

export type UploadSessionItemStatus = 'pending' | 'exists' | 'uploaded' | 'failed'

export interface UploadSessionItem {
  id: string
  name: string
  hash: string
  ext: string
  key: string
  size: number
  type: string
  status: UploadSessionItemStatus
  error?: string
}

export interface UploadSession {
  id: string
  // Which side owns this session. Exactly one of actorId / contributorId is set;
  // each side's endpoints check their own field and never the other's, so an
  // admin route can never act on a contributor's session or vice versa.
  kind: 'admin' | 'contribution' | 'competition'
  // 0 for contributions. The column stays NOT NULL so the table never needs a
  // SQLite rebuild to migrate; no autoincrement user id is ever 0.
  actorId: number
  contributorId: string | null
  prefix: string
  createdAt: string
  updatedAt: string
  items: UploadSessionItem[]
}

const UPLOAD_SESSION_TTL_MS = 6 * 60 * 60 * 1000

export function uploadSessionKey(id: string) {
  return `admin-upload-session:${id}`
}

export function decodeUploadItemId(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export async function mapUploadSessionItems<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(Math.max(concurrency, 1), items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await worker(items[index]!, index)
    }
  })

  await Promise.all(workers)
  return results
}

export async function getUploadSession(id: string) {
  const [session] = await db
    .select()
    .from(schema.uploadSessions)
    .where(eq(schema.uploadSessions.id, id))
    .limit(1)

  if (!session) return null

  const rows = await db
    .select()
    .from(schema.uploadSessionItems)
    .where(eq(schema.uploadSessionItems.sessionId, id))
    .orderBy(asc(schema.uploadSessionItems.position), asc(schema.uploadSessionItems.id))

  return {
    id: session.id,
    kind: session.kind,
    actorId: session.actorId,
    contributorId: session.contributorId,
    prefix: session.prefix,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    items: rows.map(row => ({
      id: row.id,
      name: row.name,
      hash: row.hash,
      ext: row.ext,
      key: row.r2Key,
      size: row.size,
      type: row.type,
      status: row.status as UploadSessionItemStatus,
      ...(row.error ? { error: row.error } : {})
    }))
  } satisfies UploadSession
}

export async function saveUploadSession(session: UploadSession, event?: H3Event) {
  const now = new Date()
  const createdAt = new Date(session.createdAt)
  session.updatedAt = now.toISOString()
  await cleanupExpiredUploadSessions(now, event)

  await db
    .insert(schema.uploadSessions)
    .values({
      id: session.id,
      kind: session.kind,
      actorId: session.actorId,
      contributorId: session.contributorId,
      prefix: session.prefix,
      createdAt: Number.isNaN(createdAt.getTime()) ? now : createdAt,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: schema.uploadSessions.id,
      set: {
        kind: session.kind,
        actorId: session.actorId,
        contributorId: session.contributorId,
        prefix: session.prefix,
        updatedAt: now
      }
    })

  await db
    .delete(schema.uploadSessionItems)
    .where(eq(schema.uploadSessionItems.sessionId, session.id))

  if (!session.items.length) return

  const rows = session.items.map((item, position) => ({
    sessionId: session.id,
    id: item.id,
    position,
    name: item.name,
    hash: item.hash,
    ext: item.ext,
    r2Key: item.key,
    size: item.size,
    type: item.type,
    status: item.status,
    error: item.error ?? null
  }))

  // D1 caps a query at 100 bound parameters. This table has 11 columns, so we
  // can insert at most floor(100 / 11) = 9 rows per statement.
  const UPLOAD_ITEM_BATCH = 9
  for (let i = 0; i < rows.length; i += UPLOAD_ITEM_BATCH) {
    await db.insert(schema.uploadSessionItems).values(rows.slice(i, i + UPLOAD_ITEM_BATCH))
  }
}

// R2 deletes cost a subrequest each, and this runs inside a normal request, so
// only a few objects are reclaimed per pass. Abandoned uploads are a slow leak,
// not a spike, so a slow drain keeps up.
const SWEEP_OBJECTS_PER_RUN = 8

async function cleanupExpiredUploadSessions(now: Date, event?: H3Event) {
  const cutoff = new Date(now.getTime() - UPLOAD_SESSION_TTL_MS)
  const expired = await db
    .select({ id: schema.uploadSessions.id, kind: schema.uploadSessions.kind })
    .from(schema.uploadSessions)
    .where(lt(schema.uploadSessions.updatedAt, cutoff))
    .limit(50)

  if (!expired.length) return

  const sweep = async () => {
    let swept = 0
    for (const row of expired) {
      // A contribution session that expired without completing may have left
      // objects in R2 that no submission row points at — a presigned PUT can
      // succeed while /complete never runs. Nothing else would ever collect
      // those, and the prefix is invisible to the admin media browser.
      // Competition sessions have the same failure mode, with the entry table
      // as the referencing side.
      if ((row.kind === 'contribution' || row.kind === 'competition') && swept < SWEEP_OBJECTS_PER_RUN) {
        const items = await db
          .select({ r2Key: schema.uploadSessionItems.r2Key })
          .from(schema.uploadSessionItems)
          .where(eq(schema.uploadSessionItems.sessionId, row.id))
        const keys = [...new Set(items.map(item => item.r2Key))].filter(Boolean)
        if (keys.length) {
          const referenced = new Set(
            (row.kind === 'competition'
              ? await db
                  .select({ r2Key: schema.competitionEntries.r2Key })
                  .from(schema.competitionEntries)
                  .where(inArray(schema.competitionEntries.r2Key, keys.slice(0, 90)))
              : await db
                  .select({ r2Key: schema.collectionSubmissions.r2Key })
                  .from(schema.collectionSubmissions)
                  .where(inArray(schema.collectionSubmissions.r2Key, keys.slice(0, 90))))
              .map(item => item.r2Key)
          )
          for (const key of keys) {
            if (swept >= SWEEP_OBJECTS_PER_RUN) break
            if (referenced.has(key)) continue
            await deleteR2Object(key).catch(() => {})
            swept++
          }
        }
      }

      await db
        .delete(schema.uploadSessionItems)
        .where(eq(schema.uploadSessionItems.sessionId, row.id))
      await db
        .delete(schema.uploadSessions)
        .where(eq(schema.uploadSessions.id, row.id))
    }
  }

  // The sweep reclaims *other* requests' garbage, so it must not add tail
  // latency to whichever upload happened to trigger it. Defer past the response
  // where the runtime supports waitUntil (Workers keeps the promise alive);
  // otherwise fall back to running inline.
  type WaitUntilCapable = { $waitUntil?: (promise: Promise<unknown>) => void }
  const runtime = event as WaitUntilCapable | undefined
  if (typeof runtime?.$waitUntil === 'function') {
    runtime.$waitUntil(sweep().catch((error) => {
      console.error('upload session cleanup failed', error)
    }))
    return
  }
  await sweep()
}

export async function saveUploadSessionItem(session: UploadSession, item: UploadSessionItem) {
  const now = new Date()
  session.updatedAt = now.toISOString()

  await db
    .update(schema.uploadSessions)
    .set({ updatedAt: now })
    .where(eq(schema.uploadSessions.id, session.id))

  await db
    .update(schema.uploadSessionItems)
    .set({
      name: item.name,
      hash: item.hash,
      ext: item.ext,
      r2Key: item.key,
      size: item.size,
      type: item.type,
      status: item.status,
      error: item.error ?? null
    })
    .where(
      and(
        eq(schema.uploadSessionItems.sessionId, session.id),
        eq(schema.uploadSessionItems.id, item.id)
      )
    )
}

export function uploadSessionSummary(session: UploadSession) {
  return {
    id: session.id,
    prefix: session.prefix,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    items: session.items
  }
}
