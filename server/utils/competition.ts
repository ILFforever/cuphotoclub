import type { H3Event } from 'h3'
import { and, asc, eq, sql } from 'drizzle-orm'

// Photo competitions: attendees upload entries, then attendees and/or judges
// vote. See the table comments in server/db/schema.ts.
//
// Identity mirrors server/utils/contribution.ts: participants live in their own
// sealed cookie (cu_comp), never in the nuxt-auth-utils User session, so an
// attendee can never be mistaken for an admin.

export type Competition = typeof schema.competitions.$inferSelect
export type CompetitionParticipant = typeof schema.competitionParticipants.$inferSelect
export type CompetitionStatus = Competition['status']
export type CompetitionQuestion = typeof schema.competitionQuestions.$inferSelect

const PARTICIPANT_COOKIE = 'cu_comp'

// Every competition entry sits under the private contributions/ prefix, so
// /images/ refuses them and only the phase-checked image route can serve them.
// The question is part of the key, so an upload session is bound to exactly
// one question and the same photo sent to two questions is two entries.
export function competitionPrefix(competitionId: string, participantId: string, questionId: string) {
  return `contributions/competitions/${competitionId}/${participantId}/${questionId}`
}

// ── Phones ──────────────────────────────────────────────────────────────────

// Digits only, with a Thai +66 country code folded back to the leading 0 so
// "+66 81 234 5678", "081-234-5678" and "0812345678" are one person. Returns ''
// for anything too short to be a phone number.
export function normalizePhone(input: string) {
  let digits = String(input || '').replace(/\D/g, '')
  if (digits.startsWith('66') && digits.length === 11) digits = `0${digits.slice(2)}`
  return digits.length >= 9 && digits.length <= 15 ? digits : ''
}

// ── Loading ─────────────────────────────────────────────────────────────────

export async function getCompetition(id: string) {
  if (!id) return null
  const [row] = await db
    .select()
    .from(schema.competitions)
    .where(eq(schema.competitions.id, id))
    .limit(1)
  return row ?? null
}

// Public read. Drafts 404 exactly like a missing competition.
export async function requirePublicCompetition(id: string) {
  const competition = await getCompetition(id)
  if (!competition || competition.status === 'draft') {
    throw createError({ statusCode: 404, message: 'ไม่พบการแข่งขันนี้' })
  }
  return competition
}

export async function requireAdminCompetition(id: string) {
  const competition = await getCompetition(id)
  if (!competition) throw createError({ statusCode: 404, message: 'ไม่พบการแข่งขันนี้' })
  return competition
}

// Whether the caller holds a valid admin session. Never throws — used where an
// admin gets extra visibility on an otherwise public route.
export async function isAdminRequest(event: H3Event) {
  const session = await getUserSession(event).catch(() => null)
  const user = session?.user
  return Boolean(user?.id && user?.email && user?.role)
}

// ── Questions ───────────────────────────────────────────────────────────────

export async function listQuestions(competitionId: string) {
  return db
    .select()
    .from(schema.competitionQuestions)
    .where(eq(schema.competitionQuestions.competitionId, competitionId))
    .orderBy(asc(schema.competitionQuestions.sortOrder), asc(schema.competitionQuestions.createdAt))
}

export async function requireQuestion(competition: Competition, questionId: string) {
  const [row] = await db
    .select()
    .from(schema.competitionQuestions)
    .where(and(
      eq(schema.competitionQuestions.id, questionId),
      eq(schema.competitionQuestions.competitionId, competition.id)
    ))
    .limit(1)
  if (!row) throw createError({ statusCode: 404, message: 'ไม่พบหัวข้อนี้' })
  return row
}

// ── Rules ───────────────────────────────────────────────────────────────────

export function attendeesVote(competition: Competition) {
  return competition.scoring !== 'judges'
}

export function judgesVote(competition: Competition) {
  return competition.scoring !== 'public'
}

// Votes are per question: x votes in each question, never a shared pool.
export function voteAllowance(competition: Competition, question: CompetitionQuestion, participant: CompetitionParticipant) {
  if (participant.role === 'judge') return judgesVote(competition) ? question.votesPerJudge : 0
  return attendeesVote(competition) ? question.votesPerPerson : 0
}

export function competitionMaxBytes(competition: Competition) {
  return Math.min(competition.maxBytesPerPhoto || MAX_UPLOAD_BYTES, MAX_UPLOAD_BYTES)
}

// Entries are visible to voters from the voting phase on. Before that, each
// person only sees their own.
export function entriesVisible(competition: Competition) {
  return competition.status === 'voting' || competition.status === 'closed' || competition.status === 'results'
}

