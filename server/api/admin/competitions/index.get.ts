import { desc, sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const [rows, participants, entries] = await Promise.all([
    db.select().from(schema.competitions).orderBy(desc(schema.competitions.createdAt)),
    db
      .select({ competitionId: schema.competitionParticipants.competitionId, total: sql<number>`count(*)` })
      .from(schema.competitionParticipants)
      .groupBy(schema.competitionParticipants.competitionId),
    db
      .select({ competitionId: schema.competitionEntries.competitionId, total: sql<number>`count(*)` })
      .from(schema.competitionEntries)
      .groupBy(schema.competitionEntries.competitionId)
  ])

  const participantCount = new Map(participants.map(row => [row.competitionId, Number(row.total)]))
  const entryCount = new Map(entries.map(row => [row.competitionId, Number(row.total)]))

  return rows.map(row => ({
    id: row.id,
    title: row.title,
    status: row.status,
    accessMode: row.accessMode,
    scoring: row.scoring,
    createdAt: row.createdAt,
    participantCount: participantCount.get(row.id) ?? 0,
    entryCount: entryCount.get(row.id) ?? 0
  }))
})
