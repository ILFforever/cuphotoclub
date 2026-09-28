import { eq } from 'drizzle-orm'

const bodySchema = competitionQuestionSchema.partial()

// Rename a question, change its limits, or move it (sortOrder). Lowering a
// limit never removes entries or votes already in — it only stops new ones.
export default defineEventHandler(async (event) => {
  const actor = await requireAdmin(event)
  const competition = await requireAdminCompetition(getRouterParam(event, 'id') || '')
  const question = await requireQuestion(competition, getRouterParam(event, 'questionId') || '')
  const result = await readValidatedBody(event, bodySchema.safeParse)
  if (!result.success) throw createError({ statusCode: 400, message: 'ข้อมูลไม่ถูกต้อง' })
  const input = result.data

  const [updated] = await db
    .update(schema.competitionQuestions)
    .set({
      ...input,
      ...(input.description !== undefined ? { description: input.description || null } : {})
    })
    .where(eq(schema.competitionQuestions.id, question.id))
    .returning()

  await recordAdminAudit(actor, {
    action: 'update-question',
    entityType: 'competition',
    entityId: competition.id,
    entityTitle: competition.title,
    metadata: { question: updated?.title, ...input }
  })
  return updated
})