// ── Participant session ─────────────────────────────────────────────────────

interface ParticipantSessionData {
  comps?: Record<string, { participantId: string, code?: string }>
}

function participantSession(event: H3Event) {
  return useSession<ParticipantSessionData>(event, {
    name: PARTICIPANT_COOKIE,
    password: useRuntimeConfig(event).session.password,
    cookie: {
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/'
    }
  })
}

export async function rememberParticipant(event: H3Event, competitionId: string, participantId: string, code?: string) {
  const session = await participantSession(event)
  await session.update(data => ({
    comps: { ...(data.comps ?? {}), [competitionId]: { participantId, ...(code ? { code } : {}) } }
  }))
  await db
    .update(schema.competitionParticipants)
    .set({ lastSeenAt: new Date() })
    .where(eq(schema.competitionParticipants.id, participantId))
}

export async function forgetParticipant(event: H3Event, competitionId: string) {
  const session = await participantSession(event)
  await session.update((data) => {
    const entries = Object.entries(data.comps ?? {}).filter(([key]) => key !== competitionId)
    return { comps: Object.fromEntries(entries) }
  })
}

export async function sessionParticipantCode(event: H3Event, competitionId: string) {
  const session = await participantSession(event)
  return session.data.comps?.[competitionId]?.code ?? null
}

export async function currentParticipant(event: H3Event, competition: Competition) {
  const session = await participantSession(event)
  const entry = session.data.comps?.[competition.id]
  if (!entry?.participantId) return null
  const [row] = await db
    .select()
    .from(schema.competitionParticipants)
    .where(and(
      eq(schema.competitionParticipants.id, entry.participantId),
      eq(schema.competitionParticipants.competitionId, competition.id)
    ))
    .limit(1)
  // Removed from the roster by an admin — drop the stale cookie entry.
  if (!row) {
    await forgetParticipant(event, competition.id)
    return null
  }
  return row
}

export async function requireParticipant(event: H3Event, competition: Competition) {
  const participant = await currentParticipant(event, competition)
  if (!participant) {
    throw createError({ statusCode: 401, message: 'กรุณาเข้าร่วมการแข่งขันก่อน' })
  }
  return participant
}

// ── Sign-in guessing guard ──────────────────────────────────────────────────

// Sign-in is a guessing oracle (phone numbers, judge codes, claim codes), but a
// whole room of attendees signs in within minutes. Counting every attempt in KV
// would spend the free-plan write quota that has taken the site down before, so
// only FAILED attempts are written; a success costs a single read.
const FAIL_LIMIT = 15
const FAIL_WINDOW_MS = 60 * 60 * 1000

function failKey(event: H3Event, competitionId: string) {
  return `comp-join-fail:${competitionId}:${clientIp(event)}`
}

export async function assertJoinNotLocked(event: H3Event, competitionId: string) {
  try {
    const row = await kv.get<{ count: number, resetAt: number }>(failKey(event, competitionId))
    if (row && Date.now() < row.resetAt && row.count >= FAIL_LIMIT) {
      throw createError({ statusCode: 429, message: 'ลองหลายครั้งเกินไป กรุณารอสักครู่' })
    }
  } catch (error) {
    // Fail closed: this is the only thing bounding the guess rate.
    if ((error as { statusCode?: number })?.statusCode === 429) throw error
    throw createError({ statusCode: 503, message: 'ระบบไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่' })
  }
}

export async function recordJoinFailure(event: H3Event, competitionId: string) {
  const key = failKey(event, competitionId)
  const now = Date.now()
  try {
    const row = await kv.get<{ count: number, resetAt: number }>(key)
    const next = row && now < row.resetAt
      ? { count: row.count + 1, resetAt: row.resetAt }
      : { count: 1, resetAt: now + FAIL_WINDOW_MS }
    await kv.set(key, next, { ttl: Math.ceil(FAIL_WINDOW_MS / 1000) })
  } catch {
    // Best effort; assertJoinNotLocked already fails closed on a KV outage.
  }
}

// ── Counts ──────────────────────────────────────────────────────────────────

export async function participantEntryCount(participantId: string) {
  const [row] = await db
    .select({ total: sql<number>`count(*)` })
    .from(schema.competitionEntries)
    .where(eq(schema.competitionEntries.participantId, participantId))
  return Number(row?.total ?? 0)
}

export async function participantOwnsKey(participantId: string, r2Key: string) {
  const [row] = await db
    .select({ id: schema.competitionEntries.id })
    .from(schema.competitionEntries)
    .where(and(
      eq(schema.competitionEntries.participantId, participantId),
      eq(schema.competitionEntries.r2Key, r2Key)
    ))
    .limit(1)
  return Boolean(row)
}

