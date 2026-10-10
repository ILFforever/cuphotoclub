import { sql, eq } from 'drizzle-orm'

const bodySchema = competitionQuestionSchema.partial({ description: true, sortOrder: true })

// Add a question. It goes to the end unless a position is given.
export default defineEventHandler(async (event) => {
  const actor = await requireAdmin(event)
  const competition = await requireAdminCompetition(getRouterParam(event, 'id') || '')
  const result = await readValidatedBody(event, bodySchema.safeParse)
  if (!result.success) throw createError({ statusCode: 400, message: 'ข้อมูลไม่ถูกต้อง' })

  const [{ next } = { next: 0 }] = await db
    .select({ next: sql<number>`coalesce(max(${schema.competitionQuestions.sortOrder}) + 1, 0)` })
    .from(schema.competitionQuestions)
    .where(eq(schema.competitionQuestions.competitionId, competition.id))

  const [created] = await db
    .insert(schema.competitionQuestions)
    .values({
      id: crypto.randomUUID(),
      competitionId: competition.id,
      title: result.data.title,
      description: result.data.description || null,
      maxEntriesPerPerson: result.data.maxEntriesPerPerson,
      votesPerPerson: result.data.votesPerPerson,
      votesPerJudge: result.data.votesPerJudge,
      sortOrder: result.data.sortOrder ?? Number(next)
    })
    .returning()

  await recordAdminAudit(actor, {
    action: 'add-question',
    entityType: 'competition',
    entityId: competition.id,
    entityTitle: competition.title,
    metadata: { question: created?.title }
  })
  return created
})
