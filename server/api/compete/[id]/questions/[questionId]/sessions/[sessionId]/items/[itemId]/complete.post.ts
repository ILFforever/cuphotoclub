// Competition complete — the authoritative gate for the per-person entry cap
// and the byte ceiling, because an entry row only comes into existence here.
export default defineEventHandler(async (event) => {
  // The phase is checked below rather than up front: the bytes are already in
  // R2, so a competition that left the submissions phase mid-batch must clean
  // the object up rather than strand it.
  const competition = await requirePublicCompetition(getRouterParam(event, 'id') || '')
  const participant = await requireParticipant(event, competition)
  const question = await requireQuestion(competition, getRouterParam(event, 'questionId') || '')
  const { session, item } = await requireCompetitionUploadItem(event, competition, question, participant)

  const fail = async (status: number, message: string, error: string, removeObject = true) => {
    if (removeObject && !(await participantOwnsKey(participant.id, item.key))) {
      await deleteR2Object(item.key).catch(() => {})
    }
    item.status = 'failed'
    item.error = error
    await saveUploadSessionItem(session, item)
    throw createError({ statusCode: status, message })
  }

  if (competition.status !== 'submissions') {
    return fail(403, 'ปิดรับภาพแล้ว', 'Submissions closed before the upload was confirmed.')
  }

  const maxBytes = competitionMaxBytes(competition)
  const { blobs } = await blob.list({ prefix: item.key, limit: 1 })
  const uploaded = blobs.find(entry => entry.pathname === item.key)
  if (!uploaded) {
    return fail(409, 'อัปโหลดไม่สำเร็จ กรุณาลองใหม่', 'Direct upload did not create the expected R2 object.', false)
  }
  if (!uploaded.contentType?.startsWith('image/')) {
    return fail(400, 'รองรับเฉพาะไฟล์รูปภาพ', 'Uploaded object is not an image.')
  }
  if ((uploaded.size || 0) > maxBytes) {
    return fail(413, `ไฟล์ใหญ่เกิน ${Math.round(maxBytes / (1024 * 1024))}MB`, 'Uploaded object is too large.')
  }
  if (uploaded.customMetadata?.hash !== item.hash) {
    return fail(400, 'ไฟล์ไม่ตรงกับข้อมูลที่ส่งมา', 'Uploaded object hash metadata did not match the manifest.')
  }

  const alreadyMine = await participantOwnsKey(participant.id, item.key)
  if (!alreadyMine && (await remainingEntries(question, participant)) <= 0) {
    return fail(409, 'คุณส่งภาพครบตามจำนวนที่กำหนดแล้ว', 'Entry limit reached.')
  }

  await db
    .insert(schema.competitionEntries)
    .values({
      id: crypto.randomUUID(),
      competitionId: competition.id,
      participantId: participant.id,
      questionId: question.id,
      r2Key: item.key,
      hash: item.hash,
      size: uploaded.size || item.size,
      type: uploaded.contentType || item.type
    })
    .onConflictDoNothing()

  // Browser upload confirmed — index it (see server/utils/r2Objects.ts).
  await recordR2Objects([uploaded])

  item.status = 'uploaded'
  item.error = undefined
  await saveUploadSessionItem(session, item)
  return { key: item.key, status: item.status }
})