export async function participantQuestionEntryCount(participantId: string, questionId: string) {
  const [row] = await db
    .select({ total: sql<number>`count(*)` })
    .from(schema.competitionEntries)
    .where(and(
      eq(schema.competitionEntries.participantId, participantId),
      eq(schema.competitionEntries.questionId, questionId)
    ))
  return Number(row?.total ?? 0)
}

// The photo limit applies to one question only.
export async function remainingEntries(question: CompetitionQuestion, participant: CompetitionParticipant) {
  if (participant.role !== 'attendee') return 0
  return Math.max(0, question.maxEntriesPerPerson - await participantQuestionEntryCount(participant.id, question.id))
}

export async function participantVotedEntryIds(participantId: string) {
  const rows = await db
    .select({ entryId: schema.competitionVotes.entryId })
    .from(schema.competitionVotes)
    .where(eq(schema.competitionVotes.participantId, participantId))
  return rows.map(row => row.entryId)
}

// ── Voting ──────────────────────────────────────────────────────────────────

export async function castVote(competition: Competition, participant: CompetitionParticipant, entryId: string) {
  if (competition.status !== 'voting') {
    throw createError({ statusCode: 403, message: 'ยังไม่เปิดหรือปิดการโหวตแล้ว' })
  }
  const [entry] = await db
    .select({
      id: schema.competitionEntries.id,
      participantId: schema.competitionEntries.participantId,
      questionId: schema.competitionEntries.questionId
    })
    .from(schema.competitionEntries)
    .where(and(
      eq(schema.competitionEntries.id, entryId),
      eq(schema.competitionEntries.competitionId, competition.id)
    ))
    .limit(1)
  if (!entry) throw createError({ statusCode: 404, message: 'ไม่พบภาพนี้' })
  if (entry.participantId === participant.id) {
    throw createError({ statusCode: 403, message: 'โหวตภาพของตัวเองไม่ได้' })
  }
  const question = await requireQuestion(competition, entry.questionId || '')
  const allowance = voteAllowance(competition, question, participant)
  if (allowance <= 0) throw createError({ statusCode: 403, message: 'คุณไม่มีสิทธิ์โหวตในการแข่งขันนี้' })

  // One statement, so two taps racing each other cannot both slip under the
  // cap: the row is only inserted while this voter's count *in this question*
  // is below it.
  await db.run(sql`
    INSERT OR IGNORE INTO competition_votes (competition_id, entry_id, participant_id, role, question_id)
    SELECT ${competition.id}, ${entry.id}, ${participant.id}, ${participant.role}, ${question.id}
    WHERE (
      SELECT count(*) FROM competition_votes
      WHERE participant_id = ${participant.id} AND question_id = ${question.id}
    ) < ${allowance}
  `)

  const voted = await participantVotedEntryIds(participant.id)
  if (!voted.includes(entry.id)) {
    throw createError({ statusCode: 409, message: `โหวตได้สูงสุด ${allowance} ภาพ` })
  }
  return voted
}

export async function removeVote(competition: Competition, participant: CompetitionParticipant, entryId: string) {
  if (competition.status !== 'voting') {
    throw createError({ statusCode: 403, message: 'ยังไม่เปิดหรือปิดการโหวตแล้ว' })
  }
  await db
    .delete(schema.competitionVotes)
    .where(and(
      eq(schema.competitionVotes.participantId, participant.id),
      eq(schema.competitionVotes.entryId, entryId)
    ))
  return participantVotedEntryIds(participant.id)
}

// ── Results ─────────────────────────────────────────────────────────────────

export interface CompetitionResult {
  id: string
  questionId: string
  title: string | null
  participantId: string
  name: string
  groupName: string | null
  attendeeVotes: number
  judgeVotes: number
  score: number
  rank: number
}

