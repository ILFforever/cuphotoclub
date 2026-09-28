import { and, eq } from 'drizzle-orm'

// Withdraw one of your own entries while submissions are open. Same object
// handling as the contribute page: only trashed (restorably) once nothing else
// references the key.
export default defineEventHandler(async (event) => {
  const competition = await requirePublicCompetition(getRouterParam(event, 'id') || '')
  if (competition.status !== 'submissions') throw createError({ statusCode: 403, message: 'ปิดรับการแก้ไขแล้ว' })
  const participant = await requireParticipant(event, competition)

  const removed = await db
    .delete(schema.competitionEntries)
    .where(and(
      eq(schema.competitionEntries.id, getRouterParam(event, 'entryId') || ''),
      eq(schema.competitionEntries.participantId, participant.id)
    ))
    .returning({ r2Key: schema.competitionEntries.r2Key })

  const key = removed[0]?.r2Key
  if (!key) throw createError({ statusCode: 404, message: 'ไม่พบรูปนี้' })
  await trashIfUnreferenced(key, 'competition participant')

  return { ok: true, remaining: await remainingEntries(competition, participant) }
})
