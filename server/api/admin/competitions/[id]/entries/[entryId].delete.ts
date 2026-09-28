import { and, eq } from 'drizzle-orm'

// Disqualify one entry: its votes are dropped and the object is trashed
// (restorably) when nothing else references it.
export default defineEventHandler(async (event) => {
  const actor = await requireAdmin(event)
  const competition = await requireAdminCompetition(getRouterParam(event, 'id') || '')
  const entryId = getRouterParam(event, 'entryId') || ''

  await db.delete(schema.competitionVotes).where(and(
    eq(schema.competitionVotes.entryId, entryId),
    eq(schema.competitionVotes.competitionId, competition.id)
  ))
  const removed = await db
    .delete(schema.competitionEntries)
    .where(and(
      eq(schema.competitionEntries.id, entryId),
      eq(schema.competitionEntries.competitionId, competition.id)
    ))
    .returning({ r2Key: schema.competitionEntries.r2Key })
  const key = removed[0]?.r2Key
  if (!key) throw createError({ statusCode: 404, message: 'ไม่พบรูปนี้' })

  await trashIfUnreferenced(key, actor.name || actor.email)
  await recordAdminAudit(actor, {
    action: 'remove-entry',
    entityType: 'competition',
    entityId: competition.id,
    entityTitle: competition.title,
    metadata: { entryId }
  })
  return { ok: true }
})
