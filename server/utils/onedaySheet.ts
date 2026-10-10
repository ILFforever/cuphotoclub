import { eq } from 'drizzle-orm'
import type {
  Bi, OnedayAp, OnedayControl, OnedayDay, OnedayItem, OnedayKind, OnedayLevel, OnedaySyncStatus, OnedaySyncWarning
} from '~~/shared/oneday2026'
import {
  ONEDAY_DEFAULT_CONTROL, ONEDAY_FALLBACK_ITEMS, ONEDAY_KINDS, ONEDAY_TABS, toMinutes
} from '~~/shared/oneday2026'

// Live AP for Basic Control & One Day Trip 2026, read from the planning sheet.
//
// The workbook is shared "anyone with the link", and it also holds participant
// contact and medical tabs. So:
//   • the sheet ID only ever comes from the server-only `onedaySheetId` runtime
//     config (NUXT_ONEDAY_SHEET_ID). It is never sent to the browser, never put
//     in an error message, and must never be committed (the repo is public).
//   • only the two tabs in ONEDAY_TABS are requested, and only whitelisted
//     columns are copied out. Nothing else from the workbook leaves this file.
//
// Google's gviz endpoint silently returns the FIRST tab when the named tab
// doesn't exist, so every fetch checks the header row before trusting it.
//
// The last good parse is kept in the `settings` table (D1, not KV — KV writes
// are capped at 1,000/day on the free plan). Pages read through getOnedayAp(),
// which re-syncs at most once a minute.

const SETTINGS_KEY = 'oneday2026.ap'
const AUTO_SYNC_MS = 60_000
const MANUAL_SYNC_MIN_MS = 10_000
const FETCH_TIMEOUT_MS = 8_000

interface Stored {
  items: OnedayItem[] | null
  control: OnedayControl | null
  syncedAt: string | null
  lastAttemptAt: string | null
  error: string | null
  errorTab: string | null
  warnings: OnedaySyncWarning[]
}

const EMPTY: Stored = {
  items: null, control: null, syncedAt: null, lastAttemptAt: null, error: null, errorTab: null, warnings: []
}

class SheetError extends Error {
  constructor(public code: string, public tab: string | null = null) {
    super(code)
  }
}

// ── CSV ──────────────────────────────────────────────────────────────────────

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') {
      quoted = true
    } else if (c === ',') {
      row.push(cell); cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else {
      cell += c
    }
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows
}

// Sheets may turn "07:30" into a time value, which gviz then prints as
// "7:30:00" or "7:30:00 AM". Accept all of those.
export function parseTime(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*(am|pm)?$/i)
  if (!m) return null
  let h = Number(m[1])
  const min = Number(m[2])
  const ampm = m[3]?.toLowerCase()
  if (ampm === 'pm' && h < 12) h += 12
  if (ampm === 'am' && h === 12) h = 0
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

function truthy(raw: string): boolean {
  return /^(true|yes|y|1|x|✓|ใช่)$/i.test(raw.trim())
}

