import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

// Sign in to a competition. Four ways in:
//   phone — roster attendee. Without `confirm` it only looks the number up and
//           returns the name ("is this you?"); with `confirm` it signs in.
//   judge — a judge's personal code.
//   open  — open-mode attendee picking a display name; mints a claim code.
//   claim — open-mode attendee returning on another device with that code.
//
// Every path is a guessing oracle, so failures count against a per-IP lock
// (see assertJoinNotLocked) and all misses return the same 404.
const bodySchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('phone'),
    phone: z.string().min(1).max(32),
    code: z.string().max(64).optional(),
    confirm: z.boolean().optional()
  }),
  z.object({ mode: z.literal('judge'), code: z.string().min(1).max(64) }),
  z.object({ mode: z.literal('open'), name: z.string().trim().min(1).max(80) }),
  z.object({ mode: z.literal('claim'), code: z.string().min(1).max(64) })
])

function notFound(): never {
  throw createError({ statusCode: 404, message: 'ไม่พบข้อมูลของคุณ กรุณาตรวจสอบอีกครั้ง' })
}

export default defineEventHandler(async (event) => {
  const competition = await requirePublicCompetition(getRouterParam(event, 'id') || '')
  const result = await readValidatedBody(event, bodySchema.safeParse)
  if (!result.success) throw createError({ statusCode: 400, message: 'ข้อมูลไม่ถูกต้อง' })
  const body = result.data

  await assertJoinNotLocked(event, competition.id)
  const miss = async (): Promise<never> => {
    await recordJoinFailure(event, competition.id)
    notFound()
  }

  if (body.mode === 'phone') {
    if (competition.accessMode !== 'roster') notFound()
    if (competition.accessCode && (body.code || '').trim().toUpperCase() !== competition.accessCode.toUpperCase()) {
      return miss()
    }
    const phone = normalizePhone(body.phone)
    if (!phone) return miss()
    const [row] = await db
      .select()
      .from(schema.competitionParticipants)
      .where(and(
        eq(schema.competitionParticipants.competitionId, competition.id),
        eq(schema.competitionParticipants.phone, phone),
        eq(schema.competitionParticipants.role, 'attendee')
      ))
      .limit(1)
    if (!row) return miss()
    if (!body.confirm) return { ok: true, match: { name: row.name, groupName: row.groupName } }
    await rememberParticipant(event, competition.id, row.id)
    return { ok: true, signedIn: true }
  }

  if (body.mode === 'judge' || body.mode === 'claim') {
    const normalized = normalizeClaimCode(body.code)
    if (!normalized) return miss()
    const [row] = await db
      .select()
      .from(schema.competitionParticipants)
      .where(and(
        eq(schema.competitionParticipants.competitionId, competition.id),
        eq(schema.competitionParticipants.codeHash, await hashClaimCode(normalized)),
        eq(schema.competitionParticipants.role, body.mode === 'judge' ? 'judge' : 'attendee')
      ))
      .limit(1)
    if (!row) return miss()
    await rememberParticipant(event, competition.id, row.id, body.mode === 'claim' ? normalized : undefined)
    return { ok: true, signedIn: true }
  }

  // open
  if (competition.accessMode !== 'open' || competition.status !== 'submissions') {
    throw createError({ statusCode: 403, message: 'ไม่เปิดรับผู้เข้าร่วมใหม่แล้ว' })
  }
  const existing = await currentParticipant(event, competition)
  if (existing) return { ok: true, signedIn: true }
  const code = generateClaimCode()
  const [created] = await db
    .insert(schema.competitionParticipants)
    .values({
      id: crypto.randomUUID(),
      competitionId: competition.id,
      role: 'attendee',
      name: body.name,
      codeHash: await hashClaimCode(code)
    })
    .returning()
  if (!created) throw createError({ statusCode: 500, message: 'เข้าร่วมไม่สำเร็จ' })
  await rememberParticipant(event, competition.id, created.id, code)
  return { ok: true, signedIn: true }
})
