import { eq, sql } from 'drizzle-orm'

// Delete a competition with its questions, roster, entries and votes.
//
// Rows only — same reasoning as deleting a photo collection
// (server/api/admin/upload-links/[linkId].delete.ts): trashing every entry
// object inline could run out of subrequests mid-loop. Once the rows are gone
// the objects read as unreferenced and /admin/r2-images offers them for a
// paged bulk trash.
export default defineEventHandler(async (event) => {
  const actor = await requireAdmin(event)
  const competition = await requireAdminCompetition(getRouterParam(event, 'id') || '')

  const [{ total } = { total: 0 }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(schema.competitionEntries)
    .where(eq(schema.competitionEntries.competitionId, competition.id))

  // Child-first rather than leaning on FK cascades.
  await db.delete(schema.competitionVotes).where(eq(schema.competitionVotes.competitionId, competition.id))
  await db.delete(schema.competitionEntries).where(eq(schema.competitionEntries.competitionId, competition.id))
  await db.delete(schema.competitionParticipants).where(eq(schema.competitionParticipants.competitionId, competition.id))
  await db.delete(schema.competitionQuestions).where(eq(schema.competitionQuestions.competitionId, competition.id))
  await db.delete(schema.competitions).where(eq(schema.competitions.id, competition.id))

  await recordAdminAudit(actor, {
    action: 'delete',
    entityType: 'competition',
    entityId: competition.id,
    entityTitle: competition.title,
    metadata: { entryCount: Number(total) }
  })
  return { ok: true, entryCount: Number(total) }
})