function headerIndex(header: string[]): Map<string, number> {
  const map = new Map<string, number>()
  header.forEach((h, i) => map.set(h.trim().toLowerCase(), i))
  return map
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

export function parseApRows(rows: string[][]) {
  const [header = [], ...body] = rows
  const col = headerIndex(header)
  for (const required of ['day', 'start', 'type', 'title_th']) {
    if (!col.has(required)) throw new SheetError('tab-missing', ONEDAY_TABS.ap)
  }
  const get = (r: string[], name: string) => {
    const i = col.get(name)
    return i == null ? '' : (r[i] ?? '').trim()
  }
  const bi = (r: string[], base: string): Bi => {
    const th = get(r, `${base}_th`)
    return { th, en: get(r, `${base}_en`) || th }
  }

  const items: OnedayItem[] = []
  const warnings: OnedaySyncWarning[] = []
  body.forEach((r, i) => {
    const rowNo = i + 2 // 1-based, after the header
    if (r.every(c => !c.trim())) return
    const warn = (code: string, value = '') => warnings.push({ tab: ONEDAY_TABS.ap, row: rowNo, code, value })

    const day = get(r, 'day').toLowerCase()
    if (day !== 'bc' && day !== 'odt') return warn('day', get(r, 'day'))
    const start = parseTime(get(r, 'start'))
    if (!start) return warn('start', get(r, 'start'))
    const endRaw = get(r, 'end')
    const end = endRaw ? parseTime(endRaw) : null
    if (endRaw && !end) return warn('end', endRaw)
    if (end && toMinutes(end) < toMinutes(start)) return warn('endBeforeStart', `${start}–${end}`)
    const kind = get(r, 'type').toLowerCase() as OnedayKind
    if (!ONEDAY_KINDS.includes(kind)) return warn('type', get(r, 'type'))
    const roundRaw = get(r, 'round')
    const round = roundRaw ? Number(roundRaw) : null
    if (round != null && !(Number.isInteger(round) && round >= 1 && round <= 5)) return warn('round', roundRaw)
    if (kind === 'round' && round == null) return warn('roundMissing')
    const title = bi(r, 'title')
    if (!title.th && round == null) return warn('title')

    items.push({
      day: day as OnedayDay,
      start,
      end,
      kind,
      round,
      staffOnly: truthy(get(r, 'staff_only')),
      title,
      detail: bi(r, 'detail'),
      place: bi(r, 'place'),
      warning: bi(r, 'warning'),
      owner: get(r, 'owner'),
      kit: get(r, 'kit'),
      staffNote: get(r, 'staff_note')
    })
  })
  items.sort((a, b) => a.day.localeCompare(b.day) || toMinutes(a.start) - toMinutes(b.start))
  return { items, warnings }
}

// The Live Control tab is one column per setting with the values in row 2.
// (A key/value layout also parses, but gviz types each column by its majority,
// so a value column mixing "0" and "info" can come back with cells blanked.)
export function parseControlRows(rows: string[][]) {
  const [header = [], ...body] = rows
  const col = headerIndex(header)
  const values = new Map<string, string>()
  if (col.has('delay_minutes')) {
    const r = body[0] ?? []
    for (const [name, i] of col) values.set(name, (r[i] ?? '').trim())
  } else if (col.has('key') && col.has('value')) {
    for (const r of body) {
      const k = (r[col.get('key')!] ?? '').trim().toLowerCase()
      if (k) values.set(k, (r[col.get('value')!] ?? '').trim())
    }
  } else {
    throw new SheetError('tab-missing', ONEDAY_TABS.control)
  }
  const warnings: OnedaySyncWarning[] = []
  const warn = (code: string, value = '') => warnings.push({ tab: ONEDAY_TABS.control, row: 0, code, value })

  const delayRaw = values.get('delay_minutes') ?? ''
  let delayMinutes = delayRaw ? Number(delayRaw) : 0
  if (!Number.isFinite(delayMinutes) || Math.abs(delayMinutes) > 240) {
    warn('delay', delayRaw)
    delayMinutes = 0
  }
  const fromRaw = values.get('delay_from') ?? ''
  const delayFrom = fromRaw ? parseTime(fromRaw) : null
  if (fromRaw && !delayFrom) warn('delayFrom', fromRaw)
  const levelRaw = (values.get('announcement_level') ?? '').toLowerCase()
  const level: OnedayLevel = levelRaw === 'warn' || levelRaw === 'crit' ? levelRaw : 'info'
  if (levelRaw && level === 'info' && levelRaw !== 'info') warn('level', levelRaw)
  const th = values.get('announcement_th') ?? ''

  const control: OnedayControl = {
    delayMinutes: Math.round(delayMinutes),
    delayFrom,
    announcement: { th, en: values.get('announcement_en') || th },
    announcementLevel: level
  }
  return { control, warnings }
}

async function fetchTab(sheetId: string, tab: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(tab)}`
  let res: Response
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'follow' })
  } catch {
    throw new SheetError('unreachable', tab)
  }
  const type = res.headers.get('content-type') || ''
  // A workbook that isn't link-shared answers with a sign-in page (HTML).
  if (res.status === 401 || res.status === 403 || type.includes('text/html')) throw new SheetError('not-shared', tab)
  if (!res.ok) throw new SheetError('unreachable', tab)
  return parseCsv(await res.text())
}

// ── Store ────────────────────────────────────────────────────────────────────

async function readStored(): Promise<Stored> {
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, SETTINGS_KEY)).limit(1)
  const value = row?.value as Partial<Stored> | undefined
  return { ...EMPTY, ...(value && typeof value === 'object' ? value : {}) }
}

async function writeStored(value: Stored) {
  await db
    .insert(schema.settings)
    .values({ key: SETTINGS_KEY, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: new Date() } })
}

function statusOf(s: Stored, configured: boolean): OnedaySyncStatus {
  return {
    configured,
    ok: !s.error && !!s.items,
    error: s.error,
    errorTab: s.errorTab,
    warnings: s.warnings,
    itemCount: s.items?.length ?? 0,
    syncedAt: s.syncedAt,
    lastAttemptAt: s.lastAttemptAt
  }
}

function sheetId(): string {
  return String(useRuntimeConfig().onedaySheetId || '').trim()
}

// One sync per isolate at a time; concurrent callers share it.
let inflight: Promise<Stored> | null = null

async function runSync(): Promise<Stored> {
  const prev = await readStored()
  const id = sheetId()
  const now = new Date().toISOString()
  // Claim this minute before fetching, so other isolates that read the row
  // while the sheet is loading skip their own sync instead of piling on.
  await writeStored({ ...prev, lastAttemptAt: now })
  if (!id) {
    const next = { ...prev, lastAttemptAt: now, error: 'not-configured', errorTab: null, warnings: [] }
    await writeStored(next)
    return next
  }
  try {
    const [apRows, controlRows] = await Promise.all([
      fetchTab(id, ONEDAY_TABS.ap),
      fetchTab(id, ONEDAY_TABS.control)
    ])
    const ap = parseApRows(apRows)
    const ctl = parseControlRows(controlRows)
    if (!ap.items.length) throw new SheetError('no-rows', ONEDAY_TABS.ap)
    const next: Stored = {
      items: ap.items,
      control: ctl.control,
      syncedAt: now,
      lastAttemptAt: now,
      error: null,
      errorTab: null,
      warnings: [...ap.warnings, ...ctl.warnings]
    }
    await writeStored(next)
    return next
  } catch (err) {
    // Keep the last good copy; record why this attempt failed.
    const code = err instanceof SheetError ? err.code : 'unreachable'
    const tab = err instanceof SheetError ? err.tab : null
    const next = { ...prev, lastAttemptAt: now, error: code, errorTab: tab, warnings: [] }
    await writeStored(next)
    return next
  }
}

function sync(): Promise<Stored> {
  if (!inflight) inflight = runSync().finally(() => { inflight = null })
  return inflight
}

function ageMs(iso: string | null): number {
  return iso ? Date.now() - new Date(iso).getTime() : Infinity
}

export async function getOnedayAp({ sync: allowSync = true } = {}): Promise<OnedayAp> {
  let stored = await readStored()
  if (allowSync && ageMs(stored.lastAttemptAt) > AUTO_SYNC_MS) {
    try { stored = await sync() } catch { /* serve what we have */ }
  }
  return {
    items: stored.items ?? ONEDAY_FALLBACK_ITEMS,
    control: stored.control ?? ONEDAY_DEFAULT_CONTROL,
    source: stored.items ? 'sheet' : 'bundled',
    syncedAt: stored.syncedAt
  }
}

export async function getOnedaySyncStatus(): Promise<OnedaySyncStatus> {
  return statusOf(await readStored(), !!sheetId())
}

// "Sync now". Open to anyone with the link: it can only re-read the sheet, so
// the only guard needed is a floor between real fetches.
export async function syncOnedayNow(): Promise<OnedaySyncStatus> {
  const stored = await readStored()
  if (ageMs(stored.lastAttemptAt) < MANUAL_SYNC_MIN_MS) {
    return { ...statusOf(stored, !!sheetId()), throttled: true }
  }
  return statusOf(await sync(), !!sheetId())
}
