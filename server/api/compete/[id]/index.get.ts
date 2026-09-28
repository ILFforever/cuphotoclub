// Public: everything the competition page needs to render itself, plus who
// this browser is signed in as. Like the contribute page, a GET never creates a
// participant — only an explicit join does.
export default defineEventHandler(async (event) => {
  const competition = await requirePublicCompetition(getRouterParam(event, 'id') || '')
  const participant = await currentParticipant(event, competition)

  let me = null
  if (participant) {
    const allowance = voteAllowance(competition, participant)
    const voted = await participantVotedEntryIds(participant.id)
    const code = await sessionParticipantCode(event, competition.id)
    me = {
      name: participant.name,
      groupName: participant.groupName,
      role: participant.role,
      // Open-mode attendees only: the code that moves them to another device.
      code: code ? formatClaimCode(code) : null,
      entries: await participantEntryCount(participant.id),
      remainingEntries: competition.status === 'submissions' ? await remainingEntries(competition, participant) : 0,
      votesAllowed: allowance,
      votedEntryIds: voted
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
      maxEntriesPerPerson: competition.maxEntriesPerPerson,
      votesPerPerson: competition.votesPerPerson,
      votesPerJudge: competition.votesPerJudge,
      maxBytesPerPhoto: competitionMaxBytes(competition)
    },
    me
  }
})
