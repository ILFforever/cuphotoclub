// Basic Control & One Day Trip 2026 — a temporary event (10–11 Oct 2026).
//
// The live schedule ("AP") is read from two tabs of the planning Google Sheet,
// `Live AP` and `Live Control` (server/utils/onedaySheet.ts). Everything here is
// shared by the server parser and the two pages:
//   • the row/column contract for those tabs,
//   • the workshop stations + group rotation (fixed, so kept in code),
//   • ONEDAY_FALLBACK_ITEMS — the AP as of 22 Sep, served when the sheet has
//     never synced or can't be read, so the live page is never empty.
//
// Staff phone numbers for the contacts page come from the planning sheet's
// `จัดกลุ่ม` tab (two columns only). They never go into this file: the repo is
// public.
//
// To take the event down: delete this file, server/utils/onedaySheet.ts,
// server/api/events/oneday-2026/, app/pages/events/oneday-2026/,
// app/composables/useOneday.ts, the `oneday` i18n keys, the `onedaySheetId`
// runtime config entry and the `/events/` branch in layouts/contribute.vue.

export type OnedayDay = 'bc' | 'odt'
export type OnedayKind =
  | 'prep' | 'reg' | 'talk' | 'break' | 'brief' | 'walk' | 'round'
  | 'board' | 'depart' | 'travel' | 'shoot' | 'end'

export const ONEDAY_KINDS: OnedayKind[] = [
  'prep', 'reg', 'talk', 'break', 'brief', 'walk', 'round',
  'board', 'depart', 'travel', 'shoot', 'end'
]

export interface Bi { th: string, en: string }

export interface OnedayItem {
  day: OnedayDay
  start: string // HH:MM, Bangkok time
  end: string | null // null → a point in time (a departure, an arrival)
  kind: OnedayKind
  // Workshop round (1–5) on `round` rows and the `walk` rows leading to them.
  // The page resolves the station from the viewer's group.
  round: number | null
  staffOnly: boolean
  title: Bi
  detail: Bi
  place: Bi
  warning: Bi
  owner: string
  kit: string
  staffNote: string // shown on the staff view only
}

export type OnedayLevel = 'info' | 'warn' | 'crit'

export interface OnedayControl {
  delayMinutes: number
  // Items starting at or after this time are pushed back. null → the whole day.
  delayFrom: string | null
  announcement: Bi
  announcementLevel: OnedayLevel
}

export interface OnedayAp {
  items: OnedayItem[]
  control: OnedayControl
  source: 'sheet' | 'bundled'
  syncedAt: string | null
}

// A row the parser skipped (or a control value it ignored). `code` is an i18n
// key under oneday.sync.warn; `value` is the offending cell.
export interface OnedaySyncWarning {
  tab: string
  row: number // 1-based sheet row; 0 for the Live Control tab
  code: string
  value: string
}

export interface OnedaySyncStatus {
  configured: boolean
  ok: boolean
  error: string | null // a code: not-configured | unreachable | not-shared | tab-missing | no-rows
  errorTab: string | null
  warnings: OnedaySyncWarning[]
  itemCount: number
  staffPhoneCount: number
  syncedAt: string | null
  lastAttemptAt: string | null
  throttled?: boolean
}

export const ONEDAY_TABS = { ap: 'Live AP', control: 'Live Control', staff: 'จัดกลุ่ม' } as const

// The only two columns read from the `จัดกลุ่ม` tab: group leader nickname and
// their phone. That tab also holds participants' phones and medical notes, in
// other columns — those are never read. The tab is only trusted when both
// headers are present (gviz answers a missing tab with the FIRST tab).
export const ONEDAY_STAFF_COLUMNS = ['พี่กลุ่ม', 'เบอร์พี่กลุ่ม'] as const

// Staff phone numbers by nickname, served to the contacts page.
export interface OnedayContacts {
  phones: Record<string, string>
  source: 'sheet' | 'none'
  syncedAt: string | null
}

// Column order of the `Live AP` tab. The parser matches by header name, so
// columns can be reordered in the sheet; these are the names it looks for.
export const ONEDAY_AP_COLUMNS = [
  'day', 'start', 'end', 'type', 'round', 'staff_only',
  'title_th', 'title_en', 'detail_th', 'detail_en',
  'place_th', 'place_en', 'warning_th', 'warning_en',
  'owner', 'kit', 'staff_note'
] as const

