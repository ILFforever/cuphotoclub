import type { OnedayAp, OnedayDay, OnedayItem, OnedayStation } from '~~/shared/oneday2026'
import { ONEDAY_DAYS, ONEDAY_TRIP_ROUTE, bangkokNow, fromMinutes, stationFor, toMinutes } from '~~/shared/oneday2026'

// Shared by the temporary /events/oneday-2026 pages.

const POLL_MS = 30_000
const CLOCK_MS = 15_000

// The live AP, refreshed on mount, every 30 s and whenever the tab comes back
// into view. The mount refresh matters: the pages are edge-cached (swr in
// nuxt.config.ts), so the AP baked into the HTML can be a little old.
export function useOnedayAp() {
  // The server render reads the stored copy only (see the ap route).
  const res = useFetch<OnedayAp>('/api/events/oneday-2026/ap', {
    key: 'oneday-ap',
    query: import.meta.server ? { ssr: '1' } : undefined
  })
  if (import.meta.client) {
    let timer: ReturnType<typeof setInterval> | undefined
    const onVisible = () => { if (document.visibilityState === 'visible') res.refresh() }
    onMounted(() => {
      res.refresh()
      timer = setInterval(() => res.refresh(), POLL_MS)
      document.addEventListener('visibilitychange', onVisible)
    })
    onBeforeUnmount(() => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    })
  }
  return res
}

// Dev only: `?at=2026-10-11T09:45` starts the clock at that Bangkok time, so
// any moment of either day can be previewed. Ignored in production builds.
function devStartAt(): number | null {
  if (!import.meta.dev) return null
  const raw = useRoute().query.at
  const m = typeof raw === 'string' ? raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/) : null
  if (!m) return null
  return Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!) - 7 * 3600_000
}

// Epoch ms, seeded from the server render so hydration matches, then ticking.
export function useOnedayClock() {
  const startAt = devStartAt()
  const offset = startAt == null ? 0 : startAt - Date.now()
  const now = useState('oneday-now', () => Date.now() + offset)
  if (import.meta.client) {
    let timer: ReturnType<typeof setInterval> | undefined
    onMounted(() => {
      now.value = Date.now() + offset
      timer = setInterval(() => { now.value = Date.now() + offset }, CLOCK_MS)
    })
    onBeforeUnmount(() => clearInterval(timer))
  }
  return now
}

export type OnedayLang = 'th' | 'en'
export type OnedayStatus = 'done' | 'now' | 'upcoming'

export interface OnedayView extends OnedayItem {
  key: string
  startMin: number
  endMin: number
  shownStart: string
  shownEnd: string | null
  delayed: boolean
  text: { title: string, detail: string, place: string, warning: string }
  station: OnedayStation | null
  status: OnedayStatus
}

export interface OnedayDayView {
  day: OnedayDay
  relation: 'past' | 'today' | 'future'
  nowMin: number
  delayMinutes: number
  items: OnedayView[]
  current: OnedayView | null
  next: OnedayView | null
  phase: 'before' | 'during' | 'ended'
  busCall: { item: OnedayView, minutes: number, leavesAt: string } | null
}

// Which day the live page opens on: today if it's an event day, else the
// nearest one.
export function defaultOnedayDay(at: number): OnedayDay {
  const today = bangkokNow(at).date
  return today >= ONEDAY_DAYS.odt.date ? 'odt' : 'bc'
}

interface Labels { round: (n: number) => string, rotate: string, walkTo: (n: number, name: string) => string, walkNext: string }

