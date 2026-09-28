import { eq } from 'drizzle-orm'

// The voting gallery. Anonymous on purpose: no photographer names until the
// results are published, so votes go to the photo rather than the friend.
// Signed-in participants only, and only once entries are visible.
export default defineEventHandler(async (event) => {
  const competition = await requirePublicCompetition(getRouterParam(event, 'id') || '')
  const participant = await requireParticipant(event, competition)
  if (!entriesVisible(competition)) return { entries: [] }

  const rows = await db
    .select({
      id: schema.competitionEntries.id,
      title: schema.competitionEntries.title,
      participantId: schema.competitionEntries.participantId
    })
    .from(schema.competitionEntries)
    .where(eq(schema.competitionEntries.competitionId, competition.id))

  setHeader(event, 'Cache-Control', 'private, no-store')
  return {
    entries: voterOrder(rows, participant.id).map(row => ({
      id: row.id,
      title: row.title,
      mine: row.participantId === participant.id,
      imageUrl: `/api/compete/${competition.id}/entries/${row.id}/image`
    }))
  }
})
