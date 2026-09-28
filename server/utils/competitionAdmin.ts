import { z } from 'zod'

// Shared by the admin create + update routes so the two can't drift apart.
export const competitionSettingsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable(),
  status: z.enum(['draft', 'submissions', 'voting', 'closed', 'results']),
  accessMode: z.enum(['roster', 'open']),
  // Blank = phone only. See the column comment in server/db/schema.ts.
  accessCode: z.string().trim().max(32).nullable(),
  scoring: z.enum(['public', 'judges', 'both']),
  publicWeight: z.number().int().min(0).max(100),
  judgeWeight: z.number().int().min(0).max(100),
  maxEntriesPerPerson: z.number().int().min(1).max(50),
  votesPerPerson: z.number().int().min(1).max(50),
  votesPerJudge: z.number().int().min(1).max(200),
  maxBytesPerPhoto: z.number().int().min(256 * 1024).max(MAX_UPLOAD_BYTES)
})

export type CompetitionSettings = z.infer<typeof competitionSettingsSchema>

export interface RosterRow {
  name: string
  phone: string
  groupName: string | null
}

// Paste-friendly roster parsing: one person per line, fields split by comma or
// tab, in the order name, phone, group (group optional). A header row, blank
// lines and lines with no usable phone are skipped and reported back rather
// than failing the whole import. The phone is whichever field normalises to a
// phone number, so "phone, name" also works.
export function parseRoster(text: string) {
  const rows: RosterRow[] = []
  const skipped: string[] = []
  const seen = new Set<string>()

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const fields = line.split(/\t|,/).map(field => field.trim().replace(/^"|"$/g, '').trim())
    const phoneIndex = fields.findIndex(field => normalizePhone(field))
    if (phoneIndex === -1) {
      skipped.push(line)
      continue
    }
    const phone = normalizePhone(fields[phoneIndex]!)
    const rest = fields.filter((_, index) => index !== phoneIndex)
    const name = rest[0] || ''
    if (!name || seen.has(phone)) {
      skipped.push(line)
      continue
    }
    seen.add(phone)
    rows.push({ name: name.slice(0, 120), phone, groupName: rest[1]?.slice(0, 80) || null })
  }

  return { rows, skipped }
}
