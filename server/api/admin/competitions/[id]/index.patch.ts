import { eq } from 'drizzle-orm'

const bodySchema = competitionSettingsSchema.partial()

// Update settings or move the competition to another phase. The phase is the
// whole permission model: it alone decides whether uploads, votes and the
// public results are open.
export default defineEventHandler(async (event) => {
  const actor = await requireAdmin(event)
  const competition = await requireAdminCompetition(getRouterParam(event, 'id') || '')
  const result = await readValidatedBody(event, bodySchema.safeParse)
  if (!result.success) throw createError({ statusCode: 400, message: 'ข้อมูลไม่ถูกต้อง' })
  const input = result.data

  const [updated] = await db
    .update(schema.competitions)
    .set({
      ...input,
      ...(input.accessCode !== undefined ? { accessCode: input.accessCode || null } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      updatedAt: new Date()
    })
    .where(eq(schema.competitions.id, competition.id))
    .returning()

  await recordAdminAudit(actor, {
    action: input.status && input.status !== competition.status ? `status:${input.status}` : 'update',
    entityType: 'competition',
    entityId: competition.id,
    entityTitle: updated?.title ?? competition.title,
    metadata: { ...input }
  })
  return updated
})
