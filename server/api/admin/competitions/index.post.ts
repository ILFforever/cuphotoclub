const bodySchema = competitionSettingsSchema.pick({ title: true }).extend({
  accessMode: competitionSettingsSchema.shape.accessMode.optional()
})

// Create a competition as a draft; everything else is set on its own page.
export default defineEventHandler(async (event) => {
  const actor = await requireAdmin(event)
  const result = await readValidatedBody(event, bodySchema.safeParse)
  if (!result.success) throw createError({ statusCode: 400, message: 'ข้อมูลไม่ถูกต้อง' })

  const [created] = await db
    .insert(schema.competitions)
    .values({
      id: generateLinkToken(),
      title: result.data.title,
      accessMode: result.data.accessMode ?? 'roster',
      createdBy: actor.id
    })
    .returning()
  if (!created) throw createError({ statusCode: 500, message: 'สร้างการแข่งขันไม่สำเร็จ' })

  // Start with one question named after the competition, so a single-question
  // contest needs no extra step. The admin renames it or adds more.
  await db.insert(schema.competitionQuestions).values({
    id: crypto.randomUUID(),
    competitionId: created.id,
    title: created.title,
    sortOrder: 0
  })

  await recordAdminAudit(actor, {
    action: 'create',
    entityType: 'competition',
    entityId: created.id,
    entityTitle: created.title
  })
  return created
})
