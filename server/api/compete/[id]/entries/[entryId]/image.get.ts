import { and, eq } from 'drizzle-orm'

// The only way an entry's bytes leave R2: the object sits under the private
// contributions/ prefix that /images/ refuses. Who may see it depends on phase:
//   • its own photographer, always
//   • any signed-in participant, from voting on
//   • anyone at all, once results are published
//   • admins, always
export default defineEventHandler(async (event) => {
  const competition = await getCompetition(getRouterParam(event, 'id') || '')
  if (!competition) throw createError({ statusCode: 404, message: 'ไม่พบรูปนี้' })
  const entryId = getRouterParam(event, 'entryId') || ''

  const [entry] = await db
    .select({ r2Key: schema.competitionEntries.r2Key, participantId: schema.competitionEntries.participantId })
    .from(schema.competitionEntries)
    .where(and(
      eq(schema.competitionEntries.id, entryId),
      eq(schema.competitionEntries.competitionId, competition.id)
    ))
    .limit(1)
  if (!entry) throw createError({ statusCode: 404, message: 'ไม่พบรูปนี้' })

  let allowed = competition.status === 'results' || await isAdminRequest(event)
  if (!allowed && competition.status !== 'draft') {
    const participant = await currentParticipant(event, competition)
    allowed = Boolean(participant && (participant.id === entry.participantId || entriesVisible(competition)))
  }
  if (!allowed) throw createError({ statusCode: 404, message: 'ไม่พบรูปนี้' })

  // Private: the answer depends on the caller's cookie and on the phase, so
  // nothing shared may cache it. A short private max-age keeps scrolling the
  // gallery back and forth from refetching every photo.
  setHeader(event, 'Cache-Control', 'private, max-age=300')
  return blob.serve(event, entry.r2Key)
})
