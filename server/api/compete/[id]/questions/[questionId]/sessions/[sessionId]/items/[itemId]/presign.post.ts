import { z } from 'zod'

const bodySchema = z.object({ seq: z.number().optional() })

// Competition presign — same shape as the contribute presign.
export default defineEventHandler(async (event) => {
  const competition = await requirePublicCompetition(getRouterParam(event, 'id') || '')
  if (competition.status !== 'submissions') throw createError({ statusCode: 403, message: 'ปิดรับภาพแล้ว' })
  const participant = await requireParticipant(event, competition)
  const result = await readValidatedBody(event, bodySchema.safeParse)
  if (!result.success) throw createError({ statusCode: 400, message: 'ข้อมูลไม่ถูกต้อง' })

  const question = await requireQuestion(competition, getRouterParam(event, 'questionId') || '')
  const { session, item } = await requireCompetitionUploadItem(event, competition, question, participant)
  if (item.status === 'exists' || item.status === 'uploaded') {
    return { key: item.key, status: item.status, duplicate: item.status === 'exists' }
  }

  const maxBytes = competitionMaxBytes(competition)
  if (item.size > maxBytes) {
    item.status = 'failed'
    item.error = 'File too large.'
    await saveUploadSessionItem(session, item)
    throw createError({ statusCode: 413, message: `ไฟล์ใหญ่เกิน ${Math.round(maxBytes / (1024 * 1024))}MB` })
  }

  const type = item.type || 'image/jpeg'
  if (!type.startsWith('image/')) throw createError({ statusCode: 400, message: 'รองรับเฉพาะไฟล์รูปภาพ' })

  const seq = Number.isFinite(result.data.seq) && Math.abs((result.data.seq ?? 0) - Date.now()) < 86_400_000
    ? String(Math.trunc(result.data.seq ?? 0))
    : ''

  // Keys are per participant and content-addressed: already there means this
  // person re-dropped the same photo, and complete.post just records the row.
  const { blobs } = await blob.list({ prefix: item.key, limit: 1 })
  if (blobs.some(entry => entry.pathname === item.key)) {
    item.status = 'exists'
    item.error = undefined
    await saveUploadSessionItem(session, item)
    return { key: item.key, status: item.status, duplicate: true }
  }

  const directConfig = assertR2DirectUploadConfig()
  if (item.status === 'failed') {
    item.status = 'pending'
    item.error = undefined
    await saveUploadSessionItem(session, item)
  }
  const signed = await createR2PresignedPutUrl({
    ...directConfig,
    key: item.key,
    contentType: type,
    contentLength: item.size,
    expiresSeconds: 300,
    metadata: {
      hash: item.hash,
      ...(seq ? { seq } : {})
    }
  })

  return { key: item.key, status: item.status, upload: signed }
})