// Every entry with its tallies, ranked within its own question (each question
// has its own winners), grouped in question order and best first. Ties share
// a rank (1, 1, 3), the same competition ranking CU_Photo_3000 used, so a
// reveal never has to pick arbitrarily between two photos with the same score.
export async function computeResults(competition: Competition): Promise<CompetitionResult[]> {
  const [entries, tallies, questions] = await Promise.all([
    db
      .select({
        id: schema.competitionEntries.id,
        title: schema.competitionEntries.title,
        participantId: schema.competitionEntries.participantId,
        questionId: schema.competitionEntries.questionId,
        name: schema.competitionParticipants.name,
        groupName: schema.competitionParticipants.groupName,
        createdAt: schema.competitionEntries.createdAt
      })
      .from(schema.competitionEntries)
      .innerJoin(schema.competitionParticipants, eq(schema.competitionEntries.participantId, schema.competitionParticipants.id))
      .where(eq(schema.competitionEntries.competitionId, competition.id))
      .orderBy(asc(schema.competitionEntries.createdAt)),
    db
      .select({
        entryId: schema.competitionVotes.entryId,
        role: schema.competitionVotes.role,
        total: sql<number>`count(*)`
      })
      .from(schema.competitionVotes)
      .where(eq(schema.competitionVotes.competitionId, competition.id))
      .groupBy(schema.competitionVotes.entryId, schema.competitionVotes.role),
    listQuestions(competition.id)
  ])

  const byEntry = new Map<string, { attendee: number, judge: number }>()
  for (const row of tallies) {
    const current = byEntry.get(row.entryId) ?? { attendee: 0, judge: 0 }
    current[row.role] = Number(row.total)
    byEntry.set(row.entryId, current)
  }

  const usePublic = attendeesVote(competition)
  const useJudges = judgesVote(competition)
  const scored = entries.map((entry) => {
    const tally = byEntry.get(entry.id) ?? { attendee: 0, judge: 0 }
    const score = (usePublic ? tally.attendee * competition.publicWeight : 0)
      + (useJudges ? tally.judge * competition.judgeWeight : 0)
    return {
      id: entry.id,
      questionId: entry.questionId || '',
      title: entry.title,
      participantId: entry.participantId,
      name: entry.name,
      groupName: entry.groupName,
      attendeeVotes: tally.attendee,
      judgeVotes: tally.judge,
      score,
      rank: 0
    }
  })

  const order = new Map(questions.map((question, index) => [question.id, index]))
  const position = (id: string) => order.get(id) ?? Number.MAX_SAFE_INTEGER
  scored.sort((a, b) => position(a.questionId) - position(b.questionId) || b.score - a.score)
  let place = 0
  scored.forEach((entry, index) => {
    const previous = scored[index - 1]
    if (!previous || previous.questionId !== entry.questionId) place = 0
    place++
    entry.rank = previous && previous.questionId === entry.questionId && previous.score === entry.score
      ? previous.rank
      : place
  })
  return scored
}

// Deterministic per-voter shuffle, so each person sees a stable order across
// reloads while no single photo always sits at the top of everyone's gallery.
export function voterOrder<T extends { id: string }>(items: T[], seed: string) {
  const weight = (id: string) => {
    let h = 2166136261
    for (const char of `${seed}:${id}`) {
      h ^= char.charCodeAt(0)
      h = Math.imul(h, 16777619)
    }
    return h >>> 0
  }
  return [...items].sort((a, b) => weight(a.id) - weight(b.id))
}

// Move an entry's object to the restorable trash once nothing references it
// any more. Keys are content-addressed, so the same photo may still back
// another entry, a collection submission or an album — the reference check
// runs after the caller's row is gone so that row is not a reason to keep it.
export async function trashIfUnreferenced(key: string, deletedByName: string) {
  const references = await getR2DeleteReferences([key])
  const info = references.get(key)
  if (info && isR2DeleteReferenced(info)) return false
  const head = await blob.head(key).catch(() => null)
  await addToR2Trash([{
    key,
    contentType: head?.contentType ?? null,
    size: head?.size ?? null,
    referenced: false,
    deletedByName
  }])
  return true
}

// Shared guard for presign/complete: the session must be a competition
// session owned by this participant and bound to this question's prefix.
export async function requireCompetitionUploadItem(
  event: H3Event,
  competition: Competition,
  question: CompetitionQuestion,
  participant: CompetitionParticipant
) {
  const session = await getUploadSession(getRouterParam(event, 'sessionId') || '')
  if (!session) throw createError({ statusCode: 404, message: 'ไม่พบรอบการอัปโหลด' })
  if (session.kind !== 'competition' || session.contributorId !== participant.id) {
    throw createError({ statusCode: 403, message: 'รอบการอัปโหลดนี้ไม่ใช่ของคุณ' })
  }
  if (session.prefix !== sanitizeUploadPrefix(competitionPrefix(competition.id, participant.id, question.id))) {
    throw createError({ statusCode: 403, message: 'รอบการอัปโหลดนี้ไม่ตรงกับการแข่งขัน' })
  }
  const itemId = decodeUploadItemId(getRouterParam(event, 'itemId') || '')
  const item = session.items.find(entry => entry.id === itemId)
  if (!item) throw createError({ statusCode: 404, message: 'ไม่พบไฟล์ในรอบนี้' })
  return { session, item }
}