export const ONEDAY_CONTROL_KEYS = [
  'delay_minutes', 'delay_from', 'announcement_th', 'announcement_en', 'announcement_level'
] as const

export const ONEDAY_DAYS: Record<OnedayDay, { date: string, name: Bi, place: Bi }> = {
  bc: { date: '2026-10-10', name: { th: 'Basic Control', en: 'Basic Control' }, place: { th: 'จุฬาลงกรณ์มหาวิทยาลัย', en: 'Chulalongkorn University' } },
  odt: { date: '2026-10-11', name: { th: 'One Day Trip', en: 'One Day Trip' }, place: { th: 'ชลบุรี', en: 'Chonburi' } }
}

export interface OnedayStation { n: number, name: string, place: Bi, hosts: string }

export const ONEDAY_STATIONS: OnedayStation[] = [
  { n: 1, name: 'Macro', place: { th: 'พิพิธภัณฑ์พืช คณะวิทยาศาสตร์', en: 'Plant Museum, Faculty of Science' }, hosts: 'ปิง, น็อป' },
  { n: 2, name: 'Flash', place: { th: 'ลานจักรพงษ์', en: 'Chakrabongse lawn' }, hosts: 'ตง, แฮม' },
  { n: 3, name: 'Shutter Speed', place: { th: 'หอนาฬิกาและลานวิศวะใหม่', en: 'Clock tower & new Engineering plaza' }, hosts: 'ปอนด์, บูม' },
  { n: 4, name: 'Landscape', place: { th: 'ลานบรม', en: 'Borom plaza' }, hosts: 'วีร์, เท็น' },
  { n: 5, name: 'Portrait', place: { th: 'เทวาลัย (ด้านใน)', en: 'Thewalai (inside)' }, hosts: 'ไม้, นุ่น' }
]

// ONEDAY_ROTATION[group - 1][round - 1] → station number
export const ONEDAY_ROTATION: number[][] = [
  [1, 2, 4, 5, 3],
  [2, 4, 5, 3, 1],
  [3, 1, 2, 4, 5],
  [4, 5, 3, 1, 2],
  [5, 3, 1, 2, 4]
]

export function stationFor(group: number, round: number): OnedayStation | null {
  const n = ONEDAY_ROTATION[group - 1]?.[round - 1]
  return n ? ONEDAY_STATIONS[n - 1] ?? null : null
}

// Staff directory — nicknames only, spelled as in the sheet's `จัดกลุ่ม` tab,
// whose phone numbers are matched to these names at runtime.
export const ONEDAY_GROUP_LEADERS: string[][] = [
  ['ไม้', 'แพรรี่', 'ปอนด์', 'ปิง', 'กันต์'],
  ['แฮมมี่', 'นิก', 'ภัทร', 'วีร์', 'ไนท์'],
  ['น้อบ', 'อัย', 'คริส', 'เอิง', 'โอ'],
  ['เควิน', 'บูม', 'เท็น', 'แพง', 'แฮรี่'],
  ['ตง', 'ฟินิกส์', 'นุ่น', 'ภู', 'โชกุน']
]

export const ONEDAY_STAFF_ROLES: { role: Bi, names: string }[] = [
  { role: { th: 'พยาบาล', en: 'First aid' }, names: 'ปิง, โชกุน, อัย, โอ' },
  { role: { th: 'ประธาน / รองประธาน', en: 'President / vice president' }, names: 'ไม้, ตง' },
  { role: { th: 'ทะเบียน', en: 'Registration' }, names: 'เอิง, เควิน, ภัทร' },
  { role: { th: 'สวัสดิการ (อาหาร น้ำ)', en: 'Welfare (food, water)' }, names: 'บูม, วีร์, เท็น' },
  { role: { th: 'สถานที่', en: 'Venue' }, names: 'ปอนด์, กันต์, คริส' },
  { role: { th: 'MC', en: 'MC' }, names: 'ภู, ฟินิกส์' },
  { role: { th: 'Lecturer', en: 'Lecturers' }, names: 'ไม้, ภู, สมาร์ท' },
  { role: { th: 'PR', en: 'PR' }, names: 'นุ่น, แพง, แฮรี่' }
]

