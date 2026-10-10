import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  nickname:   z.string().trim().min(1).max(80).optional(),
  schoolYear: z.number().int().min(1).max(4).nullable().optional(),
  position:   z.string().trim().max(100).nullable().optional(),
  instagram:  z.string().trim().max(60).nullable().optional(),
  bio:        z.string().trim().max(500).nullable().optional(),
  interests:  z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  featuredLinks: z.array(z.object({
    label: z.string().trim().min(1).max(80),
    url: z.string().trim().min(1).max(240)
  })).max(6).optional(),
  photoR2Key: z.string().nullable().optional(),
  active:     z.boolean().optional(),
  sortOrder:  z.number().int().optional()
})

export default defineEventHandler(async (event) => {
  const actor = await requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) throw createError({ statusCode: 400, message: 'รหัสไม่ถูกต้อง' })

  const result = await readValidatedBody(event, bodySchema.safeParse)
  if (!result.success) throw createError({ statusCode: 400, message: 'ข้อมูลไม่ถูกต้อง' })
  const d = result.data

  const [row] = await db.select().from(schema.members).where(eq(schema.members.id, id)).limit(1)
  if (!row) throw createError({ statusCode: 404, message: 'ไม่พบสมาชิก' })

  const updates: Record<string, unknown> = {}
  if (d.nickname   !== undefined) updates.nickname   = d.nickname
  if (d.schoolYear !== undefined) updates.schoolYear = d.schoolYear
  if (d.position   !== undefined) updates.position   = d.position
  if (d.instagram  !== undefined) updates.instagram  = d.instagram
  if (d.bio        !== undefined) updates.bio        = d.bio
  if (d.interests  !== undefined) updates.interests  = d.interests
  if (d.featuredLinks !== undefined) updates.featuredLinks = d.featuredLinks
  if (d.active     !== undefined) updates.active     = d.active
  if (d.sortOrder  !== undefined) updates.sortOrder  = d.sortOrder
  let replacedPhotoKey: string | null = null
  if (d.photoR2Key !== undefined) {
    updates.photoR2Key = d.photoR2Key
    if (row.photoR2Key && row.photoR2Key !== d.photoR2Key) {
      replacedPhotoKey = row.photoR2Key
    }
  }

  await db.update(schema.members).set(updates).where(eq(schema.members.id, id))

  // Upload keys are content-hash dedup'd, so the same blob can back several
  // members (or a hero image, event cover, …). Only delete it once nothing
  // references it anymore — checked after the update above so this row's old
  // key no longer counts.
  if (replacedPhotoKey) {
    const references = await getR2DeleteReferences([replacedPhotoKey])
    const stillReferenced = [...references.values()].some(isR2DeleteReferenced)
    if (!stillReferenced) await deleteR2Object(replacedPhotoKey).catch(() => {})
  }
  if (Object.keys(updates).length) {
    await recordAdminAudit(actor, {
      action: 'update',
      entityType: 'member',
      entityId: id,
      entityTitle: String(updates.nickname ?? row.nickname),
      metadata: {
        previousNickname: row.nickname,
        previousActive: row.active,
        nextActive: updates.active ?? row.active,
        changed: Object.keys(updates)
      }
    })
    await purgeSwrCache()
  }
  return { ok: true }
})
