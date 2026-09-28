import { and, eq, sql } from 'drizzle-orm'

// Public: everything the competition page needs to render itself, plus who
// this browser is signed in as. Like the contribute page, a GET never creates a
// participant — only an explicit join does.
//
// Limits and votes are per question, so the signed-in person's counts come back
// on each question rather than once for the competition.
export default defineEventHandler(async (event) => {
  const competition = await requirePublicCompetition(getRouterParam(event, 'id') || '')
  const [participant, questions] = await Promise.all([
    currentParticipant(event, competition),
    listQuestions(competition.id)
  ])

  // Two grouped counts instead of two queries per question.
  const [entryCounts, voteCounts] = participant
    ? await Promise.all([
        db
          .select({ questionId: schema.competitionEntries.questionId, total: sql<number>`count(*)` })
          .from(schema.competitionEntries)
          .where(eq(schema.competitionEntries.participantId, participant.id))
          .groupBy(schema.competitionEntries.questionId),
        db
          .select({ questionId: schema.competitionVotes.questionId, total: sql<number>`count(*)` })
          .from(schema.competitionVotes)
          .where(and(
            eq(schema.competitionVotes.participantId, participant.id),
            eq(schema.competitionVotes.competitionId, competition.id)
          ))
          .groupBy(schema.competitionVotes.questionId)
      ])
    : [[], []]
  const entriesIn = new Map(entryCounts.map(row => [row.questionId, Number(row.total)]))
  const votesIn = new Map(voteCounts.map(row => [row.questionId, Number(row.total)]))

  let me = null
  if (participant) {
    const code = await sessionParticipantCode(event, competition.id)
    me = {
      name: participant.name,
      groupName: participant.groupName,
      role: participant.role,
      // Open-mode attendees only: the code that moves them to another device.
      code: code ? formatClaimCode(code) : null,
      votedEntryIds: await participantVotedEntryIds(participant.id)
    }
  }

  return {
    competition: {
      id: competition.id,
      title: competition.title,
      description: competition.description,
      status: competition.status,
      accessMode: competition.accessMode,
      needsAccessCode: competition.accessMode === 'roster' && Boolean(competition.accessCode),
      scoring: competition.scoring,
      maxBytesPerPhoto: competitionMaxBytes(competition)
    },
    questions: questions.map((question) => {
      const entries = entriesIn.get(question.id) ?? 0
      return {
        id: question.id,
        title: question.title,
        description: question.description,
        maxEntriesPerPerson: question.maxEntriesPerPerson,
        votesPerPerson: question.votesPerPerson,
        votesPerJudge: question.votesPerJudge,
        mine: participant
          ? {
              entries,
              remainingEntries: competition.status === 'submissions' && participant.role === 'attendee'
                ? Math.max(0, question.maxEntriesPerPerson - entries)
                : 0,
              votesAllowed: voteAllowance(competition, question, participant),
              votesUsed: votesIn.get(question.id) ?? 0
            }
          : null
      }
    }),
    me
  }
})
