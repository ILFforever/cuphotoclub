import { z } from 'zod'

const bodySchema = z.object({ name: z.string().trim().min(1).max(120) })

// Add a judge. Their sign-in code is generated here and kept readable so the
// admin can hand it out (see the judgeCode column comment).
export default defineEventHandler(async (event) => {
  const actor = await requireAdmin(event)
  const competition = await requireAdminCompetition(getRouterParam(event, 'id') || '')
  const result = await readValidatedBody(event, bodySchema.safeParse)
  if (!result.success) throw createError({ statusCode: 400, message: 'ข้อมูลไม่ถูกต้อง' })

  const code = generateClaimCode()
  const [created] = await db
    .insert(schema.competitionParticipants)
    .values({
      id: crypto.randomUUID(),
      competitionId: competition.id,
      role: 'judge',
      name: result.data.name,
      codeHash: await hashClaimCode(code),
      judgeCode: formatClaimCode(code)
    })
    .returning()
  if (!created) throw createError({ statusCode: 500, message: 'เพิ่มกรรมการไม่สำเร็จ' })

  await recordAdminAudit(actor, {
    action: 'add-judge',
    entityType: 'competition',
    entityId: competition.id,
    entityTitle: competition.title,
    metadata: { judge: created.name }
  })
  return { id: created.id, name: created.name, judgeCode: created.judgeCode }
})