export function splitNames(names: string): string[] {
  return names.split(',').map(n => n.trim()).filter(Boolean)
}

// Every staff nickname, in group order, then anyone who is only in a role.
// Phone numbers from the sheet are only kept for these names.
export const ONEDAY_STAFF_NAMES: string[] = [...new Set([
  ...ONEDAY_GROUP_LEADERS.flat(),
  ...ONEDAY_STAFF_ROLES.flatMap(r => splitNames(r.names))
])]

// Sunday's bus route, in order, as Google Maps search terms.
export const ONEDAY_TRIP_ROUTE = [
  'Mahamakut Building, Chulalongkorn University',
  'Khao Kheow Open Zoo',
  'Institute of Marine Science, Burapha University',
  'Bangsaen Beach',
  'Mahamakut Building, Chulalongkorn University'
]

export const ONEDAY_STOPS: { time: string, name: Bi, note: Bi, map: string }[] = [
  {
    time: '06:30',
    name: { th: 'อาคารมหามกุฏ', en: 'Mahamakut Building' },
    note: { th: 'ลงทะเบียนและขึ้นรถที่จุฬาฯ รถออก 07:30', en: 'Registration and bus pickup at Chula. The bus leaves at 07:30.' },
    map: 'https://www.google.com/maps/search/?api=1&query=Mahamakut+Building+Chulalongkorn+University'
  },
  {
    time: '09:30',
    name: { th: 'สวนสัตว์เปิดเขาเขียว', en: 'Khao Kheow Open Zoo' },
    note: { th: 'นั่ง Tram 1 รอบ แล้วเดินถ่ายภาพเป็นกลุ่ม อยู่ในโซนสีเขียว–เหลืองเท่านั้น', en: 'One tram loop, then shoot in groups. Green and yellow zones only.' },
    map: 'https://www.google.com/maps/search/?api=1&query=Khao+Kheow+Open+Zoo'
  },
  {
    time: '13:30',
    name: { th: 'อควาเรียมบางแสน', en: 'Bangsaen Aquarium' },
    note: { th: 'อยู่ในสถาบันวิทยาศาสตร์ทางทะเล ม.บูรพา ระวังการใช้ไฟ continuous และแฟลช', en: 'Institute of Marine Science, Burapha University. Careful with continuous lights and flash.' },
    map: 'https://www.google.com/maps/search/?api=1&query=Institute+of+Marine+Science+Burapha+University'
  },
  {
    time: '16:15',
    name: { th: 'ชายหาดบางแสน', en: 'Bangsaen Beach' },
    note: { th: 'ลงรถและขึ้นรถที่วงเวียนหาดบางแสน หาข้าวเย็นกินเอง', en: 'Drop-off and pickup at the Bangsaen roundabout. Dinner on your own.' },
    map: 'https://www.google.com/maps/search/?api=1&query=Bangsaen+Beach+roundabout'
  }
]

export const ONEDAY_DEFAULT_CONTROL: OnedayControl = {
  delayMinutes: 0,
  delayFrom: null,
  announcement: { th: '', en: '' },
  announcementLevel: 'info'
}

// ── Time helpers ─────────────────────────────────────────────────────────────

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

