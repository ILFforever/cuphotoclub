import { sql } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({ text: z.string().max(500_000) })

// Import attendees from pasted CSV / spreadsheet rows. Upserts by phone, so
// re-importing a corrected sheet fixes names and groups without duplicating
// anyone or touching their entries and votes.
export default defineEventHandler(async (event) => {
  const actor = await requireAdmin(event)
  const competition = await requireAdminCompetition(getRouterParam(event, 'id') || '')
  const result = await readValidatedBody(event, bodySchema.safeParse)
  if (!result.success) throw createError({ statusCode: 400, message: 'ข้อมูลไม่ถูกต้อง' })

  const { rows, skipped } = parseRoster(result.data.text)
  if (rows.length > 5000) throw createError({ statusCode: 400, message: 'Too many rows (max 5000).' })

  // D1 caps a statement at 100 bound parameters; 6 columns per row → 16 rows.
  const BATCH = 16
  for (let i = 0; i < rows.length; i += BATCH) {
    await db
      .insert(schema.competitionParticipants)
      .values(rows.slice(i, i + BATCH).map(row => ({
        id: crypto.randomUUID(),
        competitionId: competition.id,
        role: 'attendee' as const,
        name: row.name,
        phone: row.phone,
        groupName: row.groupName
      })))
      .onConflictDoUpdate({
        target: [schema.competitionParticipants.competitionId, schema.competitionParticipants.phone],
        set: {
          name: sql`excluded.name`,
          groupName: sql`excluded.group_name`
        }
      })
  }

  await recordAdminAudit(actor, {
    action: 'import-roster',
    entityType: 'competition',
    entityId: competition.id,
    entityTitle: competition.title,
    metadata: { imported: rows.length, skipped: skipped.length }
  })
  return { imported: rows.length, skipped: skipped.slice(0, 50), skippedCount: skipped.length }
})
