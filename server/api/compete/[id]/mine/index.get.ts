import { asc, eq } from 'drizzle-orm'

// The signed-in attendee's own entries, in any phase.
export default defineEventHandler(async (event) => {
  const competition = await requirePublicCompetition(getRouterParam(event, 'id') || '')
  const participant = await requireParticipant(event, competition)

  const rows = await db
    .select({
      id: schema.competitionEntries.id,
      title: schema.competitionEntries.title,
      createdAt: schema.competitionEntries.createdAt
    })
    .from(schema.competitionEntries)
    .where(eq(schema.competitionEntries.participantId, participant.id))
    .orderBy(asc(schema.competitionEntries.createdAt))

  setHeader(event, 'Cache-Control', 'private, no-store')
  return {
    entries: rows.map(row => ({
      id: row.id,
      title: row.title,
      imageUrl: `/api/compete/${competition.id}/entries/${row.id}/image`
    }))
  }
})