export function fromMinutes(min: number): string {
  const m = ((min % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

// The event runs on Bangkok time (UTC+7, no DST) whatever the phone's timezone.
export function bangkokNow(at = Date.now()): { date: string, minutes: number, seconds: number } {
  const d = new Date(at + 7 * 3600_000)
  return {
    date: d.toISOString().slice(0, 10),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
    seconds: d.getUTCSeconds()
  }
}

// ── Bundled copy of the AP (planning sheet + AP files, updated 22 Sep) ───────

const LECT: Bi = { th: 'ห้อง Lecture', en: 'Lecture room' }
const MAHA: Bi = { th: 'อาคารมหามกุฏ', en: 'Mahamakut Building' }
const ZOO: Bi = { th: 'สวนสัตว์เปิดเขาเขียว', en: 'Khao Kheow Open Zoo' }
const AQ: Bi = { th: 'สถาบันวิทยาศาสตร์ทางทะเล ม.บูรพา', en: 'Institute of Marine Science, Burapha University' }
const BEACH: Bi = { th: 'วงเวียนหาดบางแสน', en: 'Bangsaen roundabout' }
const NONE: Bi = { th: '', en: '' }

type Seed = Partial<OnedayItem> & Pick<OnedayItem, 'day' | 'start' | 'kind'>

function item(s: Seed): OnedayItem {
  return {
    end: null, round: null, staffOnly: false,
    title: NONE, detail: NONE, place: NONE, warning: NONE, owner: '', kit: '', staffNote: '',
    ...s
  }
}

const WORKSHOP_ROUNDS: [string, string][] = [
  ['13:25', '13:45'], ['13:55', '14:15'], ['14:25', '14:45'], ['14:55', '15:15'], ['15:25', '15:45']
]

export const ONEDAY_FALLBACK_ITEMS: OnedayItem[] = [
  // ── 10 Oct · Basic Control ──
  item({ day: 'bc', start: '08:00', end: '08:45', kind: 'prep', staffOnly: true, title: { th: 'สตาฟเช็คสถานที่', en: 'Staff venue check' }, detail: { th: 'เตรียมสื่อและอุปกรณ์', en: 'Set up slides and equipment' }, place: LECT, owner: 'สตาฟทุกคน', kit: 'สื่อ, อุปกรณ์' }),
  item({ day: 'bc', start: '08:30', end: '09:00', kind: 'reg', title: { th: 'ลงทะเบียน', en: 'Registration' }, detail: { th: 'รับป้ายชื่อและเลขกลุ่ม', en: 'Collect your name tag and group number' }, place: LECT, owner: 'เควิ่น, เอิง, ภัทร', kit: 'ป้ายชื่อ, ใบลงทะเบียน' }),
  item({ day: 'bc', start: '09:00', end: '09:15', kind: 'talk', title: { th: 'Welcome / Introduction', en: 'Welcome / Introduction' }, place: LECT, owner: 'ฟีนิกซ์' }),
  item({ day: 'bc', start: '09:15', end: '09:35', kind: 'talk', title: { th: 'ประวัติ วิวัฒนาการ และหลักการทำงานของกล้อง', en: 'How cameras evolved and how they work' }, place: LECT, owner: 'ภู' }),
  item({ day: 'bc', start: '09:35', end: '10:15', kind: 'talk', title: { th: 'Camera Control', en: 'Camera Control' }, detail: { th: 'Aperture / Shutter / ISO / Focus / WB + Demo', en: 'Aperture / Shutter / ISO / Focus / WB + demo' }, place: LECT, owner: 'ไม้' }),
  item({ day: 'bc', start: '10:15', end: '10:25', kind: 'talk', title: { th: 'ถ่ายภาพด้วยมือถือ', en: 'Phone photography' }, detail: { th: 'Grid / RAW / Leica LUX / Dazz Cam', en: 'Grid / RAW / Leica LUX / Dazz Cam' }, place: LECT, owner: 'ไม้' }),
  item({ day: 'bc', start: '10:25', end: '10:35', kind: 'break', title: { th: 'พักเบรก', en: 'Break' } }),
  item({ day: 'bc', start: '10:35', end: '11:15', kind: 'talk', title: { th: 'Landscape mindset', en: 'Landscape mindset' }, detail: { th: 'การวางองค์ประกอบ และแชร์ประสบการณ์', en: 'Composition, plus stories from the field' }, place: LECT, owner: 'สมาร์ท' }),
  item({ day: 'bc', start: '11:15', end: '11:35', kind: 'talk', title: { th: 'การเลือกใช้อุปกรณ์และมุมมอง', en: 'Choosing gear and finding your angle' }, place: LECT, owner: 'ไม้' }),
  item({ day: 'bc', start: '11:35', end: '11:45', kind: 'talk', title: { th: 'มารยาทในการถ่ายภาพสัตว์', en: 'Etiquette for photographing animals' }, place: LECT, owner: 'ฟีนิกซ์' }),
  item({ day: 'bc', start: '11:45', end: '12:00', kind: 'talk', title: { th: 'Quiz + นัดหมายช่วงบ่าย', en: 'Quiz + afternoon briefing' }, place: LECT, owner: 'ฟีนิกซ์' }),
  item({ day: 'bc', start: '12:00', end: '13:00', kind: 'break', title: { th: 'พักกลางวัน', en: 'Lunch break' }, place: MAHA }),
  item({ day: 'bc', start: '13:00', end: '13:15', kind: 'brief', title: { th: 'รวมตัว แบ่งกลุ่ม และบรีฟ Workshop', en: 'Regroup and workshop briefing' }, place: LECT, owner: 'ภู' , staffNote: 'ระหว่างบรีฟ พี่ประจำฐานแยกไปเตรียมฐาน' }),
  ...WORKSHOP_ROUNDS.flatMap(([s, e], i) => [
    item({ day: 'bc', start: i === 0 ? '13:15' : WORKSHOP_ROUNDS[i - 1]![1], end: s, kind: 'walk', round: i + 1, owner: 'สตาฟกลุ่ม' }),
    item({ day: 'bc', start: s, end: e, kind: 'round', round: i + 1, owner: 'พี่ประจำฐาน' })
  ]),
  item({ day: 'bc', start: '15:45', end: '16:00', kind: 'walk', title: { th: 'กลับมารวมตัวที่ห้อง Lecture', en: 'Head back to the lecture room' }, place: LECT, owner: 'สตาฟกลุ่ม' }),
  item({ day: 'bc', start: '16:00', end: '16:15', kind: 'end', title: { th: 'นัดหมาย One Day Trip และแยกย้าย', en: 'One Day Trip briefing, then home' }, detail: { th: 'คืนป้ายชื่อและทำแบบประเมิน', en: 'Return your name tag and fill in the feedback form' }, place: LECT, owner: 'ภู' , staffNote: 'เก็บป้ายชื่อคืน และให้น้องทำแบบประเมิน' }),

  // ── 11 Oct · One Day Trip ──
  item({ day: 'odt', start: '06:00', end: '06:30', kind: 'prep', staffOnly: true, title: { th: 'สตาฟรวมตัวและเตรียมของ', en: 'Staff call and setup' }, detail: { th: 'น้ำ อาหาร ขนม และโต๊ะลงทะเบียน', en: 'Water, food, snacks, registration table' }, place: MAHA, owner: 'สวัสดิการ, ทะเบียน', kit: 'น้ำ, อาหาร, ขนม, ใบเช็คชื่อ, ป้ายชื่อ, ปากกา' }),
  item({ day: 'odt', start: '06:30', end: '07:15', kind: 'reg', title: { th: 'ลงทะเบียน', en: 'Registration' }, detail: { th: 'เช็คชื่อและจับคู่ Buddy Budder', en: 'Check in and get your Buddy Budder' }, place: MAHA, owner: 'ทะเบียน', kit: 'ใบเช็คชื่อสตาฟ + ผู้เข้าร่วม' , staffNote: 'จับคู่ Buddy Budder ตอนลงทะเบียนเลย' }),
  item({ day: 'odt', start: '07:15', end: '07:30', kind: 'board', title: { th: 'ขึ้นรถ', en: 'Board the bus' }, place: MAHA, staffNote: 'นับจำนวนน้องให้ครบก่อนรถออก' }),
  item({ day: 'odt', start: '07:30', kind: 'depart', title: { th: 'รถออกจากจุฬาฯ', en: 'Bus leaves Chula' }, warning: { th: 'รถรอคนมาสายได้ไม่เกิน 10 นาที', en: 'We wait 10 minutes at most for latecomers' } , staffNote: 'รอไม่เกิน 10 นาที เน้นย้ำ เวลาไม่ทัน' }),
  item({ day: 'odt', start: '07:30', end: '09:30', kind: 'travel', title: { th: 'เดินทางไปสวนสัตว์เปิดเขาเขียว', en: 'Ride to Khao Kheow Open Zoo' }, detail: { th: 'ชี้แจงกิจกรรม เควส และการประกวดภาพถ่าย', en: 'Briefing on quests and the photo contest' }, owner: 'MC' }),
  item({ day: 'odt', start: '09:30', end: '12:15', kind: 'shoot', title: ZOO, detail: { th: 'นั่ง Tram 1 รอบ แล้วเดินถ่ายภาพเป็นกลุ่มกับพี่กลุ่ม', en: 'One tram loop, then shoot in groups with your group leader' }, place: ZOO, warning: { th: 'อยู่ในโซนสีเขียว–เหลืองเท่านั้น', en: 'Stay inside the green and yellow zones' }, owner: 'All Staff', kit: 'ตั๋ว Tram' , staffNote: 'สตาฟรับตั๋ว Tram แล้วแจกน้องก่อนเข้าสวนสัตว์' }),
  item({ day: 'odt', start: '12:15', end: '12:30', kind: 'board', title: { th: 'ขึ้นรถ', en: 'Board the bus' }, place: ZOO, staffNote: 'นับจำนวนน้องให้ครบก่อนรถออก' }),
  item({ day: 'odt', start: '12:30', kind: 'depart', title: { th: 'รถออกจากเขาเขียว', en: 'Bus leaves the zoo' } }),
  item({ day: 'odt', start: '12:30', end: '13:30', kind: 'travel', title: { th: 'เดินทางไปอควาเรียมบางแสน', en: 'Ride to Bangsaen Aquarium' }, detail: { th: 'กินข้าวเที่ยงบนรถ', en: 'Lunch is served on the bus' }, owner: 'สวัสดิการ', kit: 'ข้าวเที่ยง' , staffNote: 'แจกข้าวเที่ยงบนรถ' }),
  item({ day: 'odt', start: '13:30', end: '15:30', kind: 'shoot', title: { th: 'อควาเรียมบางแสน', en: 'Bangsaen Aquarium' }, detail: AQ, place: AQ, warning: { th: 'ระวังการใช้ไฟ continuous และแฟลช', en: 'Careful with continuous lights and flash' }, owner: 'All Staff' }),
  item({ day: 'odt', start: '15:30', end: '15:45', kind: 'board', title: { th: 'ขึ้นรถ', en: 'Board the bus' }, place: AQ, staffNote: 'นับจำนวนน้องให้ครบก่อนรถออก' }),
  item({ day: 'odt', start: '15:45', kind: 'depart', title: { th: 'รถออกจากอควาเรียม', en: 'Bus leaves the aquarium' } }),
  item({ day: 'odt', start: '15:45', end: '16:15', kind: 'travel', title: { th: 'เดินทางไปชายหาดบางแสน', en: 'Ride to Bangsaen Beach' } }),
  item({ day: 'odt', start: '16:15', end: '18:30', kind: 'shoot', title: { th: 'ชายหาดบางแสน', en: 'Bangsaen Beach' }, detail: { th: 'ลงรถที่วงเวียน แยกย้ายตามกลุ่ม และหาข้าวเย็นกินเอง', en: 'Drop-off at the roundabout. Groups split up; dinner on your own' }, place: BEACH, owner: 'All Staff' , staffNote: 'เฉลย Buddy Budder' }),
  item({ day: 'odt', start: '18:30', end: '18:40', kind: 'board', title: { th: 'ขึ้นรถที่วงเวียน', en: 'Board at the roundabout' }, place: BEACH, warning: { th: 'ห้ามสายเด็ดขาด รถจอดรอนานไม่ได้', en: 'Do not be late. The bus can\'t wait here.' }, staffNote: 'นับจำนวนน้องให้ครบ รถจอดรอที่วงเวียนไม่ได้' }),
  item({ day: 'odt', start: '18:40', end: '20:30', kind: 'travel', title: { th: 'เดินทางกลับจุฬาฯ', en: 'Ride back to Chula' }, detail: { th: 'ประกาศผลประกวดภาพถ่าย และเฉลย Buddy', en: 'Photo contest results and Buddy reveal' }, owner: 'MC' , staffNote: 'MC ประกาศผลประกวดภาพถ่ายและเฉลย Buddy' }),
  item({ day: 'odt', start: '20:30', kind: 'end', title: { th: 'ถึงจุฬาฯ', en: 'Arrive at Chula' }, place: MAHA })
]
