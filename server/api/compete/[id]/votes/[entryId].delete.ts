// Take a vote back while voting is open.
export default defineEventHandler(async (event) => {
  const competition = await requirePublicCompetition(getRouterParam(event, 'id') || '')
  const participant = await requireParticipant(event, competition)
  const votedEntryIds = await removeVote(competition, participant, getRouterParam(event, 'entryId') || '')
  return { votedEntryIds }
})
