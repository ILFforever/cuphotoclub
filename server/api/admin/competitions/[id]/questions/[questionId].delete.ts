import { eq, sql } from 'drizzle-orm'

// Delete a question with its entries and votes.
//
// Rows only, for the same reason as deleting a whole competition: trashing
// every entry object inline could run out of subrequests. The objects then
// read as unreferenced in /admin/r2-images for a paged cleanup.
export default defineEventHandler(async (event) => {
  const actor = await requireAdmin(event)
  const competition = await requireAdminCompetition(getRouterParam(event, 'id') || '')
  const question = await requireQuestion(competition, getRouterParam(event, 'questionId') || '')

  // A competition that is running must keep somewhere for entries to go.
  if (competition.status !== 'draft' && (await listQuestions(competition.id)).length <= 1) {
    throw createError({ statusCode: 400, message: 'การประกวดที่เปิดอยู่ต้องมีอย่างน้อยหนึ่งหัวข้อ' })
  }

  const [{ total } = { total: 0 }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(schema.competitionEntries)
    .where(eq(schema.competitionEntries.questionId, question.id))

  await db.delete(schema.competitionVotes).where(eq(schema.competitionVotes.questionId, question.id))
  await db.delete(schema.competitionEntries).where(eq(schema.competitionEntries.questionId, question.id))
  await db.delete(schema.competitionQuestions).where(eq(schema.competitionQuestions.id, question.id))

  await recordAdminAudit(actor, {
    action: 'delete-question',
    entityType: 'competition',
    entityId: competition.id,
    entityTitle: competition.title,
    metadata: { question: question.title, entryCount: Number(total) }
  })
  return { ok: true, entryCount: Number(total) }
})
