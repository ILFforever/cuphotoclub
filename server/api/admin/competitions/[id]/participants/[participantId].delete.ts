import { and, eq } from 'drizzle-orm'

// Remove an attendee or judge. Their votes go with them; so do their entries,
// whose objects are trashed when nothing else references them.
export default defineEventHandler(async (event) => {
  const actor = await requireAdmin(event)
  const competition = await requireAdminCompetition(getRouterParam(event, 'id') || '')
  const participantId = getRouterParam(event, 'participantId') || ''

  const [participant] = await db
    .select()
    .from(schema.competitionParticipants)
    .where(and(
      eq(schema.competitionParticipants.id, participantId),
      eq(schema.competitionParticipants.competitionId, competition.id)
    ))
    .limit(1)
  if (!participant) throw createError({ statusCode: 404, message: 'ไม่พบผู้เข้าร่วม' })

  const entries = await db
    .select({ id: schema.competitionEntries.id, r2Key: schema.competitionEntries.r2Key })
    .from(schema.competitionEntries)
    .where(eq(schema.competitionEntries.participantId, participant.id))

  // Votes cast BY this person, then votes cast FOR their entries, then rows.
  await db.delete(schema.competitionVotes).where(eq(schema.competitionVotes.participantId, participant.id))
  for (const entry of entries) {
    await db.delete(schema.competitionVotes).where(eq(schema.competitionVotes.entryId, entry.id))
  }
  await db.delete(schema.competitionEntries).where(eq(schema.competitionEntries.participantId, participant.id))
  await db.delete(schema.competitionParticipants).where(eq(schema.competitionParticipants.id, participant.id))

  // Bounded by maxEntriesPerPerson (≤ 50), so trashing inline is safe.
  for (const entry of entries) await trashIfUnreferenced(entry.r2Key, actor.name || actor.email)

  await recordAdminAudit(actor, {
    action: 'remove-participant',
    entityType: 'competition',
    entityId: competition.id,
    entityTitle: competition.title,
    metadata: { participant: participant.name, role: participant.role, entries: entries.length }
  })
  return { ok: true }
})
