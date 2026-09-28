import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({ title: z.string().trim().max(120).nullable() })

// Rename your own entry while submissions are open.
export default defineEventHandler(async (event) => {
  const competition = await requirePublicCompetition(getRouterParam(event, 'id') || '')
  if (competition.status !== 'submissions') throw createError({ statusCode: 403, message: 'ปิดรับการแก้ไขแล้ว' })
  const participant = await requireParticipant(event, competition)
  const result = await readValidatedBody(event, bodySchema.safeParse)
  if (!result.success) throw createError({ statusCode: 400, message: 'ข้อมูลไม่ถูกต้อง' })

  const updated = await db
    .update(schema.competitionEntries)
    .set({ title: result.data.title || null })
    .where(and(
      eq(schema.competitionEntries.id, getRouterParam(event, 'entryId') || ''),
      eq(schema.competitionEntries.participantId, participant.id)
    ))
    .returning({ id: schema.competitionEntries.id })
  if (!updated.length) throw createError({ statusCode: 404, message: 'ไม่พบรูปนี้' })
  return { ok: true }
})
