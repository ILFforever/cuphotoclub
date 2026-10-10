import { asc, eq, sql } from 'drizzle-orm'

// Everything the admin competition page shows: settings, questions, roster + judges,
// entries with live tallies, and how many votes each voter has used.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const competition = await requireAdminCompetition(getRouterParam(event, 'id') || '')

  const [participants, votesUsed, results, questions] = await Promise.all([
    db
      .select()
      .from(schema.competitionParticipants)
      .where(eq(schema.competitionParticipants.competitionId, competition.id))
      .orderBy(asc(schema.competitionParticipants.role), asc(schema.competitionParticipants.name)),
    db
      .select({ participantId: schema.competitionVotes.participantId, total: sql<number>`count(*)` })
      .from(schema.competitionVotes)
      .where(eq(schema.competitionVotes.competitionId, competition.id))
      .groupBy(schema.competitionVotes.participantId),
    computeResults(competition),
    listQuestions(competition.id)
  ])

  const votesBy = new Map(votesUsed.map(row => [row.participantId, Number(row.total)]))
  const entriesBy = new Map<string, number>()
  for (const entry of results) entriesBy.set(entry.participantId, (entriesBy.get(entry.participantId) ?? 0) + 1)

  setHeader(event, 'Cache-Control', 'private, no-store')
  return {
    competition,
    questions,
    participants: participants.map(row => ({
      id: row.id,
      role: row.role,
      name: row.name,
      phone: row.phone,
      groupName: row.groupName,
      judgeCode: row.judgeCode,
      lastSeenAt: row.lastSeenAt,
      entries: entriesBy.get(row.id) ?? 0,
      votes: votesBy.get(row.id) ?? 0
    })),
    results: results.map(row => ({
      ...row,
      imageUrl: `/api/compete/${competition.id}/entries/${row.id}/image`
    }))
  }
})
