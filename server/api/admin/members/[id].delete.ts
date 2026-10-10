import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const actor = await requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) throw createError({ statusCode: 400, message: 'รหัสไม่ถูกต้อง' })

  const [row] = await db.select().from(schema.members).where(eq(schema.members.id, id)).limit(1)
  if (!row) throw createError({ statusCode: 404, message: 'ไม่พบสมาชิก' })

  await db.delete(schema.members).where(eq(schema.members.id, id))

  // Upload keys are content-hash dedup'd, so another member (or a hero image,
  // event cover, …) may still use this blob — only delete it when the row's
  // removal left it unreferenced.
  if (row.photoR2Key) {
    const references = await getR2DeleteReferences([row.photoR2Key])
    const stillReferenced = [...references.values()].some(isR2DeleteReferenced)
    if (!stillReferenced) await deleteR2Object(row.photoR2Key).catch(() => {})
  }
  await recordAdminAudit(actor, {
    action: 'delete',
    entityType: 'member',
    entityId: id,
    entityTitle: row.nickname,
    metadata: {
      active: row.active,
      schoolYear: row.schoolYear,
      position: row.position
    }
  })
  await purgeSwrCache()
  return { ok: true }
})