export function buildOnedayDay(
  ap: OnedayAp,
  day: OnedayDay,
  opts: { at: number, lang: OnedayLang, group: number, staff: boolean, labels: Labels }
): OnedayDayView {
  const { lang, group, staff, labels } = opts
  const now = bangkokNow(opts.at)
  const date = ONEDAY_DAYS[day].date
  const relation = date < now.date ? 'past' : date > now.date ? 'future' : 'today'
  const nowMin = relation === 'past' ? 24 * 60 : relation === 'future' ? -1 : now.minutes

  // A delay set in the sheet only applies on the day it's set for — today.
  const ctl = ap.control
  const delay = relation === 'today' ? ctl.delayMinutes : 0
  const delayFrom = ctl.delayFrom ? toMinutes(ctl.delayFrom) : -1

  const items: OnedayView[] = ap.items
    .filter(i => i.day === day && (staff || !i.staffOnly))
    .map((i, idx) => {
      const rawStart = toMinutes(i.start)
      const rawEnd = i.end ? toMinutes(i.end) : rawStart
      const shift = delay && rawStart >= delayFrom ? delay : 0
      const station = i.round && group ? stationFor(group, i.round) : null
      let title = i.title[lang] || i.title.th
      let place = i.place[lang] || i.place.th
      if (i.kind === 'round' && i.round) {
        title = station ? `${labels.round(i.round)} · ${station.name}` : (title || `${labels.round(i.round)} · ${labels.rotate}`)
        if (station) place = station.place[lang]
      } else if (i.kind === 'walk' && i.round) {
        title = station ? labels.walkTo(station.n, station.name) : (title || labels.walkNext)
        if (station) place = station.place[lang]
      }
      return {
        ...i,
        key: `${day}-${idx}`,
        startMin: rawStart + shift,
        endMin: rawEnd + shift,
        shownStart: fromMinutes(rawStart + shift),
        shownEnd: i.end ? fromMinutes(rawEnd + shift) : null,
        delayed: shift !== 0,
        text: {
          title,
          detail: i.detail[lang] || i.detail.th,
          place,
          warning: i.warning[lang] || i.warning.th
        },
        station: i.kind === 'round' ? station : null,
        status: 'upcoming' as OnedayStatus
      }
    })
    .sort((a, b) => a.startMin - b.startMin)

  let current: OnedayView | null = null
  for (const i of items) if (i.end && i.startMin <= nowMin && nowMin < i.endMin) current = i
  const next = items.find(i => i.startMin > nowMin) ?? null
  for (const i of items) {
    if (i === current) i.status = 'now'
    else if ((i.end ? i.endMin : i.startMin + 1) <= nowMin) i.status = 'done'
  }

  const first = items[0]
  const last = items[items.length - 1]
  const phase = !first || nowMin < first.startMin ? 'before' : nowMin >= (last!.end ? last!.endMin : last!.startMin + 1) ? 'ended' : 'during'

  // Bus call: boarding now, or boarding starts within 30 minutes.
  let busCall: OnedayDayView['busCall'] = null
  const boarding = current?.kind === 'board'
    ? current
    : items.find(i => i.kind === 'board' && i.startMin > nowMin && i.startMin - nowMin <= 30)
  if (boarding && relation === 'today') {
    const depart = items.find(i => i.kind === 'depart' && i.startMin >= boarding.startMin && i.startMin <= boarding.endMin)
    busCall = {
      item: boarding,
      minutes: Math.max(0, boarding.startMin - nowMin),
      leavesAt: depart?.shownStart ?? boarding.shownEnd ?? boarding.shownStart
    }
  }

  return { day, relation, nowMin, delayMinutes: delay, items, current, next, phase, busCall }
}

// Sunday's route as Google Maps URLs. `open` hands off to the Maps app with
// live navigation; `embed` uses the keyed Embed API when the site has a key
// (same key as the contacts map) and the keyless embed otherwise.
export function onedayTripRouteUrls(embedKey: string) {
  const [origin, ...rest] = ONEDAY_TRIP_ROUTE
  const destination = rest[rest.length - 1]!
  const waypoints = rest.slice(0, -1)
  const enc = encodeURIComponent
  const open = `https://www.google.com/maps/dir/?api=1&origin=${enc(origin!)}&destination=${enc(destination)}`
    + `&waypoints=${enc(waypoints.join('|'))}&travelmode=driving`
  const embed = embedKey
    ? `https://www.google.com/maps/embed/v1/directions?key=${enc(embedKey)}&origin=${enc(origin!)}&destination=${enc(destination)}`
      + `&waypoints=${enc(waypoints.join('|'))}&mode=driving`
    : `https://www.google.com/maps?saddr=${enc(origin!)}&daddr=${[...waypoints, destination].map(enc).join('+to:')}&output=embed`
  return { open, embed }
}
