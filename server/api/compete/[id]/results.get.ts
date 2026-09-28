// Ranked results. Public once the admin publishes them; admins can read them in
// any phase (to preview the reveal before going live).
export default defineEventHandler(async (event) => {
  const competition = await getCompetition(getRouterParam(event, 'id') || '')
  if (!competition) throw createError({ statusCode: 404, message: 'ไม่พบการแข่งขันนี้' })
  const isAdmin = await isAdminRequest(event)
  if (competition.status !== 'results' && !isAdmin) {
    throw createError({ statusCode: 403, message: 'ยังไม่ประกาศผล' })
  }

  const [results, questions] = await Promise.all([computeResults(competition), listQuestions(competition.id)])
  setHeader(event, 'Cache-Control', 'private, no-store')
  return {
    competition: {
      id: competition.id,
      title: competition.title,
      status: competition.status,
      scoring: competition.scoring
    },
    preview: competition.status !== 'results',
    // Each question has its own winners; results carry questionId and are
    // already grouped in this order.
    questions: questions.map(question => ({ id: question.id, title: question.title })),
    results: results.map(({ participantId: _participantId, ...row }) => ({
      ...row,
      imageUrl: `/api/compete/${competition.id}/entries/${row.id}/image`
    }))
  }
})
