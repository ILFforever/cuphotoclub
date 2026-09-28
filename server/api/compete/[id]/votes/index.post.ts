import { z } from 'zod'

const bodySchema = z.object({ entryId: z.string().min(1).max(64) })

export default defineEventHandler(async (event) => {
  const competition = await requirePublicCompetition(getRouterParam(event, 'id') || '')
  const participant = await requireParticipant(event, competition)
  const result = await readValidatedBody(event, bodySchema.safeParse)
  if (!result.success) throw createError({ statusCode: 400, message: 'ข้อมูลไม่ถูกต้อง' })

  const votedEntryIds = await castVote(competition, participant, result.data.entryId)
  return { votedEntryIds }
})
