// "Not me" — drop this browser's sign-in. Nothing is deleted; the person can
// sign straight back in with their phone or code.
export default defineEventHandler(async (event) => {
  const competition = await requirePublicCompetition(getRouterParam(event, 'id') || '')
  await forgetParticipant(event, competition.id)
  return { ok: true }
})
