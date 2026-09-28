import { z } from 'zod'
import { isAllowedUploadExt } from '~~/shared/uploadFileTypes'

// Competition manifest — the competition twin of the contribute manifest
// (server/api/contribute/[token]/sessions/index.post.ts). No `prefix` in the
// body: the server alone decides where in the bucket an entry is written.
const bodySchema = z.object({
  files: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    hash: z.string().min(16),
    ext: z.string().optional(),
    size: z.number().nonnegative().max(MAX_UPLOAD_BYTES).optional(),
    type: z.string().optional()
  })).min(1).max(50)
})

export default defineEventHandler(async (event) => {
  const competition = await requirePublicCompetition(getRouterParam(event, 'id') || '')
  if (competition.status !== 'submissions') {
    throw createError({ statusCode: 403, message: 'ปิดรับภาพแล้ว' })
  }
  const participant = await requireParticipant(event, competition)
  if (participant.role !== 'attendee') {
    throw createError({ statusCode: 403, message: 'กรรมการส่งภาพเข้าประกวดไม่ได้' })
  }

  const result = await readValidatedBody(event, bodySchema.safeParse)
  if (!result.success) throw createError({ statusCode: 400, message: 'ข้อมูลไฟล์ไม่ถูกต้อง' })

  // Friendly early stop; complete.post re-checks, because rows only exist there.
  const remaining = await remainingEntries(competition, participant)
  if (remaining <= 0) {
    throw createError({ statusCode: 409, message: 'คุณส่งภาพครบตามจำนวนที่กำหนดแล้ว' })
  }
  if (result.data.files.length > remaining) {
    throw createError({
      statusCode: 409,
      message: `ส่งได้อีก ${remaining} ภาพ (เลือกมา ${result.data.files.length} ภาพ)`
    })
  }

  const maxBytes = competitionMaxBytes(competition)
  const prefix = sanitizeUploadPrefix(competitionPrefix(competition.id, participant.id))
  const items = result.data.files.map((file) => {
    const ext = sanitizeUploadExt(file.ext || file.name.split('.').pop() || 'jpg')
    const hash = sanitizeUploadHash(file.hash)
    const key = hashedUploadKey(prefix, hash, ext)
    if (!key) throw createError({ statusCode: 400, message: 'ข้อมูลไฟล์ไม่ถูกต้อง' })
    if (!isAllowedUploadExt(ext) || (file.type && !file.type.startsWith('image/'))) {
      throw createError({ statusCode: 400, message: 'รองรับเฉพาะไฟล์รูปภาพ' })
    }
    if ((file.size ?? 0) > maxBytes) {
      throw createError({ statusCode: 413, message: `ไฟล์ใหญ่เกิน ${Math.round(maxBytes / (1024 * 1024))}MB` })
    }
    return {
      id: file.id,
      name: file.name,
      hash,
      ext,
      key,
      size: file.size ?? 0,
      type: file.type || 'image/jpeg',
      status: 'pending' as const
    }
  })

  const now = new Date().toISOString()
  const session: UploadSession = {
    id: crypto.randomUUID(),
    kind: 'competition',
    actorId: 0,
    contributorId: participant.id,
    prefix,
    createdAt: now,
    updatedAt: now,
    items
  }

  try {
    await saveUploadSession(session, event)
  } catch (error) {
    console.error('competition upload session save failed', {
      sessionId: session.id,
      competitionId: competition.id,
      cause: error instanceof Error ? error.message : String(error)
    })
    throw createError({ statusCode: 503, message: 'เริ่มการอัปโหลดไม่สำเร็จ กรุณาลองใหม่' })
  }

  return uploadSessionSummary(session)
})
